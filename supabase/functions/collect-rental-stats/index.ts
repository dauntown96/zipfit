import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const API_KEY = Deno.env.get('ODCLOUD_API_KEY')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// 5개 API 엔드포인트
const APIS = [
  { name: '국민임대', path: '/15084926/v1/uddi:bc7f22b9-b711-4a07-9de3-f0668c1d64c6', updated: '2026-05-13' },
  { name: '영구임대', path: '/15084928/v1/uddi:c9e71f1d-583e-442f-be76-eabcf906de9d', updated: '2026-05-14' },
  { name: '행복주택', path: '/15084930/v1/uddi:3b58c31a-5326-42ea-86ff-c20f76a0f084', updated: '2026-05-14' },
  { name: '장기전세', path: '/15084929/v1/uddi:40e59900-e957-485b-84aa-b6b969c08eb0', updated: '2026-05-14' },
  { name: '50년임대', path: '/15084925/v1/uddi:8a83a554-025d-4d9d-9ead-974ceb24d356', updated: '2026-05-14' },
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
  try {
    // 환경변수 확인
    console.log('SUPABASE_URL:', Deno.env.get('SUPABASE_URL') ? '✅' : '❌ 없음')
    console.log('SUPABASE_SERVICE_ROLE_KEY:', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ? '✅' : '❌ 없음')
    console.log('ODCLOUD_API_KEY:', Deno.env.get('ODCLOUD_API_KEY') ? '✅' : '❌ 없음')

    // 국민임대 1페이지 1건만 테스트
    const testPath = '/15084926/v1/uddi:bc7f22b9-b711-4a07-9de3-f0668c1d64c6'
    const url = `${BASE_URL}${testPath}?page=1&perPage=1&serviceKey=${API_KEY}`
    console.log('API 호출 URL:', url.replace(API_KEY, '***'))

    const res = await fetch(url)
    console.log('API 응답 status:', res.status)

    const json = await res.json()
    console.log('API 응답 totalCount:', json.totalCount)
    console.log('API 응답 data[0]:', JSON.stringify(json.data?.[0]))

    // DB insert 테스트
    const row = json.data?.[0]
    if (row) {
      const { data, error } = await supabase
        .from('rental_housing_stats')
        .insert({
          임대종류: '국민임대',
          광역시도: row['광역시도'] ?? '',
          시군구: row['시군구'] ?? '',
          단지명: row['단지명'] ?? '',
          형명: row['형명'] ?? '',
          임대보증금: row['임대보증금'] ?? null,
          월임대료: row['월임대료'] ?? null,
          source_updated_at: '2026-05-13',
          collected_at: new Date().toISOString(),
        })
        .select()

      console.log('DB insert 결과:', JSON.stringify({ data, error }))
    }

    return new Response(JSON.stringify({
      success: true,
      totalCount: json.totalCount,
      sample: json.data?.[0],
      message: '디버그 테스트 완료'
    }), { headers: { 'Content-Type': 'application/json' } })

  } catch (e) {
    console.error('오류:', e)
    return new Response(JSON.stringify({
      success: false,
      error: String(e),
      stack: e instanceof Error ? e.stack : undefined
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})
