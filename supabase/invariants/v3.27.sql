-- ZipFit 불변식 검사 (v3.27 · 2026-11-11)
--   v3.27: V24b — 정책 행 key_rank 가 카드 묶음(get_announcement_group_ids — 화면 카드 하나 = 같은 묶음 공고들) 안에서 같은 순위로 둘 이상이면 위반.
--          V24 는 공고 하나 안만 본다(부분 유일 색인과 같은 축) — 원문 ID·정정본·MYHOME 블록이 한 카드로 묶이면 순위가 카드에서 겹칠 수 있다.
--          순위는 대표 ID 정책 행에만 둔다(#960 회신 ⑦ 1 · claude.ai 판정) — 화면이 key_rank 를 읽기 전에 까는 바닥(우편함 「코드·운영 — 0장 다섯」 4).
--          key_rank 행이 있는 공고에서만 묶음을 부른다(지금 0행 → 묶음 호출 0). 그 밖 검사는 v3.26과 한 글자도 다르지 않다.
--   v3.26: V24 — 정책 행 key_rank(꼭 볼 것 순위 · 마이그레이션 2026-11-10_04)가 같은 공고 안에서 겹치거나 1~3 밖이면 위반.
--          칸은 to_jsonb(p) ->> 'key_rank' 로 읽는다(적용 전 측정에도 돈다 — V19 와 같은 꼴). 표에 부분 유일 색인·CHECK 도 있다 — 이 줄은 그 둘이 빠져도 잡는 그물이다.
--          그 밖 검사는 v3.25와 한 글자도 다르지 않다.
--   v3.25: V9가 「건물::unit_type」 키도 받는다 — 분석 스킬 v11.4 「묶음 안 특정 형만의 평면 → 건물::unit_type · 묶음 전체 평면 → 건물::unit_group」.
--          종전 V9는 coalesce(unit_group, unit_type)만 대조해 unit_group이 있는 세대의 unit_type 키(연천전곡1 …20996 46A)를 위반으로 잡았다.
--          그 밖 검사는 v3.24와 한 글자도 다르지 않다.
--   v2:   V1이 컬럼 단위 GRANT를 못 보던 구멍을 메움 · usage_events 허용목록 추가
--   v3:   V8 보관 기간 감시 신설(삭제 잡 jobid 14가 조용히 죽는 것을 잡는다)
--   v3.1: allow_exec_funcs 에 get_announcement_price_summary 추가 — 그 한 줄뿐이다.
--         🔴 실제 문제가 아니라 허용목록이 낡았던 것이다. 카드 1층 요약이 anon 으로 부르므로
--            열려 있는 것이 맞다(2026-09-14 신설, supabase/rpc/get_announcement_price_summary.sql).
--   v3.2: V7에서 기본기준 매입임대/전세형 한 행(id 39d44cc1-…)의 car_limit NULL만 예외로 둔다 — V7의 조건과 detail 두 곳뿐이다.
--         🔴 조건을 넓히지 않았다. 그 행의 asset_limit NULL, 다른 행의 car_limit NULL은 여전히 위반이다.
--            근거와 예외 조건은 V7 주석에 있다(2026-09-23 B22).
--         🔴 v3.1·v3 파일은 v7 과 v8 사이에 쉼표가 없어 그대로는 42601(syntax error at or near "v8")로 죽는다.
--            v3.2에서 쉼표를 넣었다. 옛 파일은 README 규약대로 고치지 않고 둔다(2026-09-23 B22 실측).
--   v3.3: 공고 분석 스킬 v9.3 불변식 10·11을 DB 전체 검사로 더한다(2026-09-29 EF 회차 6).
--         V9  = 불변식 10 — announcement_extras.unit_key 가 같은 announcement_id 세대 행 묶음
--               (건물 머리 키 또는 「건물 머리 키::주택형」)에 닿는가.
--         V10a = 불변식 11 — 경로 표 행의 period·site·phase·note_text 가 근거 정책 행 content_raw 의 부분 문자열인가 ·
--               근거 행이 있고 category 가 「모집일정」인가(스킬 규칙 12-2) · route 3값.
--         V10c = 불변식 11 「갈리는 공고에 경로 0행」의 근사 — 🔴 단지 축만 본다: 같은 그룹 모집일정 행에
--               「단지명 :」 줄이 서로 다른 값 둘 이상인데 그룹에 경로 행이 0인 활성 공고. 순위·경로 축은 원문 문장이
--               제각각이라 SQL로 가르지 않았다(과잉 탐지를 막으려 좁혔다 — 이 검사가 0이어도 순위 축 누락은 남을 수 있다).
--   v3.4: 공고 분석 스킬 v9.4 불변식 12를 DB 전체 검사로 더한다(2026-09-29 B66).
--         V12 = 완료 계열(announcement_analysis.status 가 「완료」로 시작) 공고 중 announcement_promo_files 행이 있는데
--               같은 그룹(get_announcement_group_ids)의 announcement_extras 가 0인 공고. 🔴 고치지 않고 목록만 낸다 —
--               연결은 분석 회차 몫이다. 그룹으로 세는 까닭: 규약 29로 세대 행(과 이미지)이 블록 ID에 살 수 있다.
--   v3.5: V12 를 「목록 주소에 맞는 홍보물」로 좁힌다(2026-10-01 · B73 검증 — 다운님·claude.ai 판정).
--         홍보물 행 주소(dng_hs_adr, 없으면 row_address)와 같은 그룹 세대 행 주소(housing_units.address)를 맞춰,
--         맞는 홍보물이 하나라도 있는데 그룹 이미지가 0인 공고만 센다. 목록 밖 건물의 홍보물(제주 …0835 소노빌 ·
--         외도일동 — 세대 행은 이도일동 벨라시티프리미어)은 위반이 아니다(잇지 않는 것이 맞다 — B68 판정 두 번째 적용).
--         맞추는 키 = 첫 「(」 앞 도로명 주소에서 공백을 모두 뺀 것(「서울특별시강남구언주로69길23-4」). 괄호 안 동·건물명과
--         끝 공백·띄어쓰기 차이는 보지 않는다. 🔴 주소 꼴이 달라 맞지 않는 홍보물(지번만 적힌 행 등)은 이 검사에서 빠진다 —
--         넓게 잡던 v3.4 보다 덜 잡는 쪽으로 좁혔다(목록 세대 행 주소가 없는 공고는 V12 대상이 아니다).
--   v3.6: allow_exec_funcs 에 get_revision_analysis_done 추가 — 그 한 줄뿐이다(2026-10-01 · 우편함 「코드 — 발송기 진전 없는 되돌림 막기 ·
--         정정본 분석 그룹의 거짓 「정정 전」 배너」 2). 정정 카드의 「정정 전 공고 기준」 배너 판정 재료로 화면이 anon 으로 부른다
--         (SECURITY DEFINER · 참/거짓 하나 — 마이그레이션 2026-10-01_05 · supabase/rpc/get_revision_analysis_done.sql). v3.1 과 같은 꼴이다.
--   v3.7: (2026-10-06 · 우편함 「코드 — Z-1 원문 키 사이클(DB) …」 PR-B ① 칸만) 두 가지.
--         ① allow_exec_funcs 에 get_announcement_sites 추가 — 카드 상세 단지 목록을 화면이 anon 으로 부른다(v3.1·v3.6 과 같은 꼴 ·
--            마이그레이션 2026-10-06_03 · supabase/rpc/get_announcement_sites.sql).
--         ② V13 「산물 있는 블록 ID」 — LH 원문(panId)이 있는 MYHOME 분할 행에 산물(세대·자격·정책·경로·이미지)이 있으면 위반.
--            제외: 이전 제외 목록 v13_keep(단지명을 정할 수 없는 블록 6 — 2026-10-06 실측) · LH 원문 없는 MYHOME(지방공사 — 원문 ID 가 없다).
--            🔴 **꺼 둔 채로 쓴다**(v13_on = false). ③ 이전 전까지는 블록 ID 산물이 정상이라 켜면 수백 행이 위반이 된다 —
--            ③ 병합과 함께 v3.8 에서 켜고, 그때 제외 목록을 ③ 실측으로 다시 쓴다(claude.ai 판정 2026-10-06).
--   v3.8: (2026-10-07 · 우편함 「코드 — Z-1 ③ 블록 ID 산물 → 원문 ID 이전(LH 102) …」 3) V13 을 켠다(v13_on = true) · 제외 목록을 다시 쓴다.
--         ③ 이전(관리 API 한 트랜잭션 · 기록 zipfit_ops.z1_site_move_log)으로 LH 원문이 있는 MYHOME 분할 행의 산물을 원문 ID 로 옮겼다.
--         제외 목록 v13_keep 은 이전 실측(claude.ai 판정 (가))으로 다시 썼다 — 54블록: 단지명을 정할 수 없는 블록 6(v3.7 그대로) ·
--         url panId 의 LH 행이 같은 카드 그룹 밖인 블록 8 · 옮기면 단지 모양 화면이 바뀌는 카드 그룹 40(Z-2 의 RPC 고침 뒤 옮긴다).
--         새 분석이 블록 ID 에 쓰면(스킬 v9.7 규약 29 위반) 이 줄이 잡는다.
--   v3.9: (2026-10-08 · 우편함 「코드 — Z-2 원문 ID 한 정의 · …」 ② 이전) 제외 목록 v13_keep 을 54 → 6 으로 줄인다 — 그 한 곳뿐이다.
--         Z-2 ① PR-A(원문 ID 한 정의 zipfit_ops.original_lh_id · 단지 모양 회차 거름·주소 정규화) · PR-B(같은 게시물 panId 링크) 뒤
--         ② 이전(관리 API · 카드 그룹마다 한 트랜잭션 · 기록 zipfit_ops.z1_site_move_log)으로 남은 48블록을 원문 ID 로 옮겼다 —
--         단지 모양 카드 그룹 40 + 앞 회차 panId 3(→ …20712) + 영암 2(→ …20393 · 링크 뒤) + 당진·예산 3(→ …20198 · 숨김 해제와 한 트랜잭션).
--         남는 6 = 단지명을 정할 수 없는 블록(v3.7 그대로 — 원문을 보고 단지를 정해야 한다 · 분석 회차 몫).
--   v3.10: (2026-10-12 · 우편함 「코드 — 일정 표 2단계 ①: DDL …」 2·4) 일정 표 announcement_schedule 신설과 함께 셋 · 경로 표 route 에 「우편」.
--         V14a = 일정 행의 stage_text·period_text·scope_text 가 근거 정책 행(policy_id) content_raw 의 부분 문자열인가 ·
--                근거 행 announcement_id 와 같은가. 비교는 V10a 와 같은 strpos(원문 그대로 — 정규화 없음).
--         V14b = period_text 첫 요일 「(월)」~「(일)」이 start_date 의 요일과 같은가(연도 보충 검산 — start_date 가 있을 때만).
--         V14c = 블록 ID 에 일정 행이 있으면 위반 — V13 과 같은 조건(v13_on · 제외 목록 v13_keep)으로 일정 표 하나를 더 본다.
--         V10a 의 route 허용값에 「우편」을 더한다(마이그레이션 2026-10-12_04 의 CHECK 와 같게 — 스킬 12-3 「현장·우편 전용」).
--   v3.11: (2026-10-13 · 우편함 「코드 — 국면 B′ ③ 지방공사」 3) allow_exec_funcs 에 get_last_collected_at 추가 — 그 한 줄뿐이다.
--         출처별 마지막 성공 수집 시각(시각 세 줄)을 화면이 anon 으로 부를 재료다 — 런 기록 표는 anon 이 못 읽어 SECURITY DEFINER
--         (마이그레이션 2026-10-13_01 · supabase/rpc/get_last_collected_at.sql). v3.1·v3.6·v3.7 ① 과 같은 꼴이다.
--   v3.12: (2026-10-14 · 우편함 「코드 — 백업 관문 축 · 불변식 「정책 행 우리 문장 0」 · …」 2) V15 하나를 더한다.
--         V15 = 정책 행 content_raw 에 우리 판단 문장의 표지(v15_words)가 있으면 위반 — 🔴·🔵 · 「확정:」 · 「애초에」 ·
--               「로 읽으시기 바랍니다」. 비교는 strpos(정규식 아님 — 낱말을 글자 그대로). 허용 목록 없음.
--               원문 = 공고문·공급기관 페이지·후속 공지(CLAUDE.md 원칙 30)라 우리 목소리가 정책 행에 들어가면 안 된다 —
--               run 198 뒤 네 줄을 손으로 걷었고(2026-10-14) 새 분석이 다시 넣는 것을 이 줄이 막는다. 2026-10-14 운영 DB 0행.
--               🔴 「⚠️」는 넣지 않았다 — 지금 9행에 있고(원문 표와의 차이를 적은 메모) 무엇을 남길지는 판정 몫이다.
--   v3.13: (2026-10-14 · 우편함 「코드 — 표지 일정 칸이 다른 회차 형제에서 …」 2) V15b 하나를 더한다 — V15 는 그대로다.
--         V15b = category 가 「⚠️」로 시작하지 않는 정책 행(일반 행 · category NULL 포함)의 content_raw 에 「⚠️」가 있으면 위반. 허용 목록 없음.
--               「⚠️」 category 행 자체는 보지 않는다 — 원문 갈림을 알리는 정식 장치다(검증 판정 · 코드 「백업 관문 축 …」 ②).
--               2026-10-14 일반 행 ⚠️ 9행을 걷어 ⚠️ category 행으로 옮겼고(운영 「⚠️ 메모 9행 정리」) 새 분석이 다시 넣는 것을 이 줄이 막는다.
--               2026-10-14 운영 DB 0행.
--   v3.14: (2026-10-15 · 우편함 「코드 — 불변식 「서로 다른 접수 창 ≥ 2 ∧ 경로 0」 · …」 1) V16 하나를 더한다 — 나머지는 그대로다.
--         V16 = 일정 표(announcement_schedule) 접수 행 중 scope_text 가 순위·차수 글자(「순위」·「차수」·「숫자+차」)인 행의
--               서로 다른 창 (start_date, end_date) 이 같은 회차 그룹(get_announcement_group_ids)에서 둘 이상인데,
--               그 그룹의 경로 표(announcement_apply_routes)가 0행이고 그룹에 접수 마감이 오늘 이후인 행이 있으면 위반(스킬 규칙 12-3 —
--               순위로 날짜가 갈리면 경로 표에도 넣는다 · 안 넣으면 카드 날짜 아래 순위별 줄이 뜨지 않는다).
--               🔴 세는 단위는 「서로 다른 창」이다 — 순위 행 수·정형 문장(「신청순위별로 신청접수일이 서로 다르며」)·「1차 … 심사」 낱말로
--               세지 않는다(조사 「스킬 v10.2 재료 실측」 표 2 경계 사례 · …20879 는 순위 행 둘이 같은 날 창 하나 — claude.ai 판정 2026-10-15).
--               V10c(단지 축 근사 · 정책 행 「단지명 :」)가 못 보던 순위 축을 일정 표로 본다. 2026-10-15 운영 DB 0행
--               (순위 창 둘 이상 6공고 — 모두 경로 표 있음).
--   v3.15: (2026-10-16 · 우편함 「코드 — 관리자 페이지 (가) 첫 판 …」) allow_exec_funcs 에 넷을 더한다 — 그 한 곳뿐이다(v3.1·v3.6·v3.7 과 같은 꼴).
--         listing_hidden_keys — 목록 RPC 가 anon 으로 부르는 숨김 키 목록(SECURITY DEFINER · 키만 · 사유·누가 없음).
--         ops_is_admin · ops_status_board · ops_listing_hide — authenticated 만 EXECUTE(anon·PUBLIC 닫음) · 관리자(zipfit_ops.admins)가 아니면
--         ops_is_admin 은 거짓 · 나머지 둘은 예외. 마이그레이션 2026-10-16_03 · supabase/rpc/ 같은 이름 사본.
--   v3.16: (2026-10-29 · 우편함 「코드·운영(브랜치만 · 병합 0) — 런칭 뒤 묶음」 4 · 백로그 「권한 불변식 SQL — 공개 역할에 열린 쓰기·실행 경로 …」) 넷.
--         ① allow_exec_funcs 에 get_announcement_round_ids 추가(같은 회차 ID — 화면이 anon 으로 부를 재료 · 마이그레이션 2026-10-29_01).
--         ② V1 이 보는 relkind 를 r·p 에서 r·p·v·m·f 로 넓힌다 — 뷰·구체화 뷰·외부 표도 쓰기 권한을 본다(2026-10-29 운영 DB 0개 · 생기면 잡는다).
--         ③ V17 기본 권한 — postgres 가 public·zipfit_ops(또는 전역)에 둔 기본 권한(pg_default_acl)이 anon·authenticated 에 표 SELECT 밖
--            (INSERT·UPDATE·DELETE·TRUNCATE·REFERENCES·TRIGGER)·함수 EXECUTE·시퀀스 권한을 주면 위반. 새 표·함수가 열린 채 태어나는 길을 본다
--            (CLAUDE.md 원칙 15 「새 테이블은 쓰기 권한 없이 태어난다」의 장치). 🔴 supabase_admin 기본 권한은 보지 않는다 — postgres 가 그 역할의
--            멤버가 아니라 고칠 수 없고 지금 public 에 열려 있다(원칙 15 ⚠️ · 만든 객체는 V1·V2 가 잡는다). storage 스키마도 보지 않는다(버킷 0 — V4).
--         ④ V18 스키마 권한 — anon·authenticated 가 public·zipfit_ops 에 CREATE 를 갖거나 zipfit_ops 에 USAGE 를 가지면 위반.
--         허용 목록(V1)은 그대로 — saved_announcements(authenticated INSERT·DELETE) + usage_events(anon·authenticated INSERT · 컬럼 단위).
--         2026-10-29 11:20·11:26 KST 운영 DB 실측: 넷 모두 0행(V1 쓰기 경로 = 허용 목록 그대로 · 시퀀스 0 · postgres 기본 권한 public = 표 anon·authenticated r 만 · 함수·시퀀스 닫힘 · 스키마 CREATE 0 · zipfit_ops USAGE 0).
--   v3.17: (2026-10-29 · 우편함 「코드·운영(브랜치만 · 병합 0) — 회차 링크 표 B′」 4) allow_exec_funcs 에 get_announcement_round_chain_ids 추가 — 그 한 줄뿐이다.
--         회차 링크 표 announcement_round_links(마이그레이션 2026-10-29_03)의 권한·RLS 는 V1(쓰기 0)·V5(RLS)·V6(정책)이 본다.
--         표 데이터 줄(양끝 공고 있음)은 표가 생긴 뒤 별도 판에 — 적용 전 기준값 측정이 새 표를 못 읽는다(v3.10 선례).
--   v3.18: (2026-11-05 · 우편함 「표시층 — 커트라인 시안 A」) allow_exec_funcs 에 get_announcement_cutoff_rounds 추가 — 그 한 줄뿐이다.
--          카드 「지난 회차」(LH 합격점수)를 화면이 anon 으로 부른다(SECURITY DEFINER · 필요 칸만 · 마이그레이션 2026-11-05_01 ·
--          supabase/rpc/get_announcement_cutoff_rounds.sql). v3.1·v3.6·v3.11·v3.17 과 같은 꼴이다.
--   v3.19: (2026-11-05 · 우편함 「코드·운영 — 대상주택 공지 감지 설계 · 접수 경로 이메일 …」 2장) 경로 표 route 값 목록에 '이메일' — 그 한 줄(두 자리)뿐이다.
--          마이그레이션 2026-11-05_03 의 route CHECK 와 같은 다섯 값.
--   v3.20: (2026-11-09 · 우편함 「코드·운영 — 쉽게 쓴 말 저장 칸」 1장) V19 — 정책 행 content_plain(마이그레이션 2026-11-09_06)이
--          ⚠️ 행(category 첫 글자 U+26A0)에 있거나 · content_raw 가 빈 행에 있으면 위반. 그 한 CTE 뿐이다.
--          🔴 칸을 to_jsonb(p) ->> 'content_plain' 으로 읽는다 — check 의 적용 전 기준값 측정 때는 칸이 없어 직접 이름으로 읽으면
--             42703 으로 죽는다(v3.10 선례 「적용 전 기준값 측정이 새 표를 못 읽는다」). jsonb 로 읽으면 칸이 없을 때 NULL(위반 0)이다.
--   v3.21: (2026-11-09 · 우편함 「코드·운영(데이터 쓰기) — 출산 가산 숫자 칸 채우기 …」 2 · 기준 위반 ① 재발 막기) V20 — 열린 공고(접수 끝 ≥ 오늘)의 자격 행 중
--          asset_limit = 3.45억 ∧ asset_limit_birth1 빈 칸인데, 그 행 verification_requirements 나 같은 공고 정책 행에 출산(출생) 낱말과 함께
--          출산 자산 가산 금액(「37,900」·「379,000,000」 꼴 — 3.45억 + 10%p)이 있으면 위반. 화면(zfLimitsFor)은 숫자 칸만 읽어 출산자녀 가구 한도가 기준값으로 떨어진다.
--          🔴 열린 공고·3.45억으로 좁혔다 — 닫힌 공고까지 세면 2026-11-09 90행(59공고)이 이미 걸려 「위반 0」 관문을 못 넘는다(그 목록은 우편함 회신 · 다른 회차).
--          비율만 있고 금액이 없는 꼴(오산세교2 …20896)은 이 줄 밖(판정 대기). 2026-11-09 …20730 숫자 칸을 채운 뒤 0 · 되돌리기 전용으로 비우면 그 행 1.
--   v3.22: (2026-11-09 · 우편함 「코드·운영(데이터 쓰기) — 출산 가산 숫자 칸 2차 …」 4) V20 넓힘 — 열린 공고·3.45억 한정을 걷는다.
--          자격 행 asset_limit = A(> 0) ∧ asset_limit_birth1 빈 칸인데, 그 행 vr 나 같은 공고 정책 행(출산·출생 낱말)에 「1명」 금액
--          round(A × 1.1, 백만원)(원 꼴 「270,000,000」 또는 만원 꼴 「27,000」)이 있으면 위반 — 2.37억 → 2.61억 · 2.45억 → 2.70억 · 2.51억 → 2.76억 · 1.08억 → 1.19억 · 3.45억 → 3.79억.
--          🔵 분리 행 꼴은 밖 — 같은 공고에 asset_limit 이 그 1명 금액인 다른 자격 행이 있으면(거창 …20933 · 남원노암 …20988 꼴) 세지 않는다.
--          2026-11-09 열린 6행(전주평화 …19241 · 김제검산1 …19412) · 닫힌 128행(…20730 판의 90 + 넓혀 드러난 38)을 원문 금액으로 채운 뒤 0(태백장성 …20730 1행은 #932)(되돌림 docs/rollback/2026-11-09_birth_bonus_closed_90.sql).
--   v3.23: (2026-11-09 · 우편함 「코드·운영(데이터 쓰기) — 세대 행 extracted_facts 「모집예비자수」 채우기 · 출산 가산 근거 불변식 V21 …」 2장) V21 — 출산 숫자 칸
--          (asset_limit_birth1·_birth2·car_limit_birth1·_birth2)의 값(> 0)이 근거 없이 서 있으면 위반. 근거 = ① 그 행 vr 또는 같은 공고 정책 행 원문에
--          그 금액(원 꼴 「379,000,000」 또는 만원으로 나누어떨어지면 만원 꼴 「37,900」 · 쉼표 있어도 없어도)이 있다 ② 같은 공고 다른 자격 행의 같은 칸이 같은 값.
--          🔴 표준 쌍 허용목록을 두지 않는다 — 근거 축만 넓혔다. 2026-11-09 1,818칸 중 14칸이 근거 없음 → 형제 행 8칸 · 원문 표 문장을 vr 에 옮긴 6칸(…20679 · …20723 · …20794 p4) 뒤 0.
--   v3.24: (2026-11-10 · 우편함 「코드·운영 — 11-09 정돈 셋 …」 ②) 칸 꼴 둘. V22 — 가구원수 소득 가산 칸(income_pct_household1_bonus·_2_bonus)은
--          가산 %p 꼴이라 30 넘으면 위반(최종 % 를 잘못 넣은 꼴을 잡는다 · 2026-11-10 314행 최대 20). V23 — 출산 소득 칸(income_pct_birth1·_birth2)은
--          최종 % 꼴이라 같은 행 기준 소득 %(income_pct)보다 커야 한다 — 둘 다 NULL 아니고 출산 칸 ≤ 기준이면 위반(가산 %p 를 넣은 꼴 · 2026-11-10 221행 중 0).
-- 읽기 전용. 위반이 있으면 그 행만 나온다. 아무 행도 안 나오면 통과.
with
allow_write_tables(relname, privs) as (
  values ('saved_announcements', 'DELETE,INSERT'),
         ('usage_events',        'INSERT')          -- 화면이 직접 쓰는 로그 (컬럼 단위 GRANT)
),
-- 정책 0이어도 괜찮은 테이블 (내부 로그 — 화면이 읽지 않는다)
--   ⚠️ 비워 두면 V6가 collection_run_log를 잡는다. 넣을지는 아래 주석 참조
allow_empty_policy(relname) as (
  select null::text where false   -- 지금은 비어 있다(=예외 없음)
),
allow_exec_funcs(proname) as (
  values
    ('announcement_dedup_key'), ('get_announcements_deduped'),
    ('get_announcement_group_ids'), ('get_announcement_blocks'),
    ('get_document_templates_for'), ('get_rental_stats_summary'),
    ('compute_announcement_flags'), ('protect_created_at'),
    ('protect_detail_columns'), ('set_revised_at'), ('update_updated_at'),
    ('get_announcement_price_summary'), ('get_revision_analysis_done'),
    ('get_announcement_sites'), ('get_last_collected_at'),
    ('listing_hidden_keys'), ('ops_is_admin'), ('ops_status_board'), ('ops_listing_hide'),
    ('get_announcement_round_ids'), ('get_announcement_round_chain_ids'),
    ('get_announcement_cutoff_rounds')
),

-- ① public 테이블 쓰기 권한이 허용목록 밖
v1 as (
  select 'V1 테이블 쓰기' as check_name,
         c.relname as subject,
         string_agg(distinct g.priv, ',' order by g.priv) as detail
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral (select unnest(array['INSERT','UPDATE','DELETE','TRUNCATE']) as priv) p
  cross join lateral (
    -- 🔴 INSERT·UPDATE는 컬럼 단위 GRANT가 있을 수 있어 has_any_column_privilege로 본다.
    --    has_table_privilege는 컬럼 단위를 못 보고 false를 돌려준다(2026-09-14 실측).
    --    DELETE·TRUNCATE는 컬럼 권한이 없어 has_any_column_privilege가 22023으로 죽는다.
    select p.priv
    where case when p.priv in ('INSERT','UPDATE')
               then has_any_column_privilege('anon', c.oid, p.priv)
                 or has_any_column_privilege('authenticated', c.oid, p.priv)
               else has_table_privilege('anon', c.oid, p.priv)
                 or has_table_privilege('authenticated', c.oid, p.priv) end
  ) g(priv)
  where n.nspname = 'public' and c.relkind in ('r','p','v','m','f')
  group by c.relname
  having c.relname not in (select relname from allow_write_tables)
      or string_agg(distinct g.priv, ',' order by g.priv)
         is distinct from (select privs from allow_write_tables a where a.relname = c.relname)
),

-- ② public 함수 EXECUTE가 허용목록 밖
v2 as (
  select 'V2 함수 EXECUTE' as check_name,
         p.proname as subject,
         case when p.prosecdef then 'SECURITY DEFINER' else 'INVOKER' end as detail
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and (has_function_privilege('anon', p.oid, 'EXECUTE')
      or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
    and p.proname not in (select proname from allow_exec_funcs)
),

-- ③ 시퀀스 권한
v3 as (
  select 'V3 시퀀스 권한' as check_name,
         c.relname as subject,
         string_agg(distinct g.priv, ',' order by g.priv) as detail
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral (select unnest(array['SELECT','UPDATE','USAGE']) as priv) p
  cross join lateral (
    select p.priv
    where has_sequence_privilege('anon', c.oid, p.priv)
       or has_sequence_privilege('authenticated', c.oid, p.priv)
  ) g(priv)
  where n.nspname = 'public' and c.relkind = 'S'
  group by c.relname
),

-- ④ storage 버킷 (생기면 storage 기본 권한을 먼저 닫는다)
v4 as (
  select 'V4 storage 버킷' as check_name, b.name as subject,
         case when b.public then 'public' else 'private' end as detail
  from storage.buckets b
),

-- ⑤ RLS 없는 public 테이블
v5 as (
  select 'V5 RLS 미적용' as check_name, c.relname as subject, 'relrowsecurity=false' as detail
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
),

-- ⑥ RLS는 켰는데 정책이 0개 + anon에 SELECT가 열려 있다 (읽기가 조용히 빈다)
--    🔴 anon SELECT가 없으면 정책 0은 정상이다 — 두 조건이 함께여야 증상이다
v6 as (
  select 'V6 RLS 정책 0' as check_name, c.relname as subject,
         'policies=0 + anon SELECT' as detail
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
    and has_table_privilege('anon', c.oid, 'SELECT')
    and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
    and c.relname not in (select relname from allow_empty_policy)
),

-- ⑦ 기본기준 행에 한도가 비었는데 수기확인 메모도 없다
v7 as (
  select 'V7 기본기준 한도' as check_name,
         coalesce(housing_type,'(null)') || '/' || coalesce(supply_form,'(null)') || '/' || coalesce(rank::text,'-') as subject,
         concat_ws(' ',
           case when asset_limit is null then 'asset_limit=NULL' end,
           case when car_limit   is null
                     and not (id = '39d44cc1-1ba2-4282-9cfd-15a5b53a99c4'
                              and housing_type = '매입임대' and supply_form = '전세형')
                then 'car_limit=NULL' end) as detail
  from eligibility_criteria
  where announcement_id is null
    and manual_check_note is null
    and (asset_limit is null
         -- 🔴 v3.2 예외 — 기본기준 매입임대/전세형 한 행만. 원문에 자동차 개별 기준이 없다:
         --    basis 「2.신혼·신생아Ⅱ입주자모집공고문(2026.06.30).pdf」 p.4 「총자산 36,200만원 이하,」 ·
         --    p.5 「• 총자산가액 = 부동산가액+자동차가액+ 금융자산가액+기타자산가액-부채 / • 자동차가액은 총자산에 합산」.
         --    그 basis 공고(2015122300020255)의 기준 행도 car_limit NULL이다(2026-09-23 B22, 다운님 판정).
         --    id 로 특정한다 — housing_type·supply_form 만으로 걸면 같은 이름의 행이 새로 생겼을 때 예외가 번진다.
         or (car_limit is null
             and not (id = '39d44cc1-1ba2-4282-9cfd-15a5b53a99c4'
                      and housing_type = '매입임대' and supply_form = '전세형')))
),
-- ⑧ 보관 기간 — usage_events 최고령 행이 1년 + 유예(7일)보다 오래됐으면 위반
--   🔵 having이 0행 문제를 저절로 푼다: 표가 비면 min()이 NULL이고 NULL < x 는 NULL이라 행이 안 나온다.
--   ⚠️ 유예는 삭제(정확히 1년)가 아니라 감시에 둔다 — 삭제에 유예를 두면 처리방침이 약속한 1년을 넘겨 보관하게 된다.
v8 as (
  select 'V8 보관기간' as check_name,
         min(occurred_at)::text as subject,
         (now() - min(occurred_at))::text as detail
  from public.usage_events
  having min(occurred_at) < now() - interval '1 year 7 days'
),
-- ⑨ unit_key 가 같은 공고 세대 행 묶음에 닿지 않는다 (스킬 불변식 10)
v9 as (
  select 'V9 unit_key 닿지 않음' as check_name,
         x.announcement_id || ' · ' || x.id::text as subject,
         'unit_key=' || x.unit_key || ' · source=' || coalesce(x.unit_key_source,'(null)') as detail
  from announcement_extras x
  where x.unit_key is not null
    and not exists (
      select 1 from housing_units h
      where h.announcement_id = x.announcement_id
        and x.unit_key in (
          coalesce(nullif(btrim(h.building_name),''), h.address, '주소 정보 없음'),
          coalesce(nullif(btrim(h.building_name),''), h.address, '주소 정보 없음') || '::' || coalesce(h.unit_group, h.unit_type),
          coalesce(nullif(btrim(h.building_name),''), h.address, '주소 정보 없음') || '::' || h.unit_type))   -- v3.25: 묶음 안 특정 형 평면도(스킬 v11.4 「건물::unit_type」)
),
-- ⑩-a 경로 표 행이 근거 모집일정 행의 부분 문자열이 아니다 (스킬 불변식 11)
v10a as (
  select 'V10a 경로 부분문자열' as check_name,
         r.announcement_id || ' · ' || r.id::text as subject,
         concat_ws(' ',
           case when p.id is null then 'policy_id 없음' end,
           case when p.id is not null and p.category <> '모집일정' then 'category=' || p.category end,
           case when p.id is not null and strpos(p.content_raw, r.period_text) = 0 then 'period_text' end,
           case when p.id is not null and r.site_text  is not null and strpos(p.content_raw, r.site_text)  = 0 then 'site_text' end,
           case when p.id is not null and r.phase_text is not null and strpos(p.content_raw, r.phase_text) = 0 then 'phase_text' end,
           case when p.id is not null and r.note_text  is not null and strpos(p.content_raw, r.note_text)  = 0 then 'note_text' end,
           case when r.route not in ('인터넷·모바일','현장','전체','우편','이메일') then 'route=' || r.route end) as detail
  from announcement_apply_routes r
  left join announcement_policies p on p.id = r.policy_id
  where p.id is null or p.category <> '모집일정'
     or strpos(p.content_raw, r.period_text) = 0
     or (r.site_text  is not null and strpos(p.content_raw, r.site_text)  = 0)
     or (r.phase_text is not null and strpos(p.content_raw, r.phase_text) = 0)
     or (r.note_text  is not null and strpos(p.content_raw, r.note_text)  = 0)
     or r.route not in ('인터넷·모바일','현장','전체','우편','이메일')
),
-- ⑩-c 단지별 일정인데 경로 0행 — 단지 축 근사(위 머리 주석)
sites as (
  select p.announcement_id, (regexp_match(p.content_raw, '^단지명\s*:\s*(.+)$', 'n'))[1] as site
  from announcement_policies p
  where p.category = '모집일정'
),
cand as (
  select distinct s.announcement_id from sites s where s.site is not null
),
grp as (
  select c.announcement_id rep, g gid from cand c cross join lateral get_announcement_group_ids(c.announcement_id) g
),
v10c as (
  select 'V10c 단지별 일정인데 경로 0행' as check_name,
         min(grp.rep) as subject,
         string_agg(distinct s.site, ' | ') as detail
  from grp join sites s on s.announcement_id = grp.gid and s.site is not null
  join announcements a on a.announcement_id = grp.rep
  where coalesce(a.apply_end_confirmed, a.apply_end) >= current_date
  group by grp.rep
  having count(distinct s.site) >= 2
     and not exists (select 1 from announcement_apply_routes r join get_announcement_group_ids(grp.rep) gg on gg = r.announcement_id)
),
-- ⑫ 완료 계열 매입 공고에 목록 세대 행 주소와 맞는 홍보물이 있는데 이미지 0 (스킬 불변식 12 · v3.5)
-- 그룹 ID 는 공고마다 한 번만 펼친다(홍보물 행마다 부르면 수백 번이다 — v3.4 V12 주석의 관리 API 한도).
promo_addr as (
  select distinct pa.announcement_id, regexp_replace(split_part(hu.address, '(', 1), '\s', '', 'g') as k
  from (select distinct announcement_id from announcement_promo_files) pa
  cross join lateral get_announcement_group_ids(pa.announcement_id) g(gid)
  join housing_units hu on hu.announcement_id = g.gid
  where hu.address is not null
),
promo as (
  select pf.announcement_id, count(*) as files from announcement_promo_files pf
  join promo_addr ad on ad.announcement_id = pf.announcement_id
   and ad.k = regexp_replace(split_part(coalesce(nullif(btrim(pf.dng_hs_adr), ''), pf.row_address, ''), '(', 1), '\s', '', 'g')
  group by pf.announcement_id
),
v12 as (
  select 'V12 목록 주소 홍보물 있는데 이미지 0' as check_name,
         pr.announcement_id as subject,
         'status=' || aa.status || ' · 목록 주소 홍보물 ' || pr.files || '파일 · 접수마감 ' || coalesce(a.apply_end_confirmed, a.apply_end)::text as detail
  from promo pr
  join announcement_analysis aa on aa.announcement_id = pr.announcement_id and aa.status like '완료%'
  join announcements a on a.announcement_id = pr.announcement_id
  where not exists (
    -- 그룹 ID 를 먼저 펼친 뒤 id 같음으로 찾는다 — `x.announcement_id in (select get_…(…))` 꼴은
    -- 표 전체를 돌며 함수를 부르게 돼 관리 API 한도를 넘겼다(2026-09-29 실측).
    select 1 from get_announcement_group_ids(pr.announcement_id) g(gid)
    join announcement_extras x on x.announcement_id = g.gid)
),
-- ⑬ 산물 있는 블록 ID (v3.7 신설 · v3.8 켬 · 위 머리 주석)
--    블록 ID = LH 원문 행(announcement_id = MYHOME url 의 panId)이 있는 MYHOME 행. 그 ID 에 산물이 있으면 「원문 ID 하나에 둔다」(Z) 위반.
v13_on(on_) as (
  values (true)
),
v13_keep(aid) as (   -- Z-2 ② 이전 뒤 실측(2026-10-08) — 6블록. 단지명을 정할 수 없는 블록(비세대 산물 ∧ 블록 세대 단지명 ≠ 1)
  values
  ('20652_1_서울특별시_영등포구'),
  ('20686_2_경기도_김포시'),
  ('20686_3_경기도_김포시'),
  ('20690_2_경기도_김포시'),
  ('20690_3_경기도_김포시'),
  ('21187_경상남도')
),
v13 as (
  select 'V13 산물 있는 블록 ID' as check_name,
         x.aid as subject,
         string_agg(x.tbl || ' ' || x.n, ' · ' order by x.tbl) as detail
  from (
    select announcement_id as aid, 'housing_units' as tbl, count(*) as n from housing_units group by 1
    union all select announcement_id, 'eligibility_criteria', count(*) from eligibility_criteria group by 1
    union all select announcement_id, 'announcement_policies', count(*) from announcement_policies group by 1
    union all select announcement_id, 'announcement_apply_routes', count(*) from announcement_apply_routes group by 1
    union all select announcement_id, 'announcement_extras', count(*) from announcement_extras group by 1
  ) x
  join announcements m on m.announcement_id = x.aid and m.source = 'MYHOME'
  where (select on_ from v13_on)
    and x.aid not in (select aid from v13_keep)
    and exists (select 1 from announcements l
                where l.source = 'LH' and l.announcement_id = substring(m.url from 'panId=([0-9]+)'))
  group by x.aid
),
-- ⑭ 일정 표(v3.10 신설 · 위 머리 주석)
v14a as (
  select 'V14a 일정 부분문자열' as check_name,
         s.announcement_id || ' · ' || s.id::text as subject,
         concat_ws(' ',
           case when p.announcement_id <> s.announcement_id then 'announcement_id≠근거(' || p.announcement_id || ')' end,
           case when strpos(p.content_raw, s.stage_text)  = 0 then 'stage_text' end,
           case when strpos(p.content_raw, s.period_text) = 0 then 'period_text' end,
           case when s.scope_text is not null and strpos(p.content_raw, s.scope_text) = 0 then 'scope_text' end) as detail
  from announcement_schedule s
  join announcement_policies p on p.id = s.policy_id
  where p.announcement_id <> s.announcement_id
     or strpos(p.content_raw, s.stage_text)  = 0
     or strpos(p.content_raw, s.period_text) = 0
     or (s.scope_text is not null and strpos(p.content_raw, s.scope_text) = 0)
),
v14b as (
  select 'V14b 일정 요일' as check_name,
         s.announcement_id || ' · ' || s.id::text as subject,
         'period_text 요일=' || w.d || ' · start_date=' || s.start_date::text || '(' ||
           substr('월화수목금토일', extract(isodow from s.start_date)::int, 1) || ')' as detail
  from announcement_schedule s
  cross join lateral (select (regexp_match(s.period_text, '\(\s*([월화수목금토일])\s*\)'))[1] as d) w
  where s.start_date is not null and w.d is not null
    and strpos('월화수목금토일', w.d) <> extract(isodow from s.start_date)::int
),
v14c as (
  select 'V14c 일정 행 있는 블록 ID' as check_name,
         s.announcement_id as subject,
         'announcement_schedule ' || count(*) as detail
  from announcement_schedule s
  join announcements m on m.announcement_id = s.announcement_id and m.source = 'MYHOME'
  where (select on_ from v13_on)
    and s.announcement_id not in (select aid from v13_keep)
    and exists (select 1 from announcements l
                where l.source = 'LH' and l.announcement_id = substring(m.url from 'panId=([0-9]+)'))
  group by s.announcement_id
),

-- ⑮ 정책 행 content_raw 에 우리 판단 문장(v3.12) — 낱말을 글자 그대로(strpos) 찾는다. 허용 목록 없음.
v15_words(w) as (
  values ('🔴'), ('🔵'), ('확정:'), ('애초에'), ('로 읽으시기 바랍니다')
),
v15 as (
  select 'V15 정책 행 우리 판단 문장' as check_name,
         p.announcement_id || ' · ' || p.id::text as subject,
         'category=' || coalesce(p.category, '') || ' · 낱말 ' || string_agg(w.w, ',' order by w.w) as detail
  from announcement_policies p
  join v15_words w on strpos(p.content_raw, w.w) > 0
  group by p.announcement_id, p.id, p.category
),

-- ⑮b 일반 정책 행 content_raw 에 「⚠️」(v3.13) — category 가 「⚠️」로 시작하는 행만 「⚠️」를 쓸 수 있다. 허용 목록 없음.
--   비교 글자는 U+26A0 한 글자(U&'\26A0') — 「⚠️」(U+26A0 U+FE0F)와 FE0F 없는 「⚠」를 함께 잡는다(2026-10-14 ⚠️ category 138행은 전부 FE0F 꼴).
v15b as (
  select 'V15b 일반 정책 행 ⚠️' as check_name,
         p.announcement_id || ' · ' || p.id::text as subject,
         'category=' || coalesce(p.category, '') as detail
  from announcement_policies p
  where strpos(p.content_raw, U&'\26A0') > 0
    and coalesce(left(p.category, 1), '') <> U&'\26A0'
),

-- ⑯ 순위·차수 접수 창이 둘 이상인데 경로 0행(v3.14) — 일정 표 기준 · 세는 단위 = 서로 다른 창(start_date, end_date).
--   그룹 ID 는 후보 공고마다 한 번만 펼친다(V12 와 같은 까닭 — 관리 API 한도).
v16_cand as (
  select distinct s.announcement_id from announcement_schedule s
  where s.stage = '접수' and s.start_date is not null and s.scope_text ~ '순위|차수|[0-9]\s*차'
),
v16_grp as (
  select c.announcement_id as rep, g as gid from v16_cand c cross join lateral get_announcement_group_ids(c.announcement_id) g
),
v16 as (
  select 'V16 순위·차수 접수 창 둘 이상인데 경로 0행' as check_name,
         gr.rep as subject,
         count(distinct (s.start_date, s.end_date)) || '창 · ' ||
           string_agg(distinct s.scope_text || ' ' || s.start_date || '~' || coalesce(s.end_date::text, ''), ' | ') as detail
  from v16_grp gr
  join announcement_schedule s on s.announcement_id = gr.gid
   and s.stage = '접수' and s.start_date is not null and s.scope_text ~ '순위|차수|[0-9]\s*차'
  where exists (select 1 from v16_grp g2 join announcements a on a.announcement_id = g2.gid
                where g2.rep = gr.rep and coalesce(a.apply_end_confirmed, a.apply_end) >= current_date)
    and not exists (select 1 from v16_grp g3 join announcement_apply_routes r on r.announcement_id = g3.gid
                    where g3.rep = gr.rep)
  group by gr.rep
  having count(distinct (s.start_date, s.end_date)) >= 2
),

-- ⑰ 기본 권한(v3.16) — postgres 가 둔 기본 권한이 공개 역할에 표 SELECT 밖·함수·시퀀스를 열어 둔다
v17 as (
  select 'V17 기본 권한' as check_name,
         coalesce(n.nspname, '(전역)') || '/' || d.defaclobjtype::text as subject,
         string_agg(pg_get_userbyid(x.grantee) || '=' || x.privilege_type, ',' order by pg_get_userbyid(x.grantee), x.privilege_type) as detail
  from pg_default_acl d
  left join pg_namespace n on n.oid = d.defaclnamespace
  cross join lateral aclexplode(d.defaclacl) x
  where pg_get_userbyid(d.defaclrole) = 'postgres'
    and (n.nspname is null or n.nspname in ('public', 'zipfit_ops'))
    and pg_get_userbyid(x.grantee) in ('anon', 'authenticated')
    and not (d.defaclobjtype = 'r' and x.privilege_type = 'SELECT')
  group by 2
),

-- ⑱ 스키마 권한(v3.16) — 공개 역할이 public·zipfit_ops 에 만들 수 있거나 zipfit_ops 를 쓸 수 있다
v18 as (
  select 'V18 스키마 권한' as check_name, n.nspname || ':' || r.rn as subject,
         concat_ws(',', case when has_schema_privilege(r.rn, n.oid, 'CREATE') then 'CREATE' end,
                        case when n.nspname = 'zipfit_ops' and has_schema_privilege(r.rn, n.oid, 'USAGE') then 'USAGE' end) as detail
  from pg_namespace n cross join (values ('anon'), ('authenticated')) r(rn)
  where n.nspname in ('public', 'zipfit_ops')
    and (has_schema_privilege(r.rn, n.oid, 'CREATE')
      or (n.nspname = 'zipfit_ops' and has_schema_privilege(r.rn, n.oid, 'USAGE')))
),

-- ⑲ 쉽게 쓴 말(v3.20) — ⚠️ 행에 content_plain · content_raw 빈 행에 content_plain
v19 as (
  select 'V19 쉽게 쓴 말 자리' as check_name,
         p.announcement_id || ' · ' || p.id::text as subject,
         case when coalesce(left(p.category, 1), '') = U&'\26A0' then '⚠️ 행에 content_plain' else 'content_raw 빈 행에 content_plain' end as detail
  from announcement_policies p
  where to_jsonb(p) ->> 'content_plain' is not null
    and (coalesce(left(p.category, 1), '') = U&'\26A0' or coalesce(btrim(p.content_raw), '') = '')
),

-- ⑳ 출산 자산 가산 금액이 있는데 숫자 칸 빈 칸(v3.21 · v3.22 넓힘) — 기준 A 의 1명 금액 round(A × 1.1, 백만원)이 vr·정책 행에 · 분리 행 꼴 밖
v20c as (
  select ec.*, (round(ec.asset_limit * 1.1 / 1000000) * 1000000)::bigint as tgt
  from eligibility_criteria ec
  where ec.asset_limit > 0 and ec.asset_limit_birth1 is null and ec.announcement_id is not null
),
v20p as (
  select c.*, '(^|[^0-9,])(' || regexp_replace(to_char(c.tgt, 'FM999,999,999,999'), ',', ',?', 'g') || '|'
                            || regexp_replace(to_char(c.tgt / 10000, 'FM999,999'), ',', ',?', 'g') || ')([^0-9]|$)' as pat
  from v20c c
),
v20 as (
  select 'V20 출산 자산 가산 금액 있는데 숫자 칸 빈 칸' as check_name,
         p.announcement_id || ' · ' || p.id::text as subject,
         concat_ws(' · ', '기준 ' || p.asset_limit || ' → 1명 ' || p.tgt,
                   case when coalesce(p.verification_requirements::text, '') ~ '출산|출생' and coalesce(p.verification_requirements::text, '') ~ p.pat then 'vr' end,
                   case when exists (select 1 from announcement_policies q where q.announcement_id = p.announcement_id
                                      and q.content_raw ~ '출산|출생' and q.content_raw ~ p.pat) then '정책 행' end) as detail
  from v20p p
  where ((coalesce(p.verification_requirements::text, '') ~ '출산|출생' and coalesce(p.verification_requirements::text, '') ~ p.pat)
      or exists (select 1 from announcement_policies q where q.announcement_id = p.announcement_id
                  and q.content_raw ~ '출산|출생' and q.content_raw ~ p.pat))
    and not exists (select 1 from eligibility_criteria s where s.announcement_id = p.announcement_id and s.id <> p.id and s.asset_limit = p.tgt)
),
v21v as (
  select ec.id, ec.announcement_id, x.col, x.val,
         coalesce(ec.verification_requirements::text, '') || ' ' || coalesce((select string_agg(p.content_raw, ' ') from announcement_policies p where p.announcement_id = ec.announcement_id), '') as ev
  from eligibility_criteria ec
  cross join lateral (values ('asset_limit_birth1', ec.asset_limit_birth1), ('asset_limit_birth2', ec.asset_limit_birth2),
                             ('car_limit_birth1', ec.car_limit_birth1), ('car_limit_birth2', ec.car_limit_birth2)) x(col, val)
  where ec.announcement_id is not null and x.val is not null and x.val > 0
),
v21 as (
  select 'V21 출산 숫자 칸 값이 근거 금액과 다름' as check_name, v.announcement_id || ' · ' || v.id::text || ' · ' || v.col as subject, v.val::text as detail
  from v21v v
  where not exists (select 1 from eligibility_criteria s where s.announcement_id = v.announcement_id and s.id <> v.id
                      and (to_jsonb(s) ->> v.col) is not null and (to_jsonb(s) ->> v.col)::bigint = v.val)
    and v.ev !~ ('(^|[^0-9,])(' || regexp_replace(to_char(v.val, 'FM999,999,999,999'), ',', ',?', 'g')
                 || case when v.val % 10000 = 0 then '|' || regexp_replace(to_char(v.val / 10000, 'FM999,999'), ',', ',?', 'g') else '' end || ')([^0-9]|$)')
),
v22 as (
  select 'V22 가구원수 소득 가산 칸이 가산 %p 꼴 아님(> 30)' as check_name, ec.announcement_id || ' · ' || ec.id::text || ' · ' || x.col as subject, x.val::text as detail
  from eligibility_criteria ec
  cross join lateral (values ('income_pct_household1_bonus', ec.income_pct_household1_bonus), ('income_pct_household2_bonus', ec.income_pct_household2_bonus)) x(col, val)
  where x.val is not null and x.val > 30
),
v23 as (
  select 'V23 출산 소득 칸이 최종 % 꼴 아님(≤ 기준 소득 %)' as check_name, ec.announcement_id || ' · ' || ec.id::text || ' · ' || x.col as subject, x.val::text || ' ≤ ' || ec.income_pct::text as detail
  from eligibility_criteria ec
  cross join lateral (values ('income_pct_birth1', ec.income_pct_birth1), ('income_pct_birth2', ec.income_pct_birth2)) x(col, val)
  where ec.income_pct is not null and x.val is not null and x.val <= ec.income_pct
),
v24 as (
  select 'V24 꼭 볼 것 순위(key_rank) 겹침·범위 밖' as check_name, k.announcement_id || ' · 순위 ' || k.r as subject,
         case when k.r !~ '^[123]$' then '1~3 밖' else '같은 공고 같은 순위 ' || k.n || '행' end as detail
  from (select p.announcement_id, to_jsonb(p) ->> 'key_rank' as r, count(*) as n
          from announcement_policies p where to_jsonb(p) ->> 'key_rank' is not null group by 1, 2) k
  where k.n > 1 or k.r !~ '^[123]$'
),
v24b as (
  select 'V24b 꼭 볼 것 순위(key_rank) 카드 묶음 안 겹침' as check_name, h.ids[1] || ' 묶음 · 순위 ' || h.r as subject,
         '묶음 ' || cardinality(h.ids) || '공고 중 ' || h.aids || ' 에 같은 순위 ' || h.n || '행' as detail
  from (select g.ids, kr.r, count(*) as n, string_agg(distinct kr.announcement_id, ', ') as aids
          from (select distinct (select array_agg(x order by x) from get_announcement_group_ids(a.announcement_id) x) as ids
                  from (select distinct p.announcement_id from announcement_policies p where to_jsonb(p) ->> 'key_rank' is not null) a) g
          join (select p.announcement_id, to_jsonb(p) ->> 'key_rank' as r from announcement_policies p where to_jsonb(p) ->> 'key_rank' is not null) kr
            on kr.announcement_id = any(g.ids)
         group by 1, 2) h
  where h.n > 1
)
select * from v1
union all select * from v2
union all select * from v3
union all select * from v4
union all select * from v5
union all select * from v6
union all select * from v7
union all select * from v8
union all select * from v9
union all select * from v10a
union all select * from v10c
union all select * from v12
union all select * from v13
union all select * from v14a
union all select * from v14b
union all select * from v14c
union all select * from v15
union all select * from v15b
union all select * from v16
union all select * from v17
union all select * from v18
union all select * from v19
union all select * from v20
union all select * from v21
union all select * from v22
union all select * from v23
union all select * from v24
union all select * from v24b
order by 1, 2;
