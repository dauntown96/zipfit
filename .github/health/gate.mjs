// 0단계 관문 — 운영 점검 실패를 「루틴을 멈추는 것」과 「안 멈추는 것」으로 가른다(2026-10-15 · 다운님 결정 · 우편함 「코드 — … 0단계 관문 항목별 …」 4).
//   원칙: 멈춤 = 그 실패가 열린 채로 분석이 데이터를 쓰면 틀린 값이 들어가거나 되돌리기 어려워지는 실패 → 라벨 health-ops(루틴 v2.6 이 멈춘다).
//         안 멈춤 = 수집·이미지·백업·화면·발송 지연·시뮬레이션 같은 나머지 → 라벨 health-ops-soft(v2.6 이 보지 않는다 — 지시 변경 없이 효과).
//   근거: 10-08~15 fail 항목(dispatch 21 · sh_fresh 5 · simulate 2 · anon_list 3 · images 1 · backup 1) 중 분석 데이터 쓰기를 위험하게 하는 것 0 —
//         그런데 run 176 은 #407 simulate 오탐으로 미착수했고, #510(SH 경과)이 분석 전체를 막았다.
//   🔴 여기 없는 ❌ 항목은 전부 「안 멈춤」이다. 새 ❌ 항목을 더하는 PR 은 같은 PR 에서 이 목록을 정한다(CLAUDE.md 원칙 33).
//   「점검 실행」(runner — 관리 API 인증·장애로 DB 점검 불능)은 여기 넣지 않는다 — 종전대로 health-ops-blind 이슈가 맡고 6시간 넘으면 health-ops 로 승격한다(issue.sh).
//   db-apply(마이그레이션 적용 실패)는 이 점검 밖(db-migrations.yml)이고 라벨 그대로 멈춘다.
export const HARD = new Map([
  ['fn_copy', 'DB 함수 정의 ≠ supabase/rpc/ 사본 — 분석이 쓰는 트리거·함수가 저장소가 아는 것과 다르다(검증한 적 없는 정의 위에 쓰게 된다)'],
  ['simulate_hard', '「멈추는」 실패 흉내(수동 입력 simulate=fail_hard) — 관문 시험용'],
])

// failed = 결과 파일의 failed(ids) → { hard, soft, runner }
export function splitFailed(failed) {
  const hard = [], soft = []
  let runner = false
  for (const id of failed) {
    if (id === 'runner') runner = true
    else if (HARD.has(id)) hard.push(id)
    else soft.push(id)
  }
  return { hard, soft, runner }
}
