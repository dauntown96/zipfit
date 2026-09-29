// 공고 첨부 대리 수신 Edge Function
//
// 두 가지 일을 한다.
//   ① 허용된 공고 사이트의 첨부 URL 하나를 받아 그 바이트를 base64로 돌려준다.
//   ② (mode=upload) 그 바이트를 Google Drive에 직접 올린다.
//   ②의 준비로 mode=ensure_folder가 있다 — 공고 폴더만 확보하고 ID를 돌려준다.
//   🔴 여러 건을 쏘기 전에 한 번 불러 folder_id를 받아 두는 것이 정해진 순서다.
//     그러지 않으면 폴더 생성이 요청마다 일어나 갈린다(2026-09-10 실측).
//
// 🔴 ②가 필요한 이유 — 놓는 쪽이 막혀 있었다(2026-09-10 실측):
//   ①로 받은 base64가 Drive에 닿으려면 모델 출력(도구 파라미터)을 거쳐야 하는데
//   31,587B 파일이 11,352B로 조용히 잘렸고 12,000자 base64는 아예 거부됐다.
//   EF가 Drive API로 직접 올리면 그 구간이 사라진다 — 파일이 Supabase 안에서
//   LH → Drive로 바로 간다.
//
// ⚠️ 왜 이 함수가 필요한가 — Claude Code 컨테이너에서 직접 받을 수 없다:
//   egress 프록시가 apply.lh.or.kr / i-sh.co.kr / housing.seoul.go.kr 를
//   403으로 막는다(정책 거부). Edge Function 요청은 Supabase 인프라에서
//   나가므로 그 정책과 무관하다. collect-sh-announcements 의 ?mode=probe 와 같은 이유다.
//
// ⚠️ pg_net으로 파일을 직접 받을 수는 없다(2026-09-10 실측):
//   net._http_response.content 가 text 컬럼이라 바이너리가 살아남지 못한다.
//   878,331바이트 PDF가 109옥텟만 남았고, 저장된 값은 UTF-8로 재인코딩조차 되지
//   않았다(invalid byte sequence 0xff). 그래서 base64(순수 ASCII)로 돌려준다.

// 코딩원칙 16번: `Deno.env.get()!`는 타입 단언일 뿐 런타임 검사가 아니다.
const requireEnv = (key: string): string => {
  const v = Deno.env.get(key)
  if (!v) throw new Error(`필수 환경변수 누락: ${key}`)
  return v
}

// 기존 수집 EF와 같은 기준 — verify_jwt=false + x-cron-secret 게이트.
const CRON_SECRET = requireEnv('CRON_SECRET_V2')
const matchCronSecret = (req: Request): boolean =>
  req.headers.get('x-cron-secret') === CRON_SECRET

// 🔴 이 함수는 다른 수집 EF와 성격이 다르다.
// 다른 EF는 정해진 곳에서 가져오지만, 이 함수는 *호출자가 준 URL로* 나간다.
// 그래서 허용목록이 유일한 범위 장치다. 없으면 공개 프록시(SSRF)가 된다.
//
// paths가 null이면 호스트 단위로만 검사한다. LH는 첨부 경로가 하나로 고정돼
// 있어 경로까지 좁혔다. SH는 첨부 경로가 아직 파악되지 않아 null로 두고,
// 파악되는 시점에 좁힌다(그전에 좁히면 SH 수집이 조용히 막힌다).
//
// 🔴 여기에 oauth2.googleapis.com·googleapis.com을 넣지 않는다.
//   이 목록은 *호출자가 준 URL*만 검사한다(rejectReason은 target과 리다이렉트
//   홉에만 걸린다). Drive·OAuth 호출은 아래 코드가 상수 URL로 직접 나가므로
//   이 목록을 지나가지 않는다. 넣으면 가드가 넓어지기만 한다 —
//   호출자가 googleapis 임의 URL을 우리를 통해 불러올 수 있게 된다.
// 🔴 `/upload/Files/`는 LH 공고 페이지의 단지 이미지(평면도·조감도·배치도) 경로다(2026-09-29 EF 회차).
//   첨부 경로(`/lhapply/`)와 달리 문서가 아니라 그림만 오는 자리라, 최종 응답 형식을
//   `image/*`·`application/pdf`로 한 번 더 좁힌다(아래 typeReject — 아니면 415).
const ALLOWED: Record<string, string[] | null> = {
  'apply.lh.or.kr': ['/lhapply/', '/upload/Files/'],
  'www.i-sh.co.kr': null,
  'i-sh.co.kr': null,
  'housing.seoul.go.kr': null,
}

// 🔴 운반 상한. 원본 바이트 기준이다.
//
// 산출 근거(2026-09-10 실측). 사슬은 세 겹이고 각 겹의 한도가 다르다:
//   ① EF 응답        — 원본 15,954,648B / base64 21,272,864자 통과
//   ② pg_net 저장    — 같은 건이 21,273,309옥텟으로 온전히 저장됨
//   ③ MCP 전달       — 16,000,000자 통과 · 19,000,000자에서 세션이 끊김
// 즉 가장 좁은 겹은 ③이고, 안전이 확인된 값은 base64 16,000,000자
// = 원본 12,000,000B다. 실패는 base64 19,000,000자 = 원본 14,250,000B.
//
// 여기에 실물 분포를 겹친다. LH 첨부 84건 표본에서 중앙값 294,019B,
// p95 1,770,898B이고, **1,770,898B와 15,954,648B 사이에 파일이 하나도 없다.**
// 6,000,000B는 그 빈 구간 한가운데다 — 실재하는 어떤 무리도 가르지 않는다.
//
// 여유: 안전 확인값의 1/2(12,000,000B), 실패값의 약 1/2.4(14,250,000B),
//       실측 최대 공고문의 3.4배(1,770,898B).
// ⚠️ 경계값을 그대로 쓰지 않았다. 경계 근처가 가장 위험하다.
//
// ⚠️ mode=upload는 ③(MCP 전달)을 타지 않는다 — 파일이 EF 안에서 Drive로 바로
//   간다. 즉 업로드 경로에서는 가장 좁은 겹이 사라진다. 그래도 이번에는
//   상한을 올리지 않는다. 두 경로가 같은 상한을 쓰는 편이 예측 가능하고,
//   44MB급 팸플릿을 받을지는 별도 판단이다.
const MAX_SOURCE_BYTES = 6_000_000

// 🔴 리다이렉트는 수동으로 따라간다.
// 자동(fetch 기본값)으로 두면 허용 호스트가 허용 밖으로 넘겨줄 때
// 허용목록이 통째로 무력해진다. 매 홉마다 다시 검사한다.
const MAX_REDIRECTS = 3
const FETCH_TIMEOUT_MS = 60_000
const DRIVE_TIMEOUT_MS = 120_000

// 🔴 큰 첨부 분할 업로드(2026-09-28 B54) — `mode=upload&large=resumable`일 때만 탄다.
//   이 파라미터가 없는 호출은 위 6MB 상한과 종전 경로를 그대로 탄다(바이트 불변).
//   LH 응답을 받는 대로 Drive resumable 세션에 청크로 흘려보낸다 — 메모리에는 청크 하나만 둔다.
//   왜: 팸플릿(부산문현2 36,332,388B · 전주동서학 16,041,200B · 인천논현 140,130,317B)이
//   6MB 상한에 걸려 「미수집 고정」이었다. 종전 경로는 파일 전체를 버퍼에 모으고(readCapped)
//   multipart 본문을 한 번 더 만든다(buildMultipart) — 크기의 두 배가 메모리에 선다.
// 청크는 256KiB의 배수여야 한다(Drive 규약 — 마지막 청크만 예외).
const RESUMABLE_CHUNK_BYTES = 8 * 1024 * 1024
// 인천논현 팸플릿(140,130,317B)이 들어가는 값. 실측 최대보다 크게, 공고 첨부 실물보다 조금 넉넉히.
const MAX_RESUMABLE_BYTES = 200_000_000
// 요청 무활동 150초 한도 아래에서 끝낸다. 넘으면 LH 수신을 끊고 Drive 세션을 버린다.
const RESUMABLE_TIMEOUT_MS = 140_000
// Drive가 돌려주는 세션 URI는 이 접두로 시작해야 한다 — 다른 곳으로 청크를 보내지 않는다.
const DRIVE_UPLOAD_PREFIX = 'https://www.googleapis.com/upload/drive/v3/files'

// 앱 소유 루트 폴더 이름. drive.file scope라 앱이 만든 것만 보이고 만질 수 있다.
// 기존 Drive 공고 폴더에는 구조적으로 접근할 수 없다(권한이 아니라 scope 문제다).
const DRIVE_ROOT_NAME = 'ZipFit 자동수집'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

// 허용목록 검사. 통과하면 null, 막히면 사유 문자열을 돌려준다.
const rejectReason = (u: URL): string | null => {
  if (u.protocol !== 'https:') return `https가 아니다: ${u.protocol}`
  if (!(u.hostname in ALLOWED)) return `허용되지 않은 host: ${u.hostname}`
  const paths = ALLOWED[u.hostname]
  if (paths && !paths.some((p) => u.pathname.startsWith(p))) {
    return `허용되지 않은 path: ${u.hostname}${u.pathname}`
  }
  return null
}

// 이미지 경로의 형식 검사. 최종 URL(리다이렉트를 다 따라간 뒤)이 `/upload/Files/`일 때만 건다.
// 통과하면 null, 막히면 사유 문자열.
const IMAGE_ONLY_PREFIX = '/upload/Files/'
const typeReject = (u: URL, contentType: string | null): string | null => {
  if (u.hostname !== 'apply.lh.or.kr' || !u.pathname.startsWith(IMAGE_ONLY_PREFIX)) return null
  const t = (contentType ?? '').split(';')[0].trim().toLowerCase()
  if (t.startsWith('image/') || t === 'application/pdf') return null
  return `이미지 경로인데 응답 형식이 그림·PDF가 아니다: ${t || '(없음)'}`
}

const toBase64 = (bytes: Uint8Array): string => {
  // 큰 배열을 String.fromCharCode(...bytes)로 한 번에 넘기면 스택이 터진다.
  const CHUNK = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

const sha256Hex = async (bytes: Uint8Array): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// 상한을 넘으면 그 자리에서 멈춘다. 다 받아놓고 버리지 않는다.
// Content-length가 없는 응답이 있어서 헤더만으로는 못 막는다.
const readCapped = async (
  body: ReadableStream<Uint8Array>,
  cap: number,
): Promise<{ bytes: Uint8Array | null; read: number }> => {
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let read = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    read += value.length
    if (read > cap) {
      await reader.cancel()
      return { bytes: null, read }
    }
    chunks.push(value)
  }
  const out = new Uint8Array(read)
  let off = 0
  for (const c of chunks) { out.set(c, off); off += c.length }
  return { bytes: out, read }
}

// ───────────────────────── Drive 자격증명 ─────────────────────────
//
// 🔴 최상위에서 읽지 않는다. 여기서 throw하면 업로드와 무관한 ① 경로까지
//   함께 죽는다. 필요한 순간에만 읽고, 없으면 그때 명시적으로 throw한다
//   (코딩원칙 16번 — 조용히 undefined가 되지 않게 한다).
//
// 시크릿은 두 곳 중 하나에 있다:
//   ⓐ Edge Function 환경변수 (GDRIVE_CLIENT_ID 등)
//   ⓑ DB Vault (vault.decrypted_secrets의 gdrive_client_id 등)
// ⓐ를 먼저 보고 없으면 ⓑ로 간다. 어느 쪽을 썼는지는 응답에 남기되
// **값은 어디에도 남기지 않는다.**
type DriveSecrets = {
  clientId: string
  clientSecret: string
  refreshToken: string
  source: 'env' | 'vault'
}
let cachedSecrets: DriveSecrets | null = null

const secretsFromVault = async (): Promise<Record<string, string>> => {
  const dbUrl = Deno.env.get('SUPABASE_DB_URL')
  if (!dbUrl) throw new Error('SUPABASE_DB_URL이 없어 Vault를 읽을 수 없다')
  // 동적 import — env 경로로 해결되면 이 의존성은 아예 로드되지 않는다.
  const { default: postgres } = await import('npm:postgres@3.4.4')
  const sql = postgres(dbUrl, { prepare: false, max: 1 })
  try {
    const rows = await sql`
      select name, decrypted_secret from vault.decrypted_secrets
      where name in ('gdrive_client_id','gdrive_client_secret','gdrive_refresh_token')
    `
    const out: Record<string, string> = {}
    for (const r of rows) out[r.name as string] = r.decrypted_secret as string
    return out
  } finally {
    await sql.end({ timeout: 5 })
  }
}

const getDriveSecrets = async (): Promise<DriveSecrets> => {
  if (cachedSecrets) return cachedSecrets
  const envId = Deno.env.get('GDRIVE_CLIENT_ID')
  const envSecret = Deno.env.get('GDRIVE_CLIENT_SECRET')
  const envRefresh = Deno.env.get('GDRIVE_REFRESH_TOKEN')
  if (envId && envSecret && envRefresh) {
    cachedSecrets = { clientId: envId, clientSecret: envSecret, refreshToken: envRefresh, source: 'env' }
    return cachedSecrets
  }
  const v = await secretsFromVault()
  const missing = ['gdrive_client_id', 'gdrive_client_secret', 'gdrive_refresh_token'].filter((k) => !v[k])
  if (missing.length) throw new Error(`Drive 시크릿 누락: ${missing.join(', ')}`)
  cachedSecrets = {
    clientId: v.gdrive_client_id,
    clientSecret: v.gdrive_client_secret,
    refreshToken: v.gdrive_refresh_token,
    source: 'vault',
  }
  return cachedSecrets
}

// 🔴 오류 문자열에 시크릿이 섞여 나가는 사고가 흔하다. 나가기 전에 지운다.
const redact = (text: string, s: DriveSecrets | null): string => {
  if (!s) return text
  let out = text
  for (const v of [s.refreshToken, s.clientSecret, s.clientId]) {
    if (v && v.length > 8) out = out.split(v).join('[REDACTED]')
  }
  return out
}

// ───────────────────────── Drive API ─────────────────────────

const driveFetch = async (
  url: string,
  init: RequestInit,
  token: string,
  secrets: DriveSecrets | null,
): Promise<Record<string, unknown>> => {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), DRIVE_TIMEOUT_MS)
  try {
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${token}`)
    const res = await fetch(url, { ...init, headers, signal: ac.signal })
    const text = await res.text()
    if (!res.ok) {
      throw new Error(`Drive API ${res.status}: ${redact(text.slice(0, 500), secrets)}`)
    }
    return text ? JSON.parse(text) : {}
  } finally {
    clearTimeout(timer)
  }
}

// refresh token → access token. 액세스 토큰은 메모리에만 둔다.
const getAccessToken = async (s: DriveSecrets): Promise<string> => {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), DRIVE_TIMEOUT_MS)
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: s.clientId,
        client_secret: s.clientSecret,
        refresh_token: s.refreshToken,
        grant_type: 'refresh_token',
      }),
      signal: ac.signal,
    })
    const text = await res.text()
    if (!res.ok) throw new Error(`토큰 발급 실패 ${res.status}: ${redact(text.slice(0, 300), s)}`)
    const body = JSON.parse(text)
    if (!body.access_token) throw new Error('토큰 응답에 access_token이 없다')
    return body.access_token as string
  } finally {
    clearTimeout(timer)
  }
}

// Drive 검색 질의의 문자열 리터럴 이스케이프.
const q = (v: string) => v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")

// 🔴 Drive 파일·폴더 ID는 URL-safe 문자만 쓴다.
//   호출자가 준 ID는 질의문과 URL에 그대로 들어가므로 형식부터 본다 —
//   통과하지 못하면 Drive를 아예 부르지 않는다.
const DRIVE_ID_RE = /^[A-Za-z0-9_-]{10,200}$/

// 폴더도 createdTime을 함께 받는다.
// 🔴 폴더가 갈렸을 때 어느 쪽이 먼저인지를 **서버 시각으로** 알 수 있어야 한다.
//   추측으로 순서를 말하지 않기 위해서다.
const FOLDER_FIELDS = 'id,name,createdTime'

type Folder = { id: string; createdTime: string | null }

const findFolder = async (
  name: string,
  parent: string | null,
  token: string,
  s: DriveSecrets,
): Promise<Folder | null> => {
  const parts = [
    `name='${q(name)}'`,
    "mimeType='application/vnd.google-apps.folder'",
    'trashed=false',
  ]
  if (parent) parts.push(`'${q(parent)}' in parents`)
  const url = 'https://www.googleapis.com/drive/v3/files?' + new URLSearchParams({
    q: parts.join(' and '),
    fields: `files(${FOLDER_FIELDS})`,
    pageSize: '10',
  })
  const body = await driveFetch(url, { method: 'GET' }, token, s)
  const files = (body.files as Array<Record<string, unknown>> | undefined) ?? []
  if (!files.length) return null
  return { id: files[0].id as string, createdTime: (files[0].createdTime as string) ?? null }
}

const createFolder = async (
  name: string,
  parent: string | null,
  token: string,
  s: DriveSecrets,
): Promise<Folder> => {
  const metadata: Record<string, unknown> = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
  }
  if (parent) metadata.parents = [parent]
  const body = await driveFetch(
    `https://www.googleapis.com/drive/v3/files?fields=${FOLDER_FIELDS}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(metadata) },
    token,
    s,
  )
  return { id: body.id as string, createdTime: (body.createdTime as string) ?? null }
}

// ⚠️ 찾기와 만들기 사이에 창이 있다(check-then-act). Drive에는 폴더 이름
//   유일성 제약이 없어서 같은 이름을 동시에 확보하려 하면 **둘 다 만들어진다.**
//   2026-09-10 김제하동 첫 수집에서 실제로 갈렸다(211ms 차, 둘 다 created=true).
// 🔴 그래서 업로드 경로는 folder_id를 받아 이 함수를 지나가지 않는다.
//   이 함수는 mode=ensure_folder에서 **한 번만** 부르는 것을 전제로 남는다.
const ensureFolder = async (
  name: string,
  parent: string | null,
  token: string,
  s: DriveSecrets,
): Promise<{ id: string; created: boolean; createdTime: string | null }> => {
  const found = await findFolder(name, parent, token, s)
  if (found) return { ...found, created: false }
  const made = await createFolder(name, parent, token, s)
  return { ...made, created: true }
}

const FILE_FIELDS = 'id,name,size,mimeType,md5Checksum,sha256Checksum,webViewLink,parents,createdTime'

const findFileInFolder = async (
  name: string,
  parent: string,
  token: string,
  s: DriveSecrets,
): Promise<Record<string, unknown> | null> => {
  const url = 'https://www.googleapis.com/drive/v3/files?' + new URLSearchParams({
    q: `name='${q(name)}' and '${q(parent)}' in parents and trashed=false`,
    fields: `files(${FILE_FIELDS})`,
    pageSize: '10',
  })
  const body = await driveFetch(url, { method: 'GET' }, token, s)
  const files = (body.files as Array<Record<string, unknown>> | undefined) ?? []
  return files.length ? files[0] : null
}

// multipart/related 본문을 손으로 만든다.
// FormData는 multipart/form-data를 만들어서 Drive가 받지 않는다.
const buildMultipart = (
  metadata: Record<string, unknown>,
  mimeType: string,
  bytes: Uint8Array,
  boundary: string,
): Uint8Array => {
  const enc = new TextEncoder()
  const head = enc.encode(
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) + '\r\n' +
    `--${boundary}\r\n` +
    `Content-Type: ${mimeType}\r\n\r\n`,
  )
  const tail = enc.encode(`\r\n--${boundary}--\r\n`)
  const out = new Uint8Array(head.length + bytes.length + tail.length)
  out.set(head, 0)
  out.set(bytes, head.length)
  out.set(tail, head.length + bytes.length)
  return out
}

const uploadFile = async (
  opts: {
    name: string
    parent: string
    mimeType: string
    bytes: Uint8Array
    replaceFileId: string | null
  },
  token: string,
  s: DriveSecrets,
): Promise<Record<string, unknown>> => {
  const boundary = `zipfit${crypto.randomUUID().replace(/-/g, '')}`
  // 🔴 metadata.mimeType에 Google 형식(application/vnd.google-apps.*)을 넣지
  //   않는 한 Drive는 변환하지 않는다. 원본 형식을 그대로 둔다.
  const metadata: Record<string, unknown> = { name: opts.name, mimeType: opts.mimeType }
  let url: string
  let method: string
  if (opts.replaceFileId) {
    // 새 파일을 만들지 않고 같은 파일의 내용을 바꾼다(파일 ID가 유지된다).
    url = `https://www.googleapis.com/upload/drive/v3/files/${opts.replaceFileId}?uploadType=multipart&fields=${FILE_FIELDS}`
    method = 'PATCH'
  } else {
    metadata.parents = [opts.parent]
    url = `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=${FILE_FIELDS}`
    method = 'POST'
  }
  const body = buildMultipart(metadata, opts.mimeType, opts.bytes, boundary)
  return await driveFetch(
    url,
    { method, headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body },
    token,
    s,
  )
}

// ───────────────────────── 큰 첨부 — resumable 업로드 ─────────────────────────
//
// 세션을 열고(POST/PATCH ?uploadType=resumable) → 청크를 PUT 한다.
// 중간 청크는 `bytes a-b/*`, 마지막은 `bytes a-b/<총량>`(스트림이 청크 경계에서 끝나면 `bytes */<총량>`).
// 🔴 원본 해시를 EF에서 계산하지 않는다 — CPU 2초 한도 안에 140MB SHA-256이 들어간다는 보장이 없다.
//   무결성은 Drive가 계산한 sha256Checksum·size로 보고, 중복은 업로드 **뒤에** 그 값으로 가린다.

const openResumable = async (
  opts: { name: string; parent: string; mimeType: string; total: number | null; replaceFileId: string | null },
  token: string,
  s: DriveSecrets,
): Promise<string> => {
  const metadata: Record<string, unknown> = { name: opts.name, mimeType: opts.mimeType }
  let url: string
  let method: string
  if (opts.replaceFileId) {
    url = `${DRIVE_UPLOAD_PREFIX}/${opts.replaceFileId}?uploadType=resumable&fields=${FILE_FIELDS}`
    method = 'PATCH'
  } else {
    metadata.parents = [opts.parent]
    url = `${DRIVE_UPLOAD_PREFIX}?uploadType=resumable&fields=${FILE_FIELDS}`
    method = 'POST'
  }
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json; charset=UTF-8',
    'X-Upload-Content-Type': opts.mimeType,
  }
  if (opts.total !== null) headers['X-Upload-Content-Length'] = String(opts.total)
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), DRIVE_TIMEOUT_MS)
  try {
    const res = await fetch(url, { method, headers, body: JSON.stringify(metadata), signal: ac.signal })
    const text = await res.text()
    if (!res.ok) throw new Error(`Drive 세션 열기 ${res.status}: ${redact(text.slice(0, 500), s)}`)
    const loc = res.headers.get('location')
    if (!loc || !loc.startsWith(DRIVE_UPLOAD_PREFIX)) throw new Error('Drive 세션 URI가 없거나 예상 밖이다')
    return loc
  } finally {
    clearTimeout(timer)
  }
}

// 청크 하나를 보낸다. 308이면 Drive가 받은 마지막 바이트 위치를, 200·201이면 파일 메타를 돌려준다.
const putChunk = async (
  session: string,
  chunk: Uint8Array,
  start: number,
  last: boolean,
  token: string,
  s: DriveSecrets,
  signal: AbortSignal,
): Promise<{ done: boolean; persistedEnd: number; file: Record<string, unknown> | null }> => {
  const total = last ? String(start + chunk.length) : '*'
  const range = chunk.length === 0
    ? `bytes */${total}`
    : `bytes ${start}-${start + chunk.length - 1}/${total}`
  const res = await fetch(session, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Range': range },
    body: chunk,
    signal,
  })
  const text = await res.text()
  if (res.status === 308) {
    const r = res.headers.get('range')   // 'bytes=0-8388607'
    const m = r ? r.match(/bytes=0-(\d+)/) : null
    return { done: false, persistedEnd: m ? Number(m[1]) : -1, file: null }
  }
  if (res.status === 200 || res.status === 201) {
    return { done: true, persistedEnd: start + chunk.length - 1, file: text ? JSON.parse(text) : {} }
  }
  throw new Error(`Drive 청크 ${range} ${res.status}: ${redact(text.slice(0, 300), s)}`)
}

// 스트림을 청크로 잘라 흘려보낸다. 상한을 넘으면 그 자리에서 멈추고 세션을 버린다.
const streamResumable = async (
  body: ReadableStream<Uint8Array>,
  session: string,
  token: string,
  s: DriveSecrets,
  signal: AbortSignal,
): Promise<{ file: Record<string, unknown> | null; sent: number; chunks: number; exceeded: boolean }> => {
  const reader = body.getReader()
  const buf = new Uint8Array(RESUMABLE_CHUNK_BYTES)
  let fill = 0
  let sent = 0
  let chunks = 0
  // 중간 청크 — Drive가 전부 받았는지 308의 Range로 확인하고, 덜 받았으면 나머지를 다시 보낸다.
  const flush = async () => {
    let off = 0
    for (let attempt = 0; attempt < 3 && off < fill; attempt++) {
      const r = await putChunk(session, buf.subarray(off, fill), sent + off, false, token, s, signal)
      if (r.done) throw new Error('중간 청크에서 Drive가 업로드를 끝냈다')
      off = r.persistedEnd + 1 - sent
    }
    if (off !== fill) throw new Error(`Drive가 청크를 다 받지 않았다: ${sent + off}/${sent + fill}`)
    sent += fill
    fill = 0
    chunks++
  }
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (sent + fill + value.length > MAX_RESUMABLE_BYTES) {
      await reader.cancel()
      return { file: null, sent: sent + fill + value.length, chunks, exceeded: true }
    }
    let v = value
    while (v.length) {
      const n = Math.min(v.length, RESUMABLE_CHUNK_BYTES - fill)
      buf.set(v.subarray(0, n), fill)
      fill += n
      v = v.subarray(n)
      if (fill === RESUMABLE_CHUNK_BYTES) await flush()
    }
  }
  // 마지막 청크(0바이트일 수 있다 — 스트림이 청크 경계에서 끝난 경우).
  const r = await putChunk(session, buf.subarray(0, fill), sent, true, token, s, signal)
  if (!r.done) throw new Error('마지막 청크 뒤에도 Drive가 업로드를 끝내지 않았다')
  sent += fill
  chunks++
  return { file: r.file, sent, chunks, exceeded: false }
}

// 세션을 버린다(Drive 규약: 세션 URI에 DELETE → 499). 실패해도 무시한다 — 세션은 1주 뒤 스스로 만료된다.
const cancelResumable = async (session: string) => {
  try { const r = await fetch(session, { method: 'DELETE' }); await r.body?.cancel() } catch { /* 무시 */ }
}

const deleteDriveFile = async (id: string, token: string, s: DriveSecrets) => {
  await driveFetch(`https://www.googleapis.com/drive/v3/files/${id}`, { method: 'DELETE' }, token, s)
}

// ───────────────────────── 파일명·형식 ─────────────────────────

// 🔴 확장자를 먼저 본다. LH는 hwpx에도 application/octet-stream을 준다.
const EXT_MIME: Record<string, string> = {
  hwpx: 'application/vnd.hancom.hwpx',
  hwp: 'application/x-hwp',
  pdf: 'application/pdf',
  zip: 'application/zip',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  txt: 'text/plain',
}

const mimeFor = (filename: string, headerType: string | null): string => {
  const ext = filename.includes('.') ? filename.split('.').pop()!.toLowerCase() : ''
  if (ext && EXT_MIME[ext]) return EXT_MIME[ext]
  const clean = (headerType ?? '').split(';')[0].trim()
  // Google 형식이 섞여 들어오면 변환이 일어난다. 절대 그대로 쓰지 않는다.
  if (clean && !clean.startsWith('application/vnd.google-apps')) return clean
  return 'application/octet-stream'
}

// 🔴 LH는 Content-disposition에 UTF-8 바이트를 그대로 싣는다(RFC 5987 형식이 아니다).
//   HTTP 헤더는 latin-1로 읽히므로 "경남"이 "ê²½ë¨"이 되어 도착한다.
//   되돌릴 수 있을 때만 되돌린다 — UTF-8로 해석되지 않으면(EUC-KR 등) 그대로 둔다.
const repairLatin1Utf8 = (s: string): string => {
  let hasHigh = false
  for (const ch of s) {
    const c = ch.charCodeAt(0)
    if (c > 0xff) return s   // 이미 제대로 읽힌 문자열이다. 건드리지 않는다.
    if (c >= 0x80) hasHigh = true
  }
  if (!hasHigh) return s
  try {
    const bytes = Uint8Array.from([...s].map((c) => c.charCodeAt(0)))
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return s
  }
}

// Content-disposition에서 파일명을 뽑는다. filename*(RFC 5987)을 먼저 본다.
const filenameFromDisposition = (cd: string | null): string | null => {
  if (!cd) return null
  const star = cd.match(/filename\*\s*=\s*([^']*)'([^']*)'([^;]+)/i)
  if (star) {
    try { return decodeURIComponent(star[3].trim()) } catch { /* 아래로 */ }
  }
  const plain = cd.match(/filename\s*=\s*"?([^";]+)"?/i)
  if (!plain) return null
  const raw = plain[1].trim()
  let out = raw
  try {
    out = decodeURIComponent(raw) || raw
  } catch {
    out = raw
  }
  return repairLatin1Utf8(out)
}

// 파일명에 경로 구분자가 섞이면 Drive에서 이상해진다. 한 겹 정리한다.
const safeName = (name: string): string =>
  name.replace(/[\/\\]/g, '_').replace(/^\.+/, '').trim().slice(0, 200) || 'attachment'

// ───────────────────────── 큰 첨부 — 요청 처리 ─────────────────────────
//
// 종전 업로드 경로와 응답 모양을 맞춘다(uploaded · drive.{action,…}). 다른 점:
//   · 원본 sha256을 계산하지 않는다(위 주석) — `sha256`은 null, 비교는 Drive 값으로 한다
//   · 같은 이름이 있으면 **올린 뒤에** 가린다: 내용이 같으면 새 파일을 지우고 skipped_identical,
//     다르면 on_dupe=skip은 새 파일을 지우고 conflict(종전처럼 아무것도 바뀌지 않는다),
//     on_dupe=replace는 처음부터 기존 파일 ID에 PATCH 세션을 연다
//   · 재는 값: 걸린 시간(LH 수신+Drive 전송) · 청크 수 · 메모리(`Deno.memoryUsage`, 있으면)
const handleResumable = async (
  res: Response,
  base: Record<string, unknown>,
  declaredLen: number | null,
  p: { announcementId: string; folderId: string; nameOverride: string | null; onDupe: string; current: URL },
  started: number,
  ac: AbortController,
  timer: number,
): Promise<Response> => {
  const out: Record<string, unknown> = { ...base, limit_bytes: MAX_RESUMABLE_BYTES, transfer: 'resumable' }
  const finish = (extra: Record<string, unknown>, status = 200) => {
    clearTimeout(timer)
    let memory: unknown = null
    try { memory = (Deno as unknown as { memoryUsage?: () => unknown }).memoryUsage?.() ?? null } catch { memory = null }
    return json({ ...out, ...extra, memory, elapsed_ms: Date.now() - started }, status)
  }
  if (declaredLen !== null && Number.isFinite(declaredLen) && declaredLen > MAX_RESUMABLE_BYTES) {
    await res.body?.cancel()
    return finish({
      body_included: false, uploaded: false, reason: 'size_exceeded_declared',
      detail: `선언된 크기 ${declaredLen}B가 분할 상한 ${MAX_RESUMABLE_BYTES}B를 넘는다`, bytes: declaredLen,
    })
  }
  if (!res.body) return finish({ body_included: false, uploaded: false, reason: 'no_body' })

  const filename = safeName(
    p.nameOverride ||
    filenameFromDisposition(res.headers.get('content-disposition')) ||
    p.current.pathname.split('/').pop() ||
    'attachment',
  )
  const mimeType = mimeFor(filename, res.headers.get('content-type'))
  let secrets: DriveSecrets | null = null
  let session: string | null = null
  try {
    secrets = await getDriveSecrets()
    const token = await getAccessToken(secrets)
    const existing = await findFileInFolder(filename, p.folderId, token, secrets)
    const replaceId = existing && p.onDupe === 'replace' ? existing.id as string : null
    session = await openResumable(
      { name: filename, parent: p.folderId, mimeType, total: declaredLen, replaceFileId: replaceId },
      token, secrets,
    )
    const t0 = Date.now()
    const r = await streamResumable(res.body, session, token, secrets, ac.signal)
    const transferMs = Date.now() - t0
    if (r.exceeded) {
      await cancelResumable(session)
      return finish({
        body_included: false, uploaded: false, reason: 'size_exceeded_actual',
        detail: `실제 수신이 분할 상한 ${MAX_RESUMABLE_BYTES}B를 넘어 중단했다`, bytes_read_before_abort: r.sent,
      })
    }
    const uploaded = r.file as Record<string, unknown>
    const uploadedSize = uploaded.size === undefined ? null : Number(uploaded.size)
    let action = replaceId ? 'replaced' : 'uploaded'
    let comparedBy: string | null = null
    let file = uploaded
    if (existing && !replaceId) {
      const a = existing.sha256Checksum as string | undefined
      const b = uploaded.sha256Checksum as string | undefined
      let same: boolean
      if (a && b) {
        comparedBy = 'sha256Checksum'
        same = a.toLowerCase() === b.toLowerCase()
      } else {
        comparedBy = 'size'
        same = (existing.size === undefined ? null : Number(existing.size)) === uploadedSize
      }
      // 🔴 방금 올린 것을 지운다 — 같은 이름 두 벌을 폴더에 남기지 않는다.
      await deleteDriveFile(uploaded.id as string, token, secrets)
      action = same ? 'skipped_identical' : 'conflict'
      file = existing
    }
    return finish({
      bytes: r.sent,
      sha256: null,
      uploaded: action === 'uploaded' || action === 'replaced',
      body_included: false,
      reason: 'uploaded_via_drive',
      transfer_ms: transferMs,
      chunks: r.chunks,
      chunk_bytes: RESUMABLE_CHUNK_BYTES,
      drive: {
        action,
        secret_source: secrets.source,
        folder_source: 'param',
        notice_folder_id: p.folderId,
        file_id: file.id ?? null,
        file_name: file.name ?? null,
        file_size: file.size === undefined ? null : Number(file.size),
        file_mime_type: file.mimeType ?? null,
        file_sha256: file.sha256Checksum ?? null,
        file_md5: file.md5Checksum ?? null,
        web_view_link: file.webViewLink ?? null,
        requested_mime_type: mimeType,
        // 보낸 바이트 수와 Drive가 받은 크기. 원본 해시가 없으니 이것과 선언 크기가 무결성의 근거다.
        size_match: uploadedSize === null ? null : uploadedSize === r.sent,
        declared_match: declaredLen === null ? null : declaredLen === r.sent,
        uploaded_sha256: uploaded.sha256Checksum ?? null,
        mime_preserved: file.mimeType === mimeType,
        duplicate_compared_by: comparedBy,
      },
    })
  } catch (e) {
    if (session) await cancelResumable(session)
    return finish({
      ok: false, uploaded: false,
      drive_error: redact(String(e instanceof Error ? e.message : e), secrets),
    }, 502)
  }
}

// ───────────────────────── 본체 ─────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,x-cron-secret',
      },
    })
  }

  if (!matchCronSecret(req)) return json({ ok: false, error: 'unauthorized' }, 401)

  const reqUrl = new URL(req.url)
  const target = reqUrl.searchParams.get('url')
  // meta=1 이면 본문(base64)을 빼고 메타데이터만 돌려준다.
  const metaOnly = reqUrl.searchParams.get('meta') === '1'
  const mode = reqUrl.searchParams.get('mode') ?? 'fetch'
  const announcementId = reqUrl.searchParams.get('announcement_id')
  const nameOverride = reqUrl.searchParams.get('filename')
  // 같은 이름이 이미 있고 내용이 다를 때만 의미가 있다. 기본은 건드리지 않는 것.
  const onDupe = reqUrl.searchParams.get('on_dupe') ?? 'skip'
  // 🔴 미리 확보해 둔 공고 폴더의 ID. 오면 폴더를 찾지도 만들지도 않는다.
  const folderIdParam = reqUrl.searchParams.get('folder_id')
  // 🔴 큰 첨부 분할 업로드. 이 값이 없으면 아래 종전 경로가 한 줄도 달라지지 않는다.
  const largeParam = reqUrl.searchParams.get('large')

  // 시크릿이 어디에 있는지만 확인한다. 값은 돌려주지 않는다.
  if (mode === 'selftest') {
    const envPresent = {
      GDRIVE_CLIENT_ID: !!Deno.env.get('GDRIVE_CLIENT_ID'),
      GDRIVE_CLIENT_SECRET: !!Deno.env.get('GDRIVE_CLIENT_SECRET'),
      GDRIVE_REFRESH_TOKEN: !!Deno.env.get('GDRIVE_REFRESH_TOKEN'),
      GDRIVE_ROOT_FOLDER_ID: !!Deno.env.get('GDRIVE_ROOT_FOLDER_ID'),
      SUPABASE_DB_URL: !!Deno.env.get('SUPABASE_DB_URL'),
    }
    let secretSource: string | null = null
    let secretError: string | null = null
    try {
      secretSource = (await getDriveSecrets()).source
    } catch (e) {
      secretError = redact(String(e instanceof Error ? e.message : e), cachedSecrets)
    }
    return json({ ok: !secretError, env_present: envPresent, secret_source: secretSource, error: secretError })
  }

  // 🔴 공고 폴더만 확보하고 끝낸다 — 첨부를 받지 않는다.
  //   업로드를 여러 건 쏘기 **전에 한 번** 부르는 것이 이 모드의 용도다.
  //   폴더 생성이 한 곳에서만 일어나야 갈리지 않는다.
  if (mode === 'ensure_folder') {
    if (!announcementId) {
      return json({ ok: false, error: 'mode=ensure_folder에는 announcement_id가 필요하다' }, 400)
    }
    const startedAt = Date.now()
    let secrets: DriveSecrets | null = null
    try {
      secrets = await getDriveSecrets()
      const token = await getAccessToken(secrets)
      // 루트는 환경변수로 고정돼 있으면 그것을 쓴다.
      // root_folder_name이 null인 것이 곧 「이름찾기 분기를 타지 않았다」는 증거다.
      const rootEnv = Deno.env.get('GDRIVE_ROOT_FOLDER_ID')
      const root = rootEnv
        ? { id: rootEnv, created: false, createdTime: null }
        : await ensureFolder(DRIVE_ROOT_NAME, null, token, secrets)
      const noticeName = `[임시] ${announcementId}`
      const notice = await ensureFolder(noticeName, root.id, token, secrets)
      return json({
        ok: true,
        mode: 'ensure_folder',
        secret_source: secrets.source,
        root_folder_id: root.id,
        root_folder_created: root.created,
        root_folder_name: rootEnv ? null : DRIVE_ROOT_NAME,
        notice_folder_id: notice.id,
        notice_folder_name: noticeName,
        notice_folder_created: notice.created,
        // 🔴 Drive 서버 시각. 폴더가 갈렸는지 판정할 때 이것으로 순서를 본다.
        notice_folder_created_time: notice.createdTime,
        elapsed_ms: Date.now() - startedAt,
      })
    } catch (e) {
      return json({
        ok: false,
        mode: 'ensure_folder',
        error: redact(String(e instanceof Error ? e.message : e), secrets),
        elapsed_ms: Date.now() - startedAt,
      }, 502)
    }
  }

  const wantUpload = mode === 'upload'
  if (wantUpload && !announcementId) {
    return json({ ok: false, error: 'mode=upload에는 announcement_id가 필요하다' }, 400)
  }
  if (wantUpload && !['skip', 'replace'].includes(onDupe)) {
    return json({ ok: false, error: `on_dupe는 skip 또는 replace다: ${onDupe}` }, 400)
  }
  // 형식 검사는 Drive를 부르기 전에 한다. 이상한 값을 질의문에 넣지 않는다.
  if (wantUpload && folderIdParam !== null && !DRIVE_ID_RE.test(folderIdParam)) {
    return json({ ok: false, error: 'folder_id가 Drive ID 형식이 아니다' }, 400)
  }
  if (largeParam !== null && largeParam !== 'resumable') {
    return json({ ok: false, error: `large는 resumable만 받는다: ${largeParam}` }, 400)
  }
  const wantResumable = largeParam === 'resumable'
  // 🔴 분할 업로드는 미리 확보한 폴더에만 올린다 — 폴더를 여기서 만들지 않는다(check-then-act 없음).
  if (wantResumable && (!wantUpload || folderIdParam === null)) {
    return json({ ok: false, error: 'large=resumable은 mode=upload와 folder_id가 함께 있어야 한다' }, 400)
  }

  if (!target) return json({ ok: false, error: 'url 파라미터가 없다' }, 400)

  let current: URL
  try {
    current = new URL(target)
  } catch {
    return json({ ok: false, error: 'url을 파싱할 수 없다' }, 400)
  }

  const firstReject = rejectReason(current)
  if (firstReject) return json({ ok: false, error: firstReject }, 403)

  const started = Date.now()
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), wantResumable ? RESUMABLE_TIMEOUT_MS : FETCH_TIMEOUT_MS)
  // 어디를 거쳐 왔는지 남긴다. 리다이렉트가 실제로 일어나는지 이 값으로 안다.
  const hops: string[] = []

  try {
    let res: Response | null = null
    for (let i = 0; i <= MAX_REDIRECTS; i++) {
      res = await fetch(current.toString(), { signal: ac.signal, redirect: 'manual' })
      if (res.status < 300 || res.status >= 400) break
      const loc = res.headers.get('location')
      if (!loc) break
      await res.body?.cancel()
      // 상대 경로 Location도 있으므로 현재 URL 기준으로 푼다.
      const next = new URL(loc, current)
      const why = rejectReason(next)
      if (why) {
        clearTimeout(timer)
        // 🔴 허용 호스트가 허용 밖으로 넘기려 한 경우다. 따라가지 않는다.
        return json({
          ok: false,
          error: `리다이렉트가 허용목록을 벗어난다 — ${why}`,
          redirect_hops: hops,
          blocked_redirect_to: next.toString(),
        }, 403)
      }
      hops.push(next.toString())
      current = next
      if (i === MAX_REDIRECTS) {
        clearTimeout(timer)
        return json({ ok: false, error: `리다이렉트가 ${MAX_REDIRECTS}회를 넘었다`, redirect_hops: hops }, 502)
      }
    }
    if (!res) {
      clearTimeout(timer)
      return json({ ok: false, error: '응답이 없다' }, 502)
    }
    const whyType = typeReject(current, res.headers.get('content-type'))
    if (whyType) {
      await res.body?.cancel()
      clearTimeout(timer)
      return json({ ok: false, error: whyType, final_url: current.toString(), redirect_hops: hops }, 415)
    }

    const declared = res.headers.get('content-length')
    const declaredLen = declared === null ? null : Number(declared)

    const base: Record<string, unknown> = {
      ok: true,
      status: res.status,
      final_url: current.toString(),
      redirect_hops: hops,
      content_type: res.headers.get('content-type'),
      content_disposition: res.headers.get('content-disposition'),
      header_content_length: declared,
      limit_bytes: MAX_SOURCE_BYTES,
    }

    if (wantResumable) {
      return await handleResumable(res, base, declaredLen, {
        announcementId: announcementId as string,
        folderId: folderIdParam as string,
        nameOverride,
        onDupe,
        current,
      }, started, ac, timer)
    }

    // ① Content-length가 있고 상한을 넘으면 본문을 아예 받지 않는다.
    // 🔴 업로드 경로에서도 똑같이 막는다. 가드는 mode와 무관하다.
    if (declaredLen !== null && Number.isFinite(declaredLen) && declaredLen > MAX_SOURCE_BYTES) {
      await res.body?.cancel()
      clearTimeout(timer)
      return json({
        ...base,
        body_included: false,
        uploaded: false,
        reason: 'size_exceeded_declared',
        detail: `선언된 크기 ${declaredLen}B가 상한 ${MAX_SOURCE_BYTES}B를 넘는다`,
        bytes: declaredLen,
        elapsed_ms: Date.now() - started,
      })
    }

    if (!res.body) {
      clearTimeout(timer)
      return json({ ...base, body_included: false, uploaded: false, reason: 'no_body', elapsed_ms: Date.now() - started })
    }

    // ② Content-length가 없거나 거짓말인 경우까지 막으려면 실제로 세면서 받아야 한다.
    const { bytes, read } = await readCapped(res.body, MAX_SOURCE_BYTES)
    clearTimeout(timer)

    if (bytes === null) {
      return json({
        ...base,
        body_included: false,
        uploaded: false,
        reason: declared === null ? 'size_exceeded_undeclared' : 'size_exceeded_actual',
        detail: `실제 수신이 상한 ${MAX_SOURCE_BYTES}B를 넘어 중단했다`,
        bytes_read_before_abort: read,
        elapsed_ms: Date.now() - started,
      })
    }

    const srcSha = await sha256Hex(bytes)
    const payload: Record<string, unknown> = {
      ...base,
      // 🔴 실제로 받은 바이트 수. header와 어긋나면 그 자체가 정보다.
      bytes: bytes.length,
      sha256: srcSha,
      head_hex: Array.from(bytes.subarray(0, 8))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join(''),
    }

    if (wantUpload) {
      const filename = safeName(
        nameOverride ||
        filenameFromDisposition(res.headers.get('content-disposition')) ||
        current.pathname.split('/').pop() ||
        'attachment',
      )
      const mimeType = mimeFor(filename, res.headers.get('content-type'))
      let secrets: DriveSecrets | null = null
      try {
        secrets = await getDriveSecrets()
        const token = await getAccessToken(secrets)

        // 🔴 폴더를 어떻게 정하는가 — 이번 수리의 핵심이 여기다.
        let root: { id: string; created: boolean } | null = null
        let rootEnv: string | undefined
        let noticeName: string | null = null
        let notice: { id: string; created: boolean | null }
        let folderSource: 'param' | 'ensured'

        if (folderIdParam) {
          // 🔴 미리 확보된 폴더다. 찾지도 만들지도 않으므로 check-then-act가 없다.
          //   폴더 이름은 우리가 정한 것이 아니라 알 수 없다 — null로 둔다.
          notice = { id: folderIdParam, created: null }
          folderSource = 'param'
        } else {
          // ⚠️ 하위 호환 경로다. 종전대로 동작하지만 **동시 호출에 갈린다.**
          //   그래서 아래에서 응답에 경고를 남긴다 — 조용히 넘어가지 않게.
          folderSource = 'ensured'
          // 루트: 환경변수로 고정돼 있으면 그것을 쓰고, 없으면 이름으로 찾아 재사용한다.
          rootEnv = Deno.env.get('GDRIVE_ROOT_FOLDER_ID')
          root = rootEnv
            ? { id: rootEnv, created: false }
            : await ensureFolder(DRIVE_ROOT_NAME, null, token, secrets)

          // 공고별 폴더는 임시명이다 — 분석 후 표준명으로 정정하는 것이 기존 규약이다.
          // 🔴 유일해야 하므로 announcement_id를 포함한다.
          noticeName = `[임시] ${announcementId}`
          notice = await ensureFolder(noticeName, root.id, token, secrets)
        }

        // 중복 처리. 기본은 skip이고, 같은 이름이라도 내용이 다르면 조용히 넘어가지 않는다.
        const existing = await findFileInFolder(filename, notice.id, token, secrets)
        let action = 'uploaded'
        let comparedBy: string | null = null
        let file: Record<string, unknown>

        if (existing) {
          const remoteSha = existing.sha256Checksum as string | undefined
          const remoteSize = existing.size === undefined ? null : Number(existing.size)
          let same: boolean
          if (remoteSha) {
            comparedBy = 'sha256Checksum'
            same = remoteSha.toLowerCase() === srcSha
          } else {
            // Drive가 체크섬을 안 주는 경우가 있다. 그때는 크기만 볼 수 있고,
            // 그 사실을 응답에 남긴다 — 약한 근거로 같다고 말하지 않기 위해서다.
            comparedBy = 'size'
            same = remoteSize === bytes.length
          }
          if (same) {
            action = 'skipped_identical'
            file = existing
          } else if (onDupe === 'replace') {
            action = 'replaced'
            file = await uploadFile(
              { name: filename, parent: notice.id, mimeType, bytes, replaceFileId: existing.id as string },
              token, secrets,
            )
          } else {
            // 🔴 같은 이름인데 내용이 다르다. 지우지도 덮지도 않고 알린다.
            action = 'conflict'
            file = existing
          }
        } else {
          file = await uploadFile(
            { name: filename, parent: notice.id, mimeType, bytes, replaceFileId: null },
            token, secrets,
          )
        }

        const uploadedSize = file.size === undefined ? null : Number(file.size)
        payload.uploaded = action === 'uploaded' || action === 'replaced'
        payload.drive = {
          action,
          secret_source: secrets.source,
          // 폴더를 누가 정했는가. param이면 이 요청은 폴더를 만들 수 없었다.
          folder_source: folderSource,
          root_folder_id: root ? root.id : null,
          root_folder_created: root ? root.created : null,
          root_folder_name: root && !rootEnv ? DRIVE_ROOT_NAME : null,
          notice_folder_id: notice.id,
          notice_folder_name: noticeName,
          notice_folder_created: notice.created,
          file_id: file.id ?? null,
          file_name: file.name ?? null,
          file_size: uploadedSize,
          file_mime_type: file.mimeType ?? null,
          file_sha256: file.sha256Checksum ?? null,
          file_md5: file.md5Checksum ?? null,
          web_view_link: file.webViewLink ?? null,
          requested_mime_type: mimeType,
          // 🔴 세 가지를 각각 본다. 크기가 맞는 것만으로는 부족하다.
          size_match: uploadedSize === null ? null : uploadedSize === bytes.length,
          sha256_match: file.sha256Checksum
            ? (file.sha256Checksum as string).toLowerCase() === srcSha
            : null,
          mime_preserved: file.mimeType === mimeType,
          converted_to_google_format: typeof file.mimeType === 'string' &&
            (file.mimeType as string).startsWith('application/vnd.google-apps'),
          duplicate_compared_by: comparedBy,
        }
        if (folderSource === 'ensured') {
          // 🔴 종전 경로로 동작했다는 사실 자체를 알린다.
          payload.warning = 'folder_id 없이 불렀다 — 이 요청이 폴더를 직접 확보했다. ' +
            '같은 공고를 동시에 여러 건 쏘면 폴더가 갈린다. ' +
            'mode=ensure_folder로 먼저 확보하고 folder_id를 넘길 것.'
        }
      } catch (e) {
        payload.uploaded = false
        payload.drive_error = redact(String(e instanceof Error ? e.message : e), secrets)
      }
    }

    if (metaOnly || wantUpload) {
      // 업로드했으면 base64를 함께 돌려줄 이유가 없다 — 응답만 커진다.
      payload.body_included = false
      payload.reason = metaOnly ? 'meta_only' : 'uploaded_via_drive'
    } else {
      payload.body_included = true
      payload.base64 = toBase64(bytes)
      payload.base64_len = (payload.base64 as string).length
    }
    payload.elapsed_ms = Date.now() - started
    return json(payload)
  } catch (e) {
    clearTimeout(timer)
    return json({
      ok: false,
      error: redact(String(e instanceof Error ? e.message : e), cachedSecrets),
      redirect_hops: hops,
      elapsed_ms: Date.now() - started,
    }, 502)
  }
})
