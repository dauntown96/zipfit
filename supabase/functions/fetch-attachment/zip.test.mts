// zip.ts 단위 시험 — node --experimental-strip-types supabase/functions/fetch-attachment/zip.test.mts [실물 zip 경로]
// 1) 합성 zip(EUC-KR 이름 · deflate 한 항목 · 저장 한 항목 · 가짜 암호화 플래그 한 항목)으로 목록·거절·데이터 위치를 본다.
// 2) 실물 zip 경로를 주면 항목마다 Range 처럼 잘라 DecompressionStream('deflate-raw')로 풀고 크기·sha256 앞자리를 찍는다.
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { deflateRawSync } from 'node:zlib'
import { findEocd, parseCentralDirectory, refusalOf, dataOffsetFromLocalHeader, baseName, EOCD_TAIL_BYTES } from './zip.ts'

const le16 = (n: number) => Buffer.from([n & 255, (n >> 8) & 255])
const le32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b }
const eucKr = (s: string) => {
  // 시험용 고정 바이트 — 「팸플릿」 EUC-KR(C6D4 C7C3 B8B4) + ".pdf"
  if (s === '팸플릿.pdf') return Buffer.from([0xc6, 0xd4, 0xc7, 0xc3, 0xb8, 0xb4, 0x2e, 0x70, 0x64, 0x66])
  return Buffer.from(s, 'utf8')
}
function buildZip(items: { name: Buffer; utf8: boolean; data: Buffer; method: 0 | 8; flags?: number }[]) {
  const locals: Buffer[] = []; const cds: Buffer[] = []; let off = 0
  for (const it of items) {
    const comp = it.method === 8 ? deflateRawSync(it.data) : it.data
    const flags = (it.flags ?? 0) | (it.utf8 ? 0x0800 : 0)
    const lh = Buffer.concat([le32(0x04034b50), le16(20), le16(flags), le16(it.method), le16(0), le16(0), le32(0), le32(comp.length), le32(it.data.length), le16(it.name.length), le16(0), it.name])
    const cd = Buffer.concat([le32(0x02014b50), le16(20), le16(20), le16(flags), le16(it.method), le16(0), le16(0), le32(0), le32(comp.length), le32(it.data.length), le16(it.name.length), le16(0), le16(0), le16(0), le16(0), le32(0), le32(off), it.name])
    locals.push(lh, comp); cds.push(cd); off += lh.length + comp.length
  }
  const cdBuf = Buffer.concat(cds)
  const eocd = Buffer.concat([le32(0x06054b50), le16(0), le16(0), le16(items.length), le16(items.length), le32(cdBuf.length), le32(off), le16(0)])
  return Buffer.concat([...locals, cdBuf, eocd])
}

let bad = 0
const ok = (c: boolean, msg: string) => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${msg}`) }

async function inflate(buf: Uint8Array, method: number): Promise<Buffer> {
  if (method === 0) return Buffer.from(buf)
  const s = new Blob([buf]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return Buffer.from(await new Response(s).arrayBuffer())
}

async function walk(zip: Uint8Array, label: string) {
  const tail = zip.subarray(Math.max(0, zip.length - EOCD_TAIL_BYTES))
  const e = findEocd(tail)
  const entries = parseCentralDirectory(zip.subarray(e.cdOffset, e.cdOffset + e.cdSize), e.count)
  const rows = []
  for (const en of entries) {
    const ref = refusalOf(en, 200_000_000)
    let out: Buffer | null = null
    if (!ref) {
      const start = dataOffsetFromLocalHeader(zip.subarray(en.localHeaderOffset, en.localHeaderOffset + 30 + 65535 * 2), en.localHeaderOffset)
      out = await inflate(zip.subarray(start, start + en.compressed), en.method)
    }
    rows.push({ en, ref, out })
  }
  console.log(`— ${label}: 항목 ${entries.length}`)
  for (const r of rows) console.log(`   #${r.en.index} ${baseName(r.en.name)} · 방식 ${r.en.method} · ${r.en.compressed}→${r.en.size}B · ${r.ref ?? (r.out ? `풀림 ${r.out.length}B sha256 ${createHash('sha256').update(r.out).digest('hex').slice(0, 8)}` : '')}`)
  return rows
}

// 1) 합성
{
  const pdf = Buffer.from('%PDF-1.4 hello hello hello hello'.repeat(50))
  const zip = buildZip([
    { name: eucKr('팸플릿.pdf'), utf8: false, data: pdf, method: 8 },
    { name: Buffer.from('dir/저장.txt', 'utf8'), utf8: true, data: Buffer.from('plain'), method: 0 },
    { name: Buffer.from('잠김.pdf', 'utf8'), utf8: true, data: pdf, method: 8, flags: 0x0001 },
  ])
  const rows = await walk(zip, '합성')
  ok(rows.length === 3, '항목 3')
  ok(rows[0].en.name === '팸플릿.pdf' && !rows[0].en.utf8, 'EUC-KR 이름 「팸플릿.pdf」')
  ok(rows[0].out?.equals(pdf) === true, 'deflate 항목 풀림 = 원본')
  ok(rows[1].out?.toString() === 'plain' && baseName(rows[1].en.name) === '저장.txt', '저장(0) 항목 · 경로 뗀 이름')
  ok(rows[2].ref?.startsWith('encrypted') === true, '가짜 암호화 플래그 → 거절 encrypted')
  ok(refusalOf({ ...rows[0].en, method: 12 }, 1e9)?.startsWith('method_12') === true, '방식 12 → 거절')
  ok(refusalOf({ ...rows[0].en, size: 0xffffffff, zip64: true }, 1e12)?.startsWith('zip64') === true, 'zip64 → 거절')
  ok(refusalOf(rows[0].en, 10)?.startsWith('too_large') === true, '상한 넘음 → 거절')
  let threw = false
  try { findEocd(new Uint8Array(100)) } catch { threw = true }
  ok(threw, 'EOCD 없음 → 던짐')
}
// 2) 실물
const real = process.argv[2]
if (real) await walk(new Uint8Array(readFileSync(real)), real.split('/').pop()!)
process.exit(bad ? 1 : 0)
