// zip 중앙 디렉터리 읽기 — fetch-attachment mode=unzip_drive 가 쓴다(2026-11-09 · 우편함 「코드·운영 — fetch-attachment unzip_drive 모드 …」 1 ·
//   #924 회신 3 꼴). Deno·Node 공통(전역 TextDecoder 만 쓴다) — 시험: node --experimental-strip-types supabase/functions/fetch-attachment/zip.test.mts
// 🔴 바이트를 통째로 받지 않는다 — 부르는 쪽이 파일 끝(EOCD) 몇 KB와 항목 하나의 압축 구간만 Range 로 받아 넘긴다.
// 거절(그 항목은 풀지 않는다): 암호화(일반 플래그 bit0) · zip64(크기·위치 0xFFFFFFFF 또는 항목 수 0xFFFF) · 방식 0(저장)·8(deflate) 밖 · 원래 크기 > 상한.
// 이름: UTF-8 플래그(bit11)가 있으면 UTF-8, 없으면 EUC-KR(CP949 — LH 자료) · 폴더 경로는 떼고 끝 이름만 쓴다(부르는 쪽).

export type ZipEntry = {
  index: number
  name: string
  utf8: boolean
  flags: number
  method: number
  crc32: number
  compressed: number
  size: number
  localHeaderOffset: number
  encrypted: boolean
  zip64: boolean
}

export type Eocd = { count: number; cdSize: number; cdOffset: number; zip64: boolean }

const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8)
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0

// EOCD 를 찾는 데 필요한 파일 끝 바이트 수(EOCD 22B + 주석 최대 65,535B).
export const EOCD_TAIL_BYTES = 22 + 65535

// tail = 파일 끝 바이트(길이 ≤ EOCD_TAIL_BYTES) → EOCD. 없으면 던진다.
export function findEocd(tail: Uint8Array): Eocd {
  for (let i = tail.length - 22; i >= 0; i--) {
    if (u32(tail, i) !== 0x06054b50) continue
    const commentLen = u16(tail, i + 20)
    if (i + 22 + commentLen !== tail.length) continue   // 주석 길이가 끝과 맞는 서명만(본문 안 우연한 서명 거름)
    const count = u16(tail, i + 10)
    const cdSize = u32(tail, i + 12)
    const cdOffset = u32(tail, i + 16)
    return { count, cdSize, cdOffset, zip64: count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff }
  }
  throw new Error('zip 끝 레코드(EOCD)를 찾지 못했다 — zip 이 아니거나 잘린 파일')
}

const decodeName = (raw: Uint8Array, utf8: boolean): string => {
  if (utf8) return new TextDecoder('utf-8').decode(raw)
  try { return new TextDecoder('euc-kr', { fatal: true }).decode(raw) } catch { /* 아래 */ }
  return new TextDecoder('utf-8').decode(raw)   // EUC-KR 로 안 읽히면 UTF-8(깨진 글자는 대체 문자)
}

// cd = 중앙 디렉터리 바이트 전부 → 항목 목록.
export function parseCentralDirectory(cd: Uint8Array, count: number): ZipEntry[] {
  const out: ZipEntry[] = []
  let o = 0
  for (let i = 0; i < count; i++) {
    if (o + 46 > cd.length || u32(cd, o) !== 0x02014b50) throw new Error(`중앙 디렉터리 ${i}번째 항목 서명이 없다(위치 ${o})`)
    const flags = u16(cd, o + 8)
    const method = u16(cd, o + 10)
    const crc32 = u32(cd, o + 16)
    const compressed = u32(cd, o + 20)
    const size = u32(cd, o + 24)
    const nlen = u16(cd, o + 28)
    const xlen = u16(cd, o + 30)
    const clen = u16(cd, o + 32)
    const lho = u32(cd, o + 42)
    const utf8 = (flags & 0x0800) !== 0
    const name = decodeName(cd.subarray(o + 46, o + 46 + nlen), utf8)
    out.push({
      index: i, name, utf8, flags, method, crc32, compressed, size, localHeaderOffset: lho,
      encrypted: (flags & 0x0001) !== 0,
      zip64: compressed === 0xffffffff || size === 0xffffffff || lho === 0xffffffff,
    })
    o += 46 + nlen + xlen + clen
  }
  return out
}

// 풀지 않는 사유(없으면 null).
export function refusalOf(e: ZipEntry, maxBytes: number): string | null {
  if (e.encrypted) return 'encrypted — 암호화 항목(일반 플래그 bit0)'
  if (e.zip64) return 'zip64 — 크기·위치가 zip64 확장에 있다(지원 밖)'
  if (e.method !== 0 && e.method !== 8) return `method_${e.method} — 저장(0)·deflate(8) 밖 압축 방식`
  if (e.size > maxBytes) return `too_large — 원래 크기 ${e.size}B > 상한 ${maxBytes}B`
  if (e.name.endsWith('/')) return 'directory — 폴더 항목'
  return null
}

// 로컬 헤더(30B + 이름 + 덧) → 압축 데이터가 시작하는 파일 위치.
export function dataOffsetFromLocalHeader(lh: Uint8Array, localHeaderOffset: number): number {
  if (lh.length < 30 || u32(lh, 0) !== 0x04034b50) throw new Error(`로컬 헤더 서명이 없다(위치 ${localHeaderOffset})`)
  return localHeaderOffset + 30 + u16(lh, 26) + u16(lh, 28)
}

// 경로를 뗀 끝 이름(Drive 파일 이름).
export const baseName = (name: string) => name.split('/').filter(Boolean).pop() ?? name
