// 지방공사·공급기관 호스트 설정 표 — 한 곳(2026-10-26 · 우편함 「코드·운영(브랜치 · 병합 0) — 지방공사 받기: ⓒ 광주 중간 인증서 ·
//   ⓑ 경북·경남 CMS 파서 · ⓐ 호스트 설정 표 하나 …」 ⓐ).
// 왜: 같은 호스트의 설정이 네 곳으로 갈려 있었다 — fetch-attachment 의 ALLOWED(받기 허용 경로) · SEOUL_ONLY(서울 실행) ·
//   PROBE_HOSTS(관측) 와 collect-announcements 의 BOARD_SOURCES(게시판 첨부 목록 파서). 받기를 열고 파서를 빠뜨리거나
//   그 반대가 생겼다(2026-10-26 조사 「지방공사 호스트 17 분류」 — ALLOWED 2 vs PROBE_HOSTS 18).
// 🔴 이 파일은 두 함수가 함께 가져다 쓴다(supabase/functions/<함수>/ 밖) — 고치면 deploy-functions.yml 이 `_shared/` 를
//   가져다 쓰는 함수를 모두 다시 배포한다(그 워크플로 「배포할 함수 고르기」).
// 🔴 순수 자료다 — 여기서 네트워크·DB 를 부르지 않는다(단위 시험 scripts/board-hosts.test.mjs 가 node 로 그대로 읽는다).

// 게시판 첨부 목록 파서 이름 — collect-announcements 가 이름 → 함수로 잇는다(board-parse.ts · index.ts).
export type BoardParser = 'bmc' | 'jpdc' | 'gmcc' | 'cms_download'

export type HostConf = {
  host: string
  // fetch-attachment 받기 허용. null = 호스트 단위 · 배열 = 경로 접두 · 키 없음 = 받기 닫힘(관측만).
  paths?: string[] | null
  // 국내 IP 만 받는 호스트 — 서울 지역(ap-northeast-2) 실행에서만 연다.
  seoulOnly?: boolean
  // mode=host_probe 관측 대상(읽기만).
  probe?: boolean
  // 서버가 사슬에서 빠뜨린 중간 인증서(PEM) — 🔴 이 호스트로 가는 요청에만 쓴다(다른 호스트의 신뢰 범위는 그대로).
  extraCaPem?: string
  // 게시판 상세 → 첨부 목록(collect-announcements 게시판 단계). viewPath = MYHOME url 이 가리키는 상세 경로 접두.
  board?: { viewPath: string; parser: BoardParser }
}

// 광주광역시도시공사(www.gmcc.co.kr) — 서버가 리프 인증서 하나만 보낸다(사슬 1 · 2026-10-26 조사 실측).
//   브라우저는 AIA 로 중간을 채워 열리지만 curl·Deno(rustls)는 UnknownIssuer 로 끊긴다(EF 싱가포르·서울 · 세션 셋 모두).
//   아래는 리프의 AIA(CA Issuers) http://secure.globalsign.com/cacert/gsgccr3evtlsca2025.crt 에서 받은 그 중간 인증서다.
//   subject  CN=GlobalSign GCC R3 EV TLS CA 2025 · issuer CN=GlobalSign(Root CA - R3 — 공개 루트 목록에 있음)
//   유효      2025-07-16 ~ 2027-07-16 · serial 83DA866C9F52D51A9318B8D0E7C03169
//   sha256   1B:29:28:02:1A:4B:89:CF:0F:57:2A:24:36:E9:14:E2:54:12:AD:58:ED:EE:22:1E:6C:7C:3C:54:37:17:9A:26
//   SKI 63:10:7F:E4… = 리프 AKI(2026-10-26 대조) · 받은 날 2026-10-26.
//   🔴 2027-07-16 에 만료된다 — 그 전에 서버가 사슬을 고쳤는지 보고, 아니면 새 중간으로 바꾼다(지우면 gmcc 받기가 다시 끊긴다).
const GMCC_INTERMEDIATE_PEM = `-----BEGIN CERTIFICATE-----
MIIElzCCA3+gAwIBAgIRAIPahmyfUtUakxi40OfAMWkwDQYJKoZIhvcNAQELBQAw
TDEgMB4GA1UECxMXR2xvYmFsU2lnbiBSb290IENBIC0gUjMxEzARBgNVBAoTCkds
b2JhbFNpZ24xEzARBgNVBAMTCkdsb2JhbFNpZ24wHhcNMjUwNzE2MDMwNTQ2WhcN
MjcwNzE2MDAwMDAwWjBTMQswCQYDVQQGEwJCRTEZMBcGA1UEChMQR2xvYmFsU2ln
biBudi1zYTEpMCcGA1UEAxMgR2xvYmFsU2lnbiBHQ0MgUjMgRVYgVExTIENBIDIw
MjUwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQDEG4l4CpUk556CyXIA
B3ihV2b8sWMNGwnW0wCpuaHHA5rlXpSWE1AD6r9hyGhQOrc45nPOj6Fvsqw8dFZw
FpAJzlk6FxhYP1ve8KPJvIpt6f5v28jOlzfs8c7dJ8ZmqKHB0Zj6RbAvA9vAl2A3
j0mu+ooXN3/QaFvVihDV/SRyOfFBlhPAsRk8y97tLPWx7/4YzfE6NSLKsU1yF+tf
BTttbaXTH/cWY/KQE3ZHTFRo6XouemjPBP9CDXeTR11tm37Bgn3QOj93FHdi1JJp
eNBGEOGvM8qhTV/77kDiUyOvsp4jZOhas6kIRn8nWK7fCPNdFJYi1Ctvd7gnQ1gB
lW71AgMBAAGjggFrMIIBZzAOBgNVHQ8BAf8EBAMCAYYwHQYDVR0lBBYwFAYIKwYB
BQUHAwEGCCsGAQUFBwMCMBIGA1UdEwEB/wQIMAYBAf8CAQAwHQYDVR0OBBYEFGMQ
f+QoM5r4R2BZUn5XEMdN+BcWMB8GA1UdIwQYMBaAFI/wS3+oLkUkrk1Q+mOai97i
3Ru8MHsGCCsGAQUFBwEBBG8wbTAuBggrBgEFBQcwAYYiaHR0cDovL29jc3AyLmds
b2JhbHNpZ24uY29tL3Jvb3RyMzA7BggrBgEFBQcwAoYvaHR0cDovL3NlY3VyZS5n
bG9iYWxzaWduLmNvbS9jYWNlcnQvcm9vdC1yMy5jcnQwNgYDVR0fBC8wLTAroCmg
J4YlaHR0cDovL2NybC5nbG9iYWxzaWduLmNvbS9yb290LXIzLmNybDAtBgNVHSAE
JjAkMAcGBWeBDAEBMAwGCisGAQQBoDIKAQEwCwYJKwYBBAGgMgEBMA0GCSqGSIb3
DQEBCwUAA4IBAQCtcTjIgw+tiW7E+sCTJ36nrC0IOxMpwE+nTaUG1xQJb+QE18vF
cPvEiqv8OonEBkQJFQ1N5YdDu9kydDYXBmIheYD9Z//TlUBnLL7HBje1ugplB0xE
jpU52q0XLxe6nHfeEKnslZ/Q/eDEsjZKxwF51SlGO6ap+09hfdbfMXDkTsfa+yXg
dIxZRCud0QEBTZAow0iCs3rf5wVALhhh2ePEwqxEm1LkUhvkJMLSCobYcJ+vXprK
JijbpPM602H1kqxNcD/nE7aCNm7g5GTaT04SCGYiQJ32r9mhx34peuYz05pY+AA3
aVB22PDvfoNyGZyClRtNt4KKg8dGJlYEhc3D
-----END CERTIFICATE-----`

export const HOSTS: HostConf[] = [
  // ── LH · SH(공공 API·목록 수집과 함께 쓰는 받기) ──
  { host: 'apply.lh.or.kr', paths: ['/lhapply/', '/upload/Files/'] },
  { host: 'www.i-sh.co.kr', paths: null },
  { host: 'i-sh.co.kr', paths: null },
  { host: 'housing.seoul.go.kr', paths: null },
  // ── 지방공사(MYHOME url 호스트 — 2026-10-13 전수 17 + 광주) ──
  // 부산도시공사 — 해외 IP 에 403(2026-10-12) · 게시판 상세·받기 둘만.
  { host: 'www.bmc.busan.kr', paths: ['/board/download.do', '/board/view.do'], seoulOnly: true, probe: true,
    board: { viewPath: '/board/view.do', parser: 'bmc' } },
  // 제주특별자치도개발공사 — 상세(act=view)·받기(act=download)가 같은 경로(2026-10-22).
  { host: 'www.jpdc.co.kr', paths: ['/open/news/notice.htm'], probe: true,
    board: { viewPath: '/open/news/notice.htm', parser: 'jpdc' } },
  // 🔵 2026-10-26 ⓒ 광주광역시도시공사 — 상세 /board.es?…&act=view&list_no=N · 받기 /boardDownload.es?bid=&list_no=&seq=.
  //   robots.txt 는 Googlebot 에만 「/」 막음(우리 UA 규칙 없음 · 2026-10-26 확인).
  { host: 'www.gmcc.co.kr', paths: ['/board.es', '/boardDownload.es'], probe: true, extraCaPem: GMCC_INTERMEDIATE_PEM,
    board: { viewPath: '/board.es', parser: 'gmcc' } },
  // 🔵 2026-10-26 ⓑ 경상북도개발공사 · 경상남도개발공사 — 같은 CMS(상세 /boardview/boardview.do · 받기 /common/download.do?fileVirtualPath=…).
  //   robots.txt 없음(2026-10-26 · 에러 화면). 싱가포르 DB net.http_get 으로 본문을 받은 적이 있어 서울 전용 아님(B56).
  { host: 'www.gbdc.co.kr', paths: ['/boardview/boardview.do', '/common/download.do'], probe: true,
    board: { viewPath: '/boardview/boardview.do', parser: 'cms_download' } },
  { host: 'www.gndc.co.kr', paths: ['/boardview/boardview.do', '/common/download.do'], probe: true,
    board: { viewPath: '/boardview/boardview.do', parser: 'cms_download' } },
  // 관측만(받기 닫힘 · 파서 없음 — 열린 공고가 오면 한 줄씩 연다 · 조사 「지방공사 호스트 17 분류」 1절)
  ...[
    'apply.cndc.kr', 'www.ih.co.kr', 'www.sjfmc.or.kr', 'house.gmuc.co.kr', 'www.ansanuc.net', 'apply.ansanuc.net',
    'www.gdco.co.kr', 'www.gimje.go.kr', 'www.gunsan.go.kr', 'www.jbdc.co.kr', 'happydorm.or.kr', 'www.dcco.kr',
    'www.changwon.go.kr',
  ].map((host): HostConf => ({ host, probe: true })),
]

// ── 표에서 뽑는 꼴(두 함수가 종전 상수 대신 쓴다) ──
export const allowedPaths = (): Record<string, string[] | null> =>
  Object.fromEntries(HOSTS.filter(h => h.paths !== undefined).map(h => [h.host, h.paths ?? null]))
export const seoulOnlyHosts = (): Set<string> => new Set(HOSTS.filter(h => h.seoulOnly).map(h => h.host))
export const probeHosts = (): Set<string> => new Set(HOSTS.filter(h => h.probe).map(h => h.host))
export const extraCaOf = (host: string): string | null => HOSTS.find(h => h.host === host)?.extraCaPem ?? null
export const boardSourceList = (): { host: string; viewPath: string; parser: BoardParser }[] =>
  HOSTS.filter(h => h.board).map(h => ({ host: h.host, viewPath: h.board!.viewPath, parser: h.board!.parser }))
