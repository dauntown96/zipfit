// LH 공고 페이지 첨부 떼기 — 2026-11-25(우편함 「코드·운영 — 스물다섯째」 2 · 스물넷째 덧 1 의 손 절차를 스크립트로).
//   쓰임: node scripts/lh-page-attachments.mjs --ids 0000061062,0000061087 [--compare] [--gap 5]
//     ① 공고 id 로 DB(anon REST)에서 공고 페이지 url · attachment_urls 를 읽는다
//     ② 공고 페이지(selectWrtancInfo.do)만 GET 한다 — 하나씩 · 사이 --gap 초(기본 5) · UA ZipFitBot · 비-2xx 두 번 잇따르면 멈춤
//     ③ 「bbsV_atchmnfl」 상자의 <dt> 묶음을 읽어 첨부 목록을 만든다 — 「공고문」 → 확장자로 공고문(hwp)·공고문(PDF)·공고문 · 「다운로드」 → 첨부파일 · 그 밖 묶음은 뺀다
//        항목 꼴 = DB attachment_urls 와 같다 {url: lhFile.do?fileid=…, label, filename}
//   🔴 첨부 파일(lhFile.do)은 한 번도 부르지 않는다 — url 문자열만 만든다(robots Disallow · 받기는 문지기 fetch-attachment 경유만 · CLAUDE.md 컨테이너 메모).
//   🔴 DB 쓰기 0 · EF 0 — 결과는 JSON 으로 표준 출력에. 채우기는 운영 데이터 쓰기 회차(관리 API 파일 실행 · 롤백 시험 먼저)의 몫이다.
//   --compare 면 공고마다 DB attachment_urls 와 (url · label · filename) 집합을 견줘 같음/다름을 적는다(종료 코드 1 = 다름 있음).
import { readFileSync } from 'node:fs'

const PAGE_HOST = 'apply.lh.or.kr'
export const fileUrl = fid => `https://apply.lh.or.kr/lhapply/lhFile.do?fileid=${fid}`
const unescape = s => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0*39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&')
export function labelFor(kind, name) {
  if (kind === '공고문') {
    const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : ''
    return ext === 'hwp' || ext === 'hwpx' ? '공고문(hwp)' : ext === 'pdf' ? '공고문(PDF)' : '공고문'
  }
  if (kind === '다운로드') return '첨부파일'
  return null
}
export function parsePage(html) {
  const i = html.indexOf('<div class="bbsV_atchmnfl">')
  if (i < 0) return []
  const box = html.slice(i, i + 30000), out = []
  for (const dt of box.matchAll(/<dt[^>]*>([^<]*)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/g)) {
    const kind = dt[1].trim()
    for (const m of dt[2].matchAll(/fileDownLoad\('(\d+)'\);">([^<]+)<\/a>/g)) {
      const name = unescape(m[2]).trim(), label = labelFor(kind, name)
      if (label) out.push({ url: fileUrl(m[1]), label, filename: name })
    }
  }
  return out
}
const keyOf = f => `${f.url}\u0001${f.label}\u0001${f.filename}`
export function compare(page, db) {
  const a = new Set((page || []).map(keyOf)), b = new Set((Array.isArray(db) ? db : []).map(keyOf))
  return { same: a.size === b.size && [...a].every(k => b.has(k)), onlyPage: [...a].filter(k => !b.has(k)).length, onlyDb: [...b].filter(k => !a.has(k)).length }
}

async function main() {
  const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null }
  const ids = String(arg('--ids') || '').split(',').map(s => s.trim()).filter(Boolean)
  if (!ids.length) { console.error('쓰임: --ids a,b,c [--compare] [--gap 5]'); process.exit(2) }
  const gap = Number(arg('--gap') || 5) * 1000, cmp = process.argv.includes('--compare')
  const base = 'https://' + readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8').match(/project_id\s*=\s*"([^"]+)"/)[1] + '.supabase.co'
  const key = readFileSync(new URL('../supabase/public-anon-key.txt', import.meta.url), 'utf8').trim()
  const q = `${base}/rest/v1/announcements?select=announcement_id,source,url,attachment_urls&announcement_id=in.(${ids.map(encodeURIComponent).join(',')})`
  const r = await fetch(q, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
  if (!r.ok) throw new Error(`DB 읽기 ${r.status}`)
  const rows = new Map((await r.json()).map(x => [x.announcement_id, x]))
  const out = {}
  let bad = 0, diff = 0
  for (const [n, id] of ids.entries()) {
    const row = rows.get(id)
    if (!row || row.source !== 'LH' || !row.url || new URL(row.url).host !== PAGE_HOST || !/selectWrtancInfo\.do/.test(row.url)) { out[id] = { err: '공고 페이지 url 없음(LH 공고 페이지만)' }; continue }
    if (n) await new Promise(s => setTimeout(s, gap))
    const res = await fetch(row.url, { headers: { 'User-Agent': 'ZipFitBot (+https://kkokzip.com)' } })
    if (!res.ok) { out[id] = { err: `HTTP ${res.status}` }; if (++bad >= 2) { out._stopped = '비-2xx 두 번 잇따름'; break } ; continue }
    bad = 0
    const files = parsePage(await res.text())
    out[id] = cmp ? { files, ...compare(files, row.attachment_urls) } : { files }
    if (cmp && !out[id].same) diff++
  }
  console.log(JSON.stringify(out, null, 1))
  if (cmp) { console.error(`견줌: ${ids.length} · 다름 ${diff}`); process.exit(diff ? 1 : 0) }
}
if (import.meta.url === `file://${process.argv[1]}`) await main()
