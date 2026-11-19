// node --experimental-strip-types supabase/functions/complex-geo-fill/logic.test.mts
import assert from 'node:assert/strict'
import { keywordOf, keywordWithoutBadSido, isExact, exactCandidates, pickByName, pickByBldhub, utmkToWgs84 } from './logic.ts'

// 좌표: 합성 격자점(juso 값 아님 — 2026-11-19 우편함 「코드·운영 — 11장」 · juso 좌표는 국내 서버에만) · 기대값은 pyproj EPSG:5179 → 4326 · 1e-7도(약 1cm) 안
//   (1000000, 2000000) = UTM-K 원점(위도 38 · 경도 127.5 — 정의값)
for (const [x, y, lat, lng] of [[1000000, 2000000, 38, 127.5],
  [950000, 1950000, 37.5479809948, 126.9339656293], [960000, 1800000, 36.1963176016, 127.0550809177]]) {
  const r = utmkToWgs84(x, y)
  assert.ok(Math.abs(r.lat - lat) < 1e-7 && Math.abs(r.lng - lng) < 1e-7, `${r.lat},${r.lng}`)
}
assert.equal(keywordOf('경기도 광명시 광명2동 88-14번지 일원 107동'), '경기도 광명시 광명2동 88-14')
assert.equal(keywordOf('경기도 수원시 영통구 원천동 영통구 원천동 295-1,295-5'), '경기도 수원시 영통구 원천동 295-1')
assert.equal(keywordOf('경상북도 구미시 구평동 941 207동 901호'), '경상북도 구미시 구평동 941')
assert.equal(keywordOf('하남시 감일순환로 40(감이동)'), '하남시 감일순환로 40')
assert.equal(keywordWithoutBadSido('강원특별차지도 인제군 서화면 천도로81번길 43'), '인제군 서화면 천도로81번길 43')
assert.equal(keywordWithoutBadSido('경기도 광명시 광명1동 9-8'), null)

const a1 = '경기도 광명시 광명2동 88-14번지 일원 107동'
const k1 = keywordOf(a1)
const ok1 = { sggNm: '광명시', emdNm: '광명동', liNm: '', lnbrMnnm: '88', lnbrSlno: '14', mtYn: '0', rn: '광이로', buldMnnm: '49', buldSlno: '0', bdNm: '광명센트럴아이파크' }
assert.ok(isExact(a1, k1, ok1))
assert.ok(!isExact(a1, k1, { ...ok1, lnbrSlno: '15' }))
assert.ok(!isExact(a1, k1, { ...ok1, sggNm: '시흥시' }))
// 산
const a2 = '부산광역시 남구 문현동 산 23-1'
assert.ok(isExact(a2, keywordOf(a2), { sggNm: '남구', emdNm: '문현동', lnbrMnnm: '23', lnbrSlno: '1', mtYn: '1', rn: '진남로', buldMnnm: '275', buldSlno: '0' }))
assert.ok(!isExact(a2, keywordOf(a2), { sggNm: '남구', emdNm: '문현동', lnbrMnnm: '23', lnbrSlno: '1', mtYn: '0', rn: '진남로', buldMnnm: '275', buldSlno: '0' }))
// 리
const a3 = '김포시 양촌읍 양곡리 488-3'
assert.ok(isExact(a3, keywordOf(a3), { sggNm: '김포시', emdNm: '양촌읍', liNm: '양곡리', lnbrMnnm: '488', lnbrSlno: '3', mtYn: '0', rn: '양곡4로', buldMnnm: '164', buldSlno: '3' }))
// 도로명 꼴
const a4 = '하남시 감일순환로 40(감이동)'
assert.ok(isExact(a4, keywordOf(a4), { sggNm: '하남시', emdNm: '감이동', lnbrMnnm: '999', rn: '감일순환로', buldMnnm: '40', buldSlno: '0' }))
assert.ok(!isExact(a4, keywordOf(a4), { sggNm: '하남시', emdNm: '감이동', lnbrMnnm: '999', rn: '감일순환로', buldMnnm: '41', buldSlno: '0' }))
const a5 = '강원특별차지도 인제군 서화면 천도로81번길 43'
assert.ok(isExact(a5, keywordWithoutBadSido(keywordOf(a5))!, { sggNm: '인제군', emdNm: '서화면', rn: '천도로81번길', buldMnnm: '43', buldSlno: '0' }))

// 여러 결과: 같은 건물 줄 겹침은 하나 · 이름 고르기 · 건축HUB 고르기
const base = { sggNm: '광명시', emdNm: '광명동', lnbrMnnm: '9', lnbrSlno: '8', mtYn: '0' }
const c = [{ ...base, rn: '오리로', buldMnnm: '1', bdNm: '광명 포레나 1단지' }, { ...base, rn: '오리로', buldMnnm: '1', bdNm: '광명 포레나 1단지' },
  { ...base, rn: '오리로', buldMnnm: '3', bdNm: '광명 포레나 2단지' }, { ...base, rn: '오리로', buldMnnm: '5', bdNm: '광명 포레나 3단지' }]
const a6 = '경기도 광명시 광명1동 9-8번지 일원 302동'
const ex = exactCandidates(a6, keywordOf(a6), c)
assert.equal(ex.length, 3)
assert.equal(pickByName(ex, ['광명 포레나']), null)            // 셋 다 품음 → 못 고름
assert.equal(pickByName(ex, ['광명포레나2단지'])?.buldMnnm, '3')
assert.equal(pickByName(ex, []), null)
assert.equal(pickByBldhub(ex, ['경기도 광명시 오리로 5 (광명동)'])?.buldMnnm, '5')
assert.equal(pickByBldhub(ex, ['경기도 광명시 오리로 55 (광명동)']), null)
assert.equal(pickByBldhub(ex, []), null)
console.log('logic.test ok')
