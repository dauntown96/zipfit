// 공고 첨부 대리 수신 Edge Function
//
// 두 가지 일을 한다.
//   ① 허용된 공고 사이트의 첨부 URL 하나를 받아 그 바이트를 base64로 돌려준다.
//   ② (mode=upload) 그 바이트를 Google Drive에 직접 올린다.
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
const ALLOWED: Record<string, string[] | null> = {
  'apply.lh.or.kr': ['/lhapply/'],
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

const findFolder = async (
  name: string,
  parent: string | null,
  token: string,
  s: DriveSecrets,
): Promise<string | null> => {
  const parts = [
    `name='${q(name)}'`,
    "mimeType='application/vnd.google-apps.folder'",
    'trashed=false',
  ]
  if (parent) parts.push(`'${q(parent)}' in parents`)
  const url = 'https://www.googleapis.com/drive/v3/files?' + new URLSearchParams({
    q: parts.join(' and '),
    fields: 'files(id,name)',
    pageSize: '10',
  })
  const body = await driveFetch(url, { method: 'GET' }, token, s)
  const files = (body.files as Array<{ id: string }> | undefined) ?? []
  return files.length ? files[0].id : null
}

const createFolder = async (
  name: string,
  parent: string | null,
  token: string,
  s: DriveSecrets,
): Promise<string> => {
  const metadata: Record<string, unknown> = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
  }
  if (parent) metadata.parents = [parent]
  const body = await driveFetch(
    'https://www.googleapis.com/drive/v3/files?fields=id,name',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(metadata) },
    token,
    s,
  )
  return body.id as string
}

const ensureFolder = async (
  name: string,
  parent: string | null,
  token: string,
  s: DriveSecrets,
): Promise<{ id: string; created: boolean }> => {
  const found = await findFolder(name, parent, token, s)
  if (found) return { id: found, created: false }
  return { id: await createFolder(name, parent, token, s), created: true }
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

  const wantUpload = mode === 'upload'
  if (wantUpload && !announcementId) {
    return json({ ok: false, error: 'mode=upload에는 announcement_id가 필요하다' }, 400)
  }
  if (wantUpload && !['skip', 'replace'].includes(onDupe)) {
    return json({ ok: false, error: `on_dupe는 skip 또는 replace다: ${onDupe}` }, 400)
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
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS)
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

        // 루트: 환경변수로 고정돼 있으면 그것을 쓰고, 없으면 이름으로 찾아 재사용한다.
        // 🔴 매번 새로 만들면 폴더가 쌓인다. 찾기를 먼저 한다.
        const rootEnv = Deno.env.get('GDRIVE_ROOT_FOLDER_ID')
        const root = rootEnv
          ? { id: rootEnv, created: false }
          : await ensureFolder(DRIVE_ROOT_NAME, null, token, secrets)

        // 공고별 폴더는 임시명이다 — 분석 후 표준명으로 정정하는 것이 기존 규약이다.
        // 🔴 유일해야 하므로 announcement_id를 포함한다.
        const noticeName = `[임시] ${announcementId}`
        const notice = await ensureFolder(noticeName, root.id, token, secrets)

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
          root_folder_id: root.id,
          root_folder_created: root.created,
          root_folder_name: rootEnv ? null : DRIVE_ROOT_NAME,
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
