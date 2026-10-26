// 호스트 설정 표(supabase/functions/_shared/board-hosts.ts) 대조 시험 — node scripts/board-hosts.test.mjs (실패하면 종료 코드 1)
// 2026-10-26(우편함 「코드·운영 — 지방공사 받기 …」 ⓐ) — 네 곳으로 갈려 있던 상수를 표 하나로 묶었다. 「지금 아는 호스트의 동작은 전후 같다」를
//   종전 상수(main 2026-10-26 d582ed0 의 fetch-attachment ALLOWED · SEOUL_ONLY · PROBE_HOSTS · collect-announcements BOARD_SOURCES 를
//   그대로 옮김)와 표에서 뽑은 값으로 대조한다. 더한 것(광주 · 경북 · 경남)은 따로 적어 그것만 다르게 허용한다.
import { allowedPaths, seoulOnlyHosts, probeHosts, extraCaOf, boardSourceList, HOSTS } from '../supabase/functions/_shared/board-hosts.ts'

const OLD = {
  ALLOWED: {
    'apply.lh.or.kr': ['/lhapply/', '/upload/Files/'],
    'www.i-sh.co.kr': null,
    'i-sh.co.kr': null,
    'housing.seoul.go.kr': null,
    'www.bmc.busan.kr': ['/board/download.do', '/board/view.do'],
    'www.jpdc.co.kr': ['/open/news/notice.htm'],
  },
  SEOUL_ONLY: ['www.bmc.busan.kr'],
  PROBE_HOSTS: [
    'www.bmc.busan.kr', 'www.gbdc.co.kr', 'www.jpdc.co.kr', 'apply.cndc.kr', 'www.ih.co.kr', 'www.sjfmc.or.kr',
    'www.gndc.co.kr', 'house.gmuc.co.kr', 'www.ansanuc.net', 'apply.ansanuc.net', 'www.gdco.co.kr', 'www.gimje.go.kr',
    'www.gunsan.go.kr', 'www.jbdc.co.kr', 'happydorm.or.kr', 'www.dcco.kr', 'www.changwon.go.kr', 'www.gmcc.co.kr',
  ],
  BOARD_SOURCES: [
    { host: 'www.bmc.busan.kr', viewPath: '/board/view.do', parser: 'bmc' },
    { host: 'www.jpdc.co.kr', viewPath: '/open/news/notice.htm', parser: 'jpdc' },
  ],
}
// 이번 회차가 더한 것(🔴 이것 말고는 종전과 같아야 한다)
const ADDED = {
  ALLOWED: {
    'www.gmcc.co.kr': ['/board.es', '/boardDownload.es'],
    'www.gbdc.co.kr': ['/boardview/boardview.do', '/common/download.do'],
    'www.gndc.co.kr': ['/boardview/boardview.do', '/common/download.do'],
  },
  BOARD_SOURCES: [
    { host: 'www.gmcc.co.kr', viewPath: '/board.es', parser: 'gmcc' },
    { host: 'www.gbdc.co.kr', viewPath: '/boardview/boardview.do', parser: 'cms_download' },
    { host: 'www.gndc.co.kr', viewPath: '/boardview/boardview.do', parser: 'cms_download' },
  ],
  EXTRA_CA: ['www.gmcc.co.kr'],
}

const sortObj = o => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)))
const byHost = a => [...a].sort((x, y) => x.host.localeCompare(y.host))
const cases = [
  ['ALLOWED = 종전 + 더한 셋', sortObj(allowedPaths()), sortObj({ ...OLD.ALLOWED, ...ADDED.ALLOWED })],
  ['SEOUL_ONLY 같음', [...seoulOnlyHosts()].sort(), [...OLD.SEOUL_ONLY].sort()],
  ['PROBE_HOSTS 같음(18)', [...probeHosts()].sort(), [...OLD.PROBE_HOSTS].sort()],
  ['BOARD_SOURCES = 종전 + 더한 셋', byHost(boardSourceList()), byHost([...OLD.BOARD_SOURCES, ...ADDED.BOARD_SOURCES])],
  ['추가 인증서는 광주 한 호스트만', HOSTS.filter(h => h.extraCaPem).map(h => h.host), ADDED.EXTRA_CA],
  ['추가 인증서 PEM 한 장', (extraCaOf('www.gmcc.co.kr') ?? '').match(/BEGIN CERTIFICATE/g)?.length ?? 0, 1],
  ['다른 호스트엔 추가 인증서 없음', ['apply.lh.or.kr', 'www.bmc.busan.kr', 'www.jpdc.co.kr', 'www.gbdc.co.kr'].map(extraCaOf), [null, null, null, null]],
  ['호스트 한 줄씩(겹침 0)', new Set(HOSTS.map(h => h.host)).size, HOSTS.length],
  ['게시판 파서가 있으면 받기 경로에 상세 경로가 든다', boardSourceList().every(s => {
    const p = allowedPaths()[s.host]; return p === null || (Array.isArray(p) && p.some(x => s.viewPath.startsWith(x)))
  }), true],
]
let bad = 0
for (const [name, got, want] of cases) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) bad++
  console.log(`${ok ? '✅' : '❌'} ${name}${ok ? '' : `: ${JSON.stringify(got)} (기대 ${JSON.stringify(want)})`}`)
}
process.exit(bad ? 1 : 0)
