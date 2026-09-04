import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const requireEnv = (key: string): string => {
  const v = Deno.env.get(key)
  if (!v) throw new Error(`필수 환경변수 누락: ${key}`)
  return v
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const API_KEY = Deno.env.get('ODCLOUD_API_KEY')!
// 🔴 CRON_SECRET 교체 구간(2026-09-04) — 구 값과 신 값을 모두 수용한다.
// 값 교체는 원자적이지 않다: 대시보드 시크릿 변경과 cron 잡 재작성 사이에 발화한 잡이
// 401로 조용히 실패하고 collection_run_log에 흔적조차 남지 않는다. 그 구간을 없애려고
// 이중 수용을 둔다. 교체가 끝나면 구 값 수용을 걷어낸 뒤에 대시보드에서 구 값을 삭제한다
// (순서 역전 금지 — requireEnv('CRON_SECRET')이 필수라 먼저 삭제하면 EF가 부팅 즉시 throw).
const CRON_SECRET    = requireEnv('CRON_SECRET')
const CRON_SECRET_V2 = Deno.env.get('CRON_SECRET_V2') ?? null

const matchCronSecret = (req: Request): 'v1' | 'v2' | null => {
  const got = req.headers.get('x-cron-secret')
  if (!got) return null
  if (CRON_SECRET_V2 !== null && got === CRON_SECRET_V2) return 'v2'
  if (got === CRON_SECRET) return 'v1'
  return null
}

// 인증만 확인하고 즉시 반환한다(수집·외부 호출 없음). 시크릿 값은 담지 않는다.
const authcheckResponse = (matched: 'v1' | 'v2') => new Response(JSON.stringify({
  mode: 'authcheck', ok: true, matched, v2_configured: CRON_SECRET_V2 !== null,
}), { headers: { 'Content-Type': 'application/json' } })

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// 5개 API 엔드포인트
const APIS = [
  { name: '영구임대', path: '/15084928/v1/uddi:c9e71f1d-583e-442f-be76-eabcf906de9d', updated: '2026-05-14' },
  { name: '행복주택', path: '/15084930/v1/uddi:3b58c31a-5326-42ea-86ff-c20f76a0f084', updated: '2026-05-14' },
  { name: '장기전세', path: '/15084929/v1/uddi:40e59900-e957-485b-84aa-b6b969c08eb0', updated: '2026-05-14' },
  { name: '50년임대', path: '/15084925/v1/uddi:8a83a554-025d-4d9d-9ead-974ceb24d356', updated: '2026-05-14' },
  { name: '국민임대', path: '/15084926/v1/uddi:bc7f22b9-b711-4a07-9de3-f0668c1d64c6', updated: '2026-05-13' },
]

const BASE_URL = 'https://api.odcloud.kr/api'
const SOURCE_UPDATED_AT = '2026-05-14' // 가장 최근 업데이트 날짜

async function fetchAllPages(path: string): Promise<any[]> {
  const results: any[] = []
  let page = 1
  const perPage = 1000

  while (true) {
    const url = `${BASE_URL}${path}?page=${page}&perPage=${perPage}&serviceKey=${API_KEY}`
    const res = await fetch(url)
    if (!res.ok) {
      console.error(`API 오류: ${path} page=${page} status=${res.status}`)
      break
    }
    const json = await res.json()
    const data = json.data ?? []
    results.push(...data)

    if (results.length >= json.totalCount) break
    page++
  }

  return results
}

async function detectAndRecordChanges(
  단지명: string,
  형명: string,
  existing: any,
  incoming: any
) {
  const watchFields = ['임대보증금', '월임대료', '전환보증금', '세대수']
  const changes = []

  for (const field of watchFields) {
    const oldVal = String(existing[field] ?? '')
    const newVal = String(incoming[field] ?? '')
    if (oldVal !== newVal) {
      changes.push({
        stat_id: existing.id,
        단지명,
        형명,
        field_name: field,
        old_value: oldVal,
        new_value: newVal,
        detected_at: new Date().toISOString(),
      })
    }
  }

  if (changes.length > 0) {
    const { error } = await supabase
      .from('rental_housing_history')
      .insert(changes)
    if (error) console.error('history insert 오류:', error)
    else console.log(`변동 감지: ${단지명} ${형명} - ${changes.length}개 필드`)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,x-cron-secret',
  }})
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  const matched = matchCronSecret(req)
  if (!matched) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }
  if (new URL(req.url).searchParams.get('mode') === 'authcheck') return authcheckResponse(matched)

  try {
    // body에서 target 읽기 (없으면 전체)
    let target: string | null = null
    try {
      const body = await req.json()
      target = body.target ?? null
    } catch {}

    const apisToRun = target
      ? APIS.filter(a => a.name === target)
      : APIS

    console.log(`실행 대상: ${apisToRun.map(a => a.name).join(', ')}`)

    let totalUpserted = 0

    for (const api of apisToRun) {
      console.log(`수집 시작: ${api.name}`)
      const rows = await fetchAllPages(api.path)
      console.log(`${api.name} API 수집: ${rows.length}건`)

      // 같은 단지명+형명 중복 제거 (API 데이터 자체 중복 방어)
      const seen = new Set<string>()
      const dedupedRows = rows.filter(row => {
        const key = `${row['단지명']}||${row['형명']}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      console.log(`${api.name} 중복 제거: ${rows.length}건 → ${dedupedRows.length}건`)

      const BATCH = 500
      for (let i = 0; i < dedupedRows.length; i += BATCH) {
        const batch = dedupedRows.slice(i, i + BATCH)
        const payload = batch.map(row => ({
          임대종류: api.name,
          광역시도: row['광역시도'] ?? '',
          시군구: row['시군구'] ?? '',
          도로명주소: row['도로명주소'] ?? '',
          단지명: row['단지명'] ?? '',
          형명: row['형명'] ?? '',
          세대수: row['세대수'] ?? null,
          주택유형: row['주택유형'] ?? '',
          임대사업자: row['임대사업자'] ?? '',
          준공일자: row['준공일자'] ?? '',
          건물형태: row['건물형태'] ?? '',
          난방방식: row['난방방식'] ?? '',
          공급면적_전용: row['공급면적(전용)'] ?? '',
          공급면적_공용: row['공급면적(공용)'] ?? '',
          임대보증금: row['임대보증금'] ?? null,
          월임대료: row['월임대료'] ?? null,
          전환보증금: row['전환보증금'] ?? null,
          source_updated_at: SOURCE_UPDATED_AT,
          collected_at: new Date().toISOString(),
        }))

        const { error } = await supabase
          .from('rental_housing_stats')
          .upsert(payload, {
            onConflict: '단지명,형명,source_updated_at',
            ignoreDuplicates: false
          })

        if (error) {
          console.error(`upsert 오류:`, JSON.stringify(error))
        } else {
          totalUpserted += batch.length
        }
      }
      console.log(`${api.name} 완료: ${dedupedRows.length}건`)
    }

    return new Response(JSON.stringify({
      success: true,
      target: target ?? 'ALL',
      upserted: totalUpserted,
      message: `수집 완료: ${totalUpserted}건 upsert`
    }), { headers: { 'Content-Type': 'application/json' } })

  } catch (e) {
    console.error('오류:', String(e))
    return new Response(JSON.stringify({
      success: false,
      error: String(e)
    }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
