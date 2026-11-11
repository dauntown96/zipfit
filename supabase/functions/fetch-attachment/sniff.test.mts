// sniff.ts 단위 시험 — node --experimental-strip-types supabase/functions/fetch-attachment/sniff.test.mts
import { looksLikeHtml, isContentTypeHtml } from './sniff.ts'
const enc = (s: string) => new TextEncoder().encode(s)
const bin = (...b: number[]) => new Uint8Array(b)
let fail = 0
const t = (name: string, got: boolean, want: boolean) => { const ok = got === want; if (!ok) fail++; console.log(`${ok ? '✓' : '✗'} ${name} — ${got}`) }
// LH 오류 쪽 꼴(errorFile.do · text/html · `<script` 머리 · 2,621B 안팎) — 역전파 7회차에 그림으로 받혔던 꼴
const lhErr = '<script type="text/javascript">\r\n alert("요청하신 파일을 찾을 수 없습니다.");\r\n history.back();\r\n</script>\r\n' + ' '.repeat(2500)
t('LH 오류 쪽 <script 머리 (content-type 없어도)', looksLikeHtml(enc(lhErr)), true)
t('LH 오류 쪽 <script 머리 + text/html', looksLikeHtml(enc(lhErr), isContentTypeHtml('text/html;charset=UTF-8')), true)
t('종전 꼴 <!DOCTYPE html', looksLikeHtml(enc('  <!DOCTYPE html><html><body>내려간 파일</body></html>')), true)
t('<head 머리', looksLikeHtml(enc('<head><meta charset="utf-8"></head>')), true)
t('BOM + <div', looksLikeHtml(new Uint8Array([0xef, 0xbb, 0xbf, ...enc('<div>오류</div>')])), true)
t('text/html + <div', looksLikeHtml(enc('<div class="err">x</div>'), true), true)
t('<div 이지만 content-type 없음 → 막지 않음', looksLikeHtml(enc('<div>x</div>')), false)
t('PDF', looksLikeHtml(enc('%PDF-1.7\n...'), true), false)
t('HWP(D0CF11E0) + text/html', looksLikeHtml(bin(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1), true), false)
t('hwpx/zip(PK)', looksLikeHtml(bin(0x50, 0x4b, 0x03, 0x04, 0x14, 0x00)), false)
t('JPEG', looksLikeHtml(bin(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10)), false)
t('PNG', looksLikeHtml(bin(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)), false)
t('SVG(image/svg+xml)', looksLikeHtml(enc('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), false)
t('<?xml + text/html(nexacro 몫)', looksLikeHtml(enc('<?xml version="1.0"?><Root/>'), true), false)
if (fail) { console.error(`실패 ${fail}`); process.exit(1) } else console.log('전부 통과')
