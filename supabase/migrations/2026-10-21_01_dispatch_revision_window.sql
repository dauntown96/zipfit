-- zipfit:function analysis_dispatch_tick(boolean) acl={postgres=X/postgres,service_role=X/postgres} secdef=false
-- 정정본 후보 창 = 「apply_end ≥ 오늘」(2026-10-21 · 우편함 「코드·운영 — …20929 정정본이 분석 대기열에 안 들어갔다: 원인 조사 + 주택목록 정정 대조」).
--   원인: 정정본 후보(rcand)가 일반 후보와 같은 reps(apply_end ≥ 오늘+3 — ⑨ 5-2 분모)를 거쳐, 마감 3일 안에 나온 정정은 처음부터 후보가 못 됐다
--   (…20929 — 10-20 16:20 KST 정정 수집 · 마감 10-21 · 10-20+3 = 10-23 > 10-21. 대조군 …20927 — 10-19 정정 · 마감 10-23 = 10-19+3 이하라 들었다).
--   고침: reps 를 「≥ 오늘」로 넓히고 일반 후보(cand)만 in_win(≥ 오늘+3 또는 SH 접수기간 없음)으로 종전 창을 지킨다 — cand 규칙(analysis_rate.sql 과 같음)은 그대로.
--   health-ops revision_gap 은 이미 「≥ 오늘」이다 — 이제 발송기와 같은 창.
-- 되돌리기: analysis_dispatch_tick 을 2026-10-20_02 정의(git show <이 PR 앞>:supabase/rpc/analysis_dispatch_tick.sql)로 CREATE OR REPLACE(ACL 같음).
CREATE OR REPLACE FUNCTION public.analysis_dispatch_tick(p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- 공고 분석 감지 루틴 발송기 — cron zipfit-analysis-dispatch 가 10분마다 부른다(2026-10-01 운영 회차).
-- ① 보낸 요청의 응답을 정리한다 ② 새 후보를 대기열에 넣고 더는 후보가 아닌 대기를 뺀다 ③ 보낼지 판정해 루틴 API 를 한 번 부른다.
-- 후보 = ⑨ 5-2 분모(대표 ∧ 묶음 첨부 > 0 ∧ apply_end ≥ 오늘+3) ∧ 미분석(같은 회차 또는 링크로 붙은 구성원에 완료 계열 분석 없음).
--   🔴 supabase/metrics/analysis_rate.sql 과 같은 규칙이다 — 묶음 키(link_map)는 get_announcements_deduped · get_announcement_group_ids ·
--   get_reanalysis_queue 와 같다. 한쪽을 바꾸면 함께 바꾼다.
-- 보낼 때 = 스위치 켬 ∧ 도는 회차 없음 ∧ 실을 것(ready) 있음 ∧ (루틴이 되돌린 것 있음 ∨ 마지막 진입 뒤 grace 지남 ∨ 첫 ready 뒤 max_wait 지남).
--   「되돌린 것 있음」으로 바로 보내는 것은 직전에 끝난 회차가 공고를 1건 이상 끝냈을 때만이다(2026-10-01 진전 없는 되돌림).
--   직전 회차가 0건을 끝냈으면 되돌린 공고는 되돌린 때를 진입·ready 시각으로 보고 grace·max_wait 를 다시 따른다
--   (공통 원인 — 인증 · LH 장애 · 열린 이슈 — 으로 아무것도 못 끝낸 회차가 10분마다 다시 발송되지 않게).
--   p_force = true(수동 시험)는 스위치·유예를 건너뛰되 잠금·비밀값은 지킨다.
--   매입(LH 주거복지 - 매입임대)은 홍보물 목록 수집이 끝나야 ready — 밤 수집분은 다음 날 홍보물 수집(KST 09:05~) 뒤에 나간다.
--   연속 3번 실패하면 자동 발송을 멈춘다(수동 p_force 는 된다) — health-ops 가 알린다.
--   끝낸 공고 0건으로 끝난 회차가 연속 3번이어도 같은 취급으로 멈춘다(result stalled) — 회차가 끝낸 수 = 그 run_id 의 done 행 수.
-- 🔴 한 번에 싣는 것은 한 몫(config.batch_size · 기본 1건)뿐이다(2026-10-01 · run 39 — 9건을 한 회차로 보내자 루틴이 하나도 착수 못 했다).
--   몫 순서 = 분석 순서 산식: 접수 전 먼저 · 접수 시작 가까운 순 · (접수 중·상시는 마감 가까운 순) · 같으면 먼저 들어온 순.
--   가장 최근 발송 회차가 끝난(finished) 회차이고 1건 이상 끝냈으면, 그 회차 발송 때 이미 ready 였던 남은 공고를 유예 없이 이어서 보낸다(reason next).
--   가장 최근 회차가 실패(failed)면 이어 보내지 않는다 — 종전 갈래(유예·상한·3회 실패 멈춤)를 그대로 따른다.
--   그 뒤에 들어온 공고는 종전대로 grace·max_wait 를 따른다.
-- ① 응답 정리는 잡힌 뒤에도 한다(2026-10-01 · run 39 — 루틴의 잡기가 cron 정리보다 빨라 http_status·session_url 이 비었다):
--   firing·running·finished(하루 안) 중 http_status 가 빈 run 의 응답을 run 행에 남긴다 · firing·running 에 온 4xx·5xx 는 failed + 대기열 복귀
--   (running 의 상태 없는 응답 — pg_net 시간 초과 등 — 은 잡기가 발송 성공을 증명하므로 실패로 보지 않고 error 만 남긴다).
-- 🔵 후속 처리 요청(2026-10-02 · 우편함 「협의 — 원문 키 사이클 …」 1): analysis_followup_requests 의 대기(waiting)가 있으면
--   분석 몫이 보낼 때가 아니어도 유예 없이 사유 followup 으로 루틴을 부른다(이번 몫 0건 — 루틴은 우편함 진행 요청 후속 처리만 하고 잡기에서 닫힌다).
--   분석 몫을 보낼 때는 대기 요청을 그 회차에 함께 싣는다(루틴이 후속 처리를 먼저 한다 — 따로 부르지 않는다).
--   followup 회차는 「진전」 판정(되돌림 · 이어 보내기 · 연속 0건 멈춤)에서 빠진다 — 분석 몫이 없어서다. 연속 3실패 멈춤 · 스위치 · 잠금은 그대로 따른다.
--   만든 지 60분 넘게 도는 followup 회차는 닫는다(잡힘과 무관 — 2026-10-06 1-B 뒤로는 잡힌 회차도 끝 호출이 없으면 여기서 닫힌다 ·
--   대기열 공고가 없어 이중 쓰기 위험이 없다 · 문구 2026-10-06 1-C ④ — 동작 변경 0).
--   🔵 2026-10-15(우편함 「코드 — … 후속 자동 닫힘 되돌리기 …」 5) — 그 회차에 실린 요청 중 아무도 잡지도 결과를 적지도 않은 것
--   (picked_at · result 둘 다 빔 — run 201 · 요청 #37)은 done 이 아니라 대기(waiting)로 되돌려 같은 판정이 다시 보낸다.
--   되돌림은 요청마다 2번까지(auto_returns) — 셋째로 자동 닫히면 done · result 「실패」(health-ops followup_unreported ⚠️ 가 잡는다).
--   잡힌(picked_at 있음) 요청 · 결과를 적은 요청은 종전대로 done. 분석 몫 대기열(analysis_dispatch_queue)은 건드리지 않는다.
-- 🔵 정정본 후보(2026-10-06 · 우편함 「코드 — Z-1 원문 키 사이클(DB) …」 PR-A A1 · run 119 고령다산2 …20809):
--   같은 제목 키·마감 구성원에 완료 계열 분석이 있어 후보에서 빠지는 대표라도, 그 대표가 정정 행(is_revised)이고
--   정정본 분석이 없으면(get_revision_analysis_done 거짓 — 화면 「정정 전 공고 기준」 배너와 같은 판정) 후보로 올린다.
--   대기열 키 = 묶음 키 || ' #정정 ' || 정정 시각(KST 분) — 원공고의 끝난(done) 행과 겹치지 않고, 다시 정정되면 새 몫이 된다.
--   루틴은 잡은 몫의 group_key 에 ' #정정 ' 이 있으면 신규 분석이 아니라 reverify 스킬 「정정공고」 갈래로 처리한다.
--   🔵 2026-10-16(우편함 「코드 — 정정 몫 누락 …」 · …0877 대구경북 기존주택매입) — 「같은 회차」를 지금 apply_end 하나로만 대조하면
--   분석이 확정창(apply_end_confirmed → 보호 트리거)으로 원공고의 apply_end 를 옮긴 묶음(…0875 10-21 → 11-04)의 정정본(10-21)이 빠졌다.
--   그래서 정정본 후보는 「그 구성원이 이 묶음 키 · 이 마감으로 대기열에서 끝난(done) 행」도 같은 회차로 본다 — 발송 때의 마감이라
--   회차 축(같은 제목 다른 회차는 마감이 달라 잡히지 않는다)은 그대로다. 정정본 후보로 간 공고는 일반 후보(cand)에서 뺀다
--   (cand 는 analysis_rate.sql 과 같은 규칙이라 그대로 둔다 — 종전에는 cand 로 원공고의 done 행과 충돌해 아무 표시 없이 사라졌다).
--   대기열 키 충돌: 더는 후보가 아니라 뺐던(dropped) 행이 다시 후보면 대기(waiting)로 되살린다 · 끝난(done) 행과 충돌하는 후보는
--   health-ops dispatch_orphan ❌(health-ops-soft)가 잡는다.
--   🔵 2026-10-21(우편함 「코드·운영 — …20929 정정본이 분석 대기열에 안 들어갔다 …」) — 정정본 후보의 창은 「apply_end ≥ 오늘」이다
--   (일반 후보는 종전대로 ⑨ 5-2 분모 「≥ 오늘+3」 — reps.in_win). 종전에는 정정본 후보도 reps 의 「≥ 오늘+3」을 거쳐
--   마감 3일 안에 나온 정정(…20929 대구경북 든든전세 분양전환형 — 10-20 정정 · 10-21 마감)이 처음부터 후보가 못 됐다.
--   정정 전 분석이 이미 화면에 열려 있어 마감 날까지 정정본으로 고칠 몫이다 — health-ops revision_gap 과 같은 창(≥ 오늘).
-- 🔵 접수기간 없는 SH 공고(2026-10-12 · 우편함 「코드·운영 — 부산 첨부 등록 · SH 접수기간 없는 열린 공고 대기열 진입」 2):
--   SH 목록에는 접수기간이 없어 apply_end 가 NULL 인 열린 SH 대표가 「apply_end ≥ 오늘+3」과 대기열 PK(apply_end NOT NULL)에서 빠졌다.
--   대표의 apply_end 가 NULL ∧ SH ∧ status 가 접수마감이 아님 ∧ 최근 원문 키 대조(source_page_checks)의 SH 목록 모집상태가 「모집중」이면 후보로 올린다.
--   (SH 목록이 모집상태를 비워 두는 후속 공지 — 접수결과·2순위 안내 — 는 여기서 빠진다.)
--   대기열 키만 가상으로 둔다: group_key = 묶음 키 || ' #접수기간 없음 ' || 공고일 · apply_end = 9999-12-31(몫 순서 맨 뒤).
--   🔴 이 가상 값은 analysis_dispatch_queue 밖으로 나가지 않는다 — announcements · 화면 · RPC 의 날짜는 그대로 NULL 이고,
--   접수기간은 분석이 원문으로 *_confirmed 에 채운다. 채워진 뒤 같은 공고는 같은 공고 ID 의 완료 분석으로 후보에서 빠진다(SH 만의 자기 일치).
-- 🔵 자동 회수(2026-10-15 · 우편함 「코드 — 루틴 자동 회수(안 A …)」 1 · 설계 PR #517 회신 ⓪(b)) — ①-3:
--   running ∧ reason ≠ followup ∧ 잡힘(claimed_at) ∧ 마지막 심장박동(heartbeat_at)이 30분 넘게 조용 ∧ 만든 지 90분 넘은 회차는
--   루틴 세션이 끊긴 것으로 보고 released 로 옮긴다(note 「자동 회수 …」) · 실린 몫 → waiting · returned · 실린 후속 요청 → waiting.
--   그 회차 표지의 분석 행(batch_label 「…자동runN」 또는 실린 몫 공고 ID · 회차 만든 뒤 분석)이 있으면 후속 요청 「run N 마감 정리」를 대기에 넣는다
--   (분석은 커밋됐는데 우편함 회신·이력 PR 이 없는 꼴 — 새 회차가 그 둘만 한다 · 분석 몫은 ② 후보 판정이 완료 분석을 보고 뺀다).
--   겹침 방지: 루틴은 단계 경계마다 analysis_run_heartbeat(N) · 분석 DB 쓰기 트랜잭션 맨 앞에 analysis_run_alive(N)(거짓이면 예외로 롤백 ·
--   참이면 회차 행을 잠가 그 트랜잭션이 끝날 때까지 회수가 기다린다) · released 회차의 analysis_queue_finish 는 쓰기 없이 released 를 돌려준다.
--   ①-3 은 ② 앞이다 — 되돌린 몫이 같은 판정에서 바로 후보 대조(완료 분석이면 dropped)를 거치고, 잠금이 풀렸으니 이번 판정이 새 회차를 보낼 수 있다.
-- 🔵 미착수 회수(2026-10-20 · 우편함 「코드·운영 — 미착수 회차 자동 회수·재발송(안 A) + 잡기 가드 …」 1 · 다운님 안 A 선택) — ①-4:
--   firing·running ∧ reason ≠ followup ∧ 잡기 없음(claimed_at NULL) ∧ 발송 45분 지남 → released(「자동 회수 — 미착수(잡기 없음 N분)」) ·
--   실린 몫 → waiting · returned · 실린 후속 요청 → waiting → 이번(또는 다음) 판정이 다시 보낸다.
--   계기: run 260(2026-10-19) — 세션이 만들어졌으나 첫 턴이 사용량 한도(429)로 끝나고, 창이 다시 열려도 스스로 재개하지 않아 122분 뒤 사람이 깨웠다.
--   잡기 전이라 쓰기가 시작됐을 수 없어 판정 (가)(심장박동 없는 회차는 회수 밖 — 잡은 뒤 오래 도는 회차가 끝내 쓰는 위험)와 겹치지 않는다.
--   헛도는 비용 막기: 직전 미착수 회수 뒤 60분 안에는 거두지 않는다(사용량 창 5시간 안 최대 5번) · 6시간 안 미착수 회수가 6번이면 멈춘다
--   (사용량 창보다 길게 안 뜨면 다른 원인 — health-ops dispatch ❌ 로 사람에게). 늦게 깨어난 옛 세션은 착수 심장박동(alive 거짓)에서 멈추고,
--   잡기 가드(analysis_queue_claim(p_run_id))가 새 회차 몫을 잡지 못하게 한다. 45분: 정상 잡기 대기 p95 3분 · 최대 20분 밑(10-01 뒤 76회차 · 넘은 셋은 102~122분).
-- 비밀값: Vault zipfit_routine_fire_url · zipfit_routine_fire_token(값은 표·반환에 싣지 않는다).
declare
  cfg public.analysis_dispatch_config%rowtype;
  rr record;
  resp record;
  n_new int := 0; n_drop int := 0; n_ready int := 0; n_resolved int := 0;
  w_last timestamptz; r_first timestamptz; any_ret boolean; last_done int; nx_at timestamptz; any_next boolean;
  n_sent int := 0; n_fu int := 0; n_fu_sent int := 0;
  v_reason text; v_url text; v_tok text; v_run bigint; v_rid bigint;
  v_promo_ids text;
  n_reclaim int := 0; v_back text[]; v_has_aa boolean;
begin
  perform pg_advisory_xact_lock(hashtext('zipfit_analysis_dispatch'));
  select * into cfg from public.analysis_dispatch_config where id = 1;

  -- ① 응답 정리(잡힌 뒤 온 응답 포함)
  for rr in select * from public.analysis_dispatch_runs
             where net_request_id is not null and http_status is null
               and (state = 'firing' or (state in ('running', 'finished') and created_at > now() - interval '1 day')) loop
    select status_code, content, timed_out, error_msg into resp from net._http_response where id = rr.net_request_id;
    if found and resp.status_code between 200 and 299 then
      update public.analysis_dispatch_runs
         set state = case when state = 'firing' then 'running' else state end, http_status = resp.status_code,
             session_url = coalesce(session_url, (case when resp.content ~ '^\s*\{' then resp.content::jsonb end)->>'claude_code_session_url')
       where id = rr.id;
      n_resolved := n_resolved + 1;
    elsif (found and rr.state = 'firing') or (found and rr.state = 'running' and resp.status_code >= 400)
          or (not found and rr.state = 'firing' and rr.created_at < now() - interval '15 minutes') then
      update public.analysis_dispatch_runs
         set state = 'failed', http_status = resp.status_code, finished_at = now(),
             error = left(coalesce(resp.error_msg, resp.content, '응답 없음(15분)'), 500)
       where id = rr.id;
      update public.analysis_dispatch_queue
         set state = 'waiting', run_id = null, state_at = now(), note = '발송 실패 run ' || rr.id
       where run_id = rr.id and state in ('sent', 'claimed');
      update public.analysis_followup_requests
         set state = 'waiting', run_id = null, state_at = now(), note = '발송 실패 run ' || rr.id
       where run_id = rr.id and state = 'sent';
      n_resolved := n_resolved + 1;
    elsif found then
      -- 잡힌 뒤(running · 상태 없음)·끝난 뒤(finished · 2xx 아님) 온 응답은 기록만 한다 — 다음 판정이 다시 보지 않게 http_status 를 채운다(없으면 0).
      update public.analysis_dispatch_runs
         set http_status = coalesce(resp.status_code, 0), error = coalesce(error, left(coalesce(resp.error_msg, resp.content), 500))
       where id = rr.id;
      n_resolved := n_resolved + 1;
    end if;
  end loop;

  -- ①-2 만든 지 60분 넘은 followup 회차 닫기(잡힘과 무관 · 후속 전용 — 대기열 공고 없음)
  for rr in select id, claimed_at from public.analysis_dispatch_runs
             where reason = 'followup' and state = 'running' and created_at < now() - interval '60 minutes' loop
    update public.analysis_dispatch_runs
       set state = 'finished', finished_at = now(), finish_note = '후속 전용 — 만든 지 60분 · 자동으로 닫음('
                          || case when rr.claimed_at is null then '잡기 없음' else '잡힌 뒤 끝 호출 없음' end || ')'
     where id = rr.id;
    update public.analysis_followup_requests
       set state = 'waiting', run_id = null, state_at = now(), auto_returns = auto_returns + 1,
           note = 'run ' || rr.id || ' 자동 닫힘(잡기·결과 없음) → 대기로 되돌림 ' || (auto_returns + 1) || '/2'
     where run_id = rr.id and state = 'sent' and picked_at is null and result is null and auto_returns < 2;
    update public.analysis_followup_requests
       set state = 'done', state_at = now(), note = 'run ' || rr.id || ' 자동으로 닫음',
           result = case when picked_at is null and result is null then '실패' else result end,
           result_note = case when picked_at is null and result is null
                              then '후속 전용 회차가 잡기·결과 없이 자동으로 닫힘 — 대기로 2번 되돌린 뒤 세 번째(run ' || rr.id || ') · 사람 손 필요'
                              else result_note end,
           reported_at = case when picked_at is null and result is null then now() else reported_at end
     where run_id = rr.id and state = 'sent';
    n_resolved := n_resolved + 1;
  end loop;

  -- ② 후보 → 대기열
  -- ①-3 자동 회수(2026-10-15) — 루틴 세션이 끊긴 분석 회차(심장박동 30분 없음 ∧ 만든 지 90분)를 released 로 옮기고 실린 몫·후속을 대기로 되돌린다.
  --      🔴 심장박동이 한 번도 없는 회차(heartbeat_at NULL — 루틴 v2.6 까지)는 회수하지 않는다(claude.ai 판정 (가) 2026-10-15):
  --      v2.6 은 심장박동·쓰기 앞 가드를 부르지 않아, 오래 돌다 끝내 쓰는 회차(run 101 233분 · 186 670분)를 거두면 같은 공고를 두 회차가 쓴다.
  --      그런 회차는 종전대로 health-ops stale_lock ❌ + 사람 풀기(analysis_run_release). 루틴 v2.7 이 잡기 직후 심장박동을 부른 회차부터 대상이다.
  for rr in select r.id, r.created_at, r.claimed_at, r.heartbeat_at from public.analysis_dispatch_runs r
             where r.state = 'running' and r.reason <> 'followup' and r.claimed_at is not null
               and r.heartbeat_at is not null and r.heartbeat_at < now() - interval '30 minutes'
               and r.created_at < now() - interval '90 minutes'
             order by r.id for update loop
    update public.analysis_dispatch_runs
       set state = 'released', finished_at = now(),
           finish_note = '자동 회수 — 심장박동 30분 없음(마지막 '
                         || to_char(rr.heartbeat_at at time zone 'Asia/Seoul', 'MM-DD HH24:MI') || ' KST)'
     where id = rr.id and state = 'running';
    with u as (
      update public.analysis_dispatch_queue
         set state = 'waiting', returned = true, run_id = null, state_at = now(), note = '자동 회수 run ' || rr.id
       where run_id = rr.id and state in ('sent', 'claimed')
      returning announcement_id
    )
    select array_agg(announcement_id) into v_back from u;
    update public.analysis_followup_requests
       set state = 'waiting', run_id = null, state_at = now(), note = '자동 회수 run ' || rr.id
     where run_id = rr.id and state = 'sent';
    select exists (select 1 from public.announcement_analysis aa
                    where aa.analyzed_at >= rr.created_at
                      and (aa.batch_label ~ ('자동\s*run\s*' || rr.id || '(\D|$)') or aa.announcement_id = any(coalesce(v_back, '{}'::text[]))))
      into v_has_aa;
    if v_has_aa then
      insert into public.analysis_followup_requests (page_ref, note)
      values ('run ' || rr.id || ' 마감 정리',
              '자동 회수된 run ' || rr.id || ' 에 분석 행이 있다 — 분석하지 말고 그 회차 우편함 페이지 「## 회신」과 이력 PR 만 한다(분석 몫은 완료 분석이라 대기열에서 빠진다)')
      on conflict (page_ref) where state = 'waiting' do nothing;
    end if;
    n_reclaim := n_reclaim + 1;
  end loop;

  -- ①-4 미착수 회수(2026-10-20) — 잡기 없이 45분 넘은 분석 회차(세션이 뜨지 않음 · 사용량 소진이 흔한 원인)를 released 로 옮기고 몫·후속을 대기로 되돌린다.
  --      60분 간격 · 6시간 6번 상한(머리 주석). 한 판정에 한 회차만.
  if not exists (select 1 from public.analysis_dispatch_runs
                  where finish_note like '자동 회수 — 미착수%' and finished_at > now() - interval '60 minutes')
     and (select count(*) from public.analysis_dispatch_runs
           where finish_note like '자동 회수 — 미착수%' and finished_at > now() - interval '6 hours') < 6 then
    for rr in select r.id, r.created_at from public.analysis_dispatch_runs r
               where r.state in ('firing', 'running') and r.reason <> 'followup' and r.claimed_at is null
                 and r.created_at < now() - interval '45 minutes'
               order by r.id limit 1 for update loop
      update public.analysis_dispatch_runs
         set state = 'released', finished_at = now(),
             finish_note = '자동 회수 — 미착수(잡기 없음 ' || round(extract(epoch from now() - rr.created_at) / 60) || '분)'
       where id = rr.id and state in ('firing', 'running') and claimed_at is null;
      continue when not found;
      update public.analysis_dispatch_queue
         set state = 'waiting', returned = true, run_id = null, state_at = now(), note = '자동 회수 run ' || rr.id || '(미착수)'
       where run_id = rr.id and state in ('sent', 'claimed');
      update public.analysis_followup_requests
         set state = 'waiting', run_id = null, state_at = now(), note = '자동 회수 run ' || rr.id || '(미착수)'
       where run_id = rr.id and state = 'sent';
      n_reclaim := n_reclaim + 1;
    end loop;
  end if;

  with link_map as (
    select distinct on (l.linked_announcement_id)
      l.linked_announcement_id as aid, announcement_dedup_key(lh.title) as lh_key
    from public.announcement_post_links l
    join public.announcements lh on lh.announcement_id = l.lh_announcement_id
    where lh.title is not null and lh.hidden_from_listing is not true
    order by l.linked_announcement_id, l.lh_announcement_id
  ),
  keyed as materialized (
    select a.announcement_id, a.apply_end, a.attachment_urls,
           coalesce(lm.lh_key, announcement_dedup_key(a.title)) as k, (lm.aid is not null) as linked
    from public.announcements a
    left join link_map lm on lm.aid = a.announcement_id
    where a.title is not null and a.hidden_from_listing is not true
  ),
  reps as (
    select d.announcement_id, d.title, d.source, d.housing_type, d.apply_start, d.apply_end, d.announcement_date, k.k,
           (d.apply_end is null or d.apply_end >= current_date + 3) as in_win
    from get_announcements_deduped() d
    join keyed k on k.announcement_id = d.announcement_id
    where d.apply_end >= current_date
       or (d.apply_end is null and d.source = 'SH' and d.status is distinct from '접수마감'
           and (select c.page_status from public.source_page_checks c
                 where c.source = 'SH' and c.card_id = d.announcement_id and c.error is null
                 order by c.checked_at desc limit 1) = '모집중')
  ),
  cand as (
    select r.* from reps r
    where r.in_win
      and (select coalesce(sum(jsonb_array_length(g.attachment_urls)), 0) from keyed g
            where g.k = r.k and jsonb_typeof(g.attachment_urls) = 'array') > 0
      and not exists (select 1 from keyed g
            join public.announcement_analysis aa on aa.announcement_id = g.announcement_id
           where g.k = r.k and (g.apply_end = r.apply_end or g.linked or (r.source = 'SH' and g.announcement_id = r.announcement_id))
             and aa.status in ('완료', '완료(보조 누락)', '완료(판정 대기)', '완료(소급)'))
  ),
  rcand as (
    select r.announcement_id, r.title, r.source, r.housing_type, r.apply_start, r.apply_end,
           r.k || ' #정정 ' || to_char(a.revised_at at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI') as k
    from reps r
    join public.announcements a on a.announcement_id = r.announcement_id
    where a.is_revised is true and a.revised_at is not null and r.apply_end is not null
      and (select coalesce(sum(jsonb_array_length(g.attachment_urls)), 0) from keyed g
            where g.k = r.k and jsonb_typeof(g.attachment_urls) = 'array') > 0
      and exists (select 1 from keyed g
            join public.announcement_analysis aa on aa.announcement_id = g.announcement_id
           where g.k = r.k
             and (g.apply_end = r.apply_end or g.linked
                  or exists (select 1 from public.analysis_dispatch_queue dq
                              where dq.state = 'done' and dq.group_key = r.k and dq.apply_end = r.apply_end
                                and dq.announcement_id = g.announcement_id))
             and aa.status in ('완료', '완료(보조 누락)', '완료(판정 대기)', '완료(소급)'))
      and not public.get_revision_analysis_done(r.announcement_id)
  ),
  allc as (
    select c.announcement_id, c.title, c.source, c.housing_type, c.apply_start,
           coalesce(c.apply_end, date '9999-12-31') as apply_end,
           case when c.apply_end is null then c.k || ' #접수기간 없음 ' || coalesce(c.announcement_date::text, '공고일 없음') else c.k end as k,
           false as rev, (c.apply_end is null) as noend
    from cand c
    where not exists (select 1 from rcand x where x.announcement_id = c.announcement_id)
    union all
    select x.announcement_id, x.title, x.source, x.housing_type, x.apply_start, x.apply_end, x.k, true, false from rcand x
  ),
  ins as (
    insert into public.analysis_dispatch_queue (group_key, apply_end, announcement_id, title, apply_start, phase, needs_promo, note)
    select distinct on (c.k, c.apply_end) c.k, c.apply_end, c.announcement_id, c.title, c.apply_start,
           case when c.noend then '접수기간 없음' when c.apply_start > current_date then '접수 전' else '접수 중' end,
           (c.source = 'LH' and c.housing_type = '주거복지 - 매입임대'),
           case when c.rev then '정정본 — reverify 스킬 「정정공고」 갈래'
                when c.noend then '접수기간 없음(SH 목록 모집중) — apply_end 9999-12-31 은 대기열 키 전용 · 접수기간은 원문으로 확정' end
    from allc c
    order by c.k, c.apply_end, c.announcement_id
    on conflict (group_key, apply_end) do update
       set state = 'waiting', announcement_id = excluded.announcement_id, title = excluded.title,
           apply_start = excluded.apply_start, phase = excluded.phase, needs_promo = excluded.needs_promo,
           enqueued_at = now(), ready_at = null, returned = false, run_id = null, state_at = now(),
           note = coalesce(excluded.note || ' · ', '') || '다시 후보 — 뺐던(dropped) 행을 되살림'
     where public.analysis_dispatch_queue.state = 'dropped'
    returning 1
  ),
  drp as (
    update public.analysis_dispatch_queue q
       set state = 'dropped', state_at = now(), note = '더는 후보가 아님(분석됨 · 접수 창 밖 · 대표 바뀜)'
     where q.state = 'waiting'
       and not exists (select 1 from allc c where c.k = q.group_key and c.apply_end = q.apply_end)
    returning 1
  )
  select (select count(*) from ins), (select count(*) from drp) into n_new, n_drop;

  update public.analysis_dispatch_queue q
     set ready_at = now()
   where q.state = 'waiting' and q.ready_at is null
     and (not q.needs_promo
          or exists (select 1 from public.announcement_promo_fetch f where f.announcement_id = q.announcement_id and f.ok));

  -- ②-2 🔵 2026-10-08(표시층 긴급 2 · 4 · 다운님 결정 처방 ⑴) — 매입 홍보물 즉시 수집. 이 실행에서 새로 든(enqueued_at = now()) needs_promo 대기 중
  --   아직 ready 가 아닌 것만 collect-lh-promo 를 한 번 부른다(응답은 기다리지 않는다 · 성공하면 다음 tick 이 위 규칙으로 ready_at 을 세운다).
  --   🔴 soft=1 — 실패해도 announcement_promo_fetch 에 쓰지 않는다. 그래서 정기 cron(:05/:35)이 종전처럼 「새 공고」로 집는다
  --   (실패 6시간 재시도 문턱에 들지 않는다 — 지금보다 늦어지는 길이 없다). 비밀값은 Vault cron_secret_v2(다른 수집 cron 과 같다).
  select string_agg(q.announcement_id, ',' order by q.announcement_id) into v_promo_ids
    from public.analysis_dispatch_queue q
   where q.state = 'waiting' and q.needs_promo and q.ready_at is null and q.enqueued_at = now();
  if v_promo_ids is not null then
    perform net.http_post(
      url := 'https://khdpjjyspmlqtzperoqg.supabase.co/functions/v1/collect-lh-promo?mode=collect&soft=1&id=' || v_promo_ids,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret',
        (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret_v2')),
      body := '{}'::jsonb,
      timeout_milliseconds := 150000);
  end if;

  -- ③ 보낼지
  if exists (select 1 from public.analysis_dispatch_runs where state in ('firing', 'running')) then
    return jsonb_build_object('result', 'locked', 'new', n_new, 'dropped', n_drop, 'resolved', n_resolved, 'reclaimed', n_reclaim);
  end if;
  select (select count(*) from public.analysis_dispatch_queue q where q.run_id = r.id and q.state = 'done')
    into last_done
    from public.analysis_dispatch_runs r where r.state = 'finished' and r.reason <> 'followup' order by r.id desc limit 1;
  select r.created_at into nx_at
    from public.analysis_dispatch_runs r
   where r.id = (select max(id) from public.analysis_dispatch_runs where reason <> 'followup') and r.state = 'finished'
     and exists (select 1 from public.analysis_dispatch_queue q where q.run_id = r.id and q.state = 'done');
  select count(*) filter (where ready_at is not null),
         max(case when returned and last_done = 0 then greatest(enqueued_at, state_at) else enqueued_at end),
         min(case when returned and last_done = 0 then greatest(ready_at, state_at) else ready_at end),
         bool_or(returned and ready_at is not null and coalesce(last_done, 1) > 0),
         coalesce(bool_or(not returned and ready_at <= nx_at and state_at <= nx_at), false)
    into n_ready, w_last, r_first, any_ret, any_next
    from public.analysis_dispatch_queue where state = 'waiting';
  select count(*) into n_fu from public.analysis_followup_requests where state = 'waiting';
  if n_ready = 0 and n_fu = 0 then
    return jsonb_build_object('result', 'empty', 'new', n_new, 'dropped', n_drop, 'resolved', n_resolved, 'reclaimed', n_reclaim);
  end if;
  if n_ready > 0 then
    v_reason := case when p_force then 'manual'
                     when any_ret then 'returned'
                     when any_next then 'next'
                     when now() - w_last >= cfg.grace then 'grace'
                     when now() - r_first >= cfg.max_wait then 'max_wait' end;
  end if;
  if v_reason is null and n_fu > 0 then
    v_reason := 'followup';
  end if;
  if v_reason is null then
    return jsonb_build_object('result', 'waiting', 'ready', n_ready, 'new', n_new, 'dropped', n_drop, 'reclaimed', n_reclaim,
                              'grace_left_min', round(extract(epoch from cfg.grace - (now() - w_last)) / 60));
  end if;
  if not p_force and not cfg.enabled then
    return jsonb_build_object('result', 'disabled', 'would', v_reason, 'ready', n_ready, 'followups', n_fu, 'new', n_new, 'dropped', n_drop, 'reclaimed', n_reclaim);
  end if;
  if not p_force and (select count(*) = 3 and bool_and(state = 'failed')
                        from (select state from public.analysis_dispatch_runs order by id desc limit 3) z) then
    return jsonb_build_object('result', 'failing', 'would', v_reason, 'ready', n_ready, 'reclaimed', n_reclaim);
  end if;
  if not p_force and (select count(*) = 3 and bool_and(state = 'finished' and done = 0)
                        from (select r.state, (select count(*) from public.analysis_dispatch_queue q
                                                where q.run_id = r.id and q.state = 'done') as done
                                from public.analysis_dispatch_runs r where r.reason <> 'followup' order by r.id desc limit 3) z) then
    return jsonb_build_object('result', 'stalled', 'would', v_reason, 'ready', n_ready, 'reclaimed', n_reclaim);
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'zipfit_routine_fire_url';
  select decrypted_secret into v_tok from vault.decrypted_secrets where name = 'zipfit_routine_fire_token';
  if coalesce(v_url, '') = '' or coalesce(v_tok, '') = '' then
    return jsonb_build_object('result', 'no_secret', 'would', v_reason, 'ready', n_ready, 'reclaimed', n_reclaim);
  end if;

  insert into public.analysis_dispatch_runs (reason, items) values (v_reason, 0) returning id into v_run;
  if v_reason <> 'followup' then
  with pick as (
    select q.group_key, q.apply_end
      from public.analysis_dispatch_queue q
     where q.state = 'waiting' and q.ready_at is not null
     order by (q.apply_start > current_date) desc nulls last,
              case when q.apply_start > current_date then q.apply_start end,
              q.apply_end, q.enqueued_at, q.announcement_id
     limit greatest(coalesce(cfg.batch_size, 1), 1)
  )
  update public.analysis_dispatch_queue q
     set state = 'sent', run_id = v_run, returned = false, state_at = now()
    from pick
   where q.group_key = pick.group_key and q.apply_end = pick.apply_end;
  get diagnostics n_sent = row_count;
  end if;
  update public.analysis_dispatch_runs set items = n_sent where id = v_run;
  update public.analysis_followup_requests
     set state = 'sent', run_id = v_run, state_at = now()
   where state = 'waiting';
  get diagnostics n_fu_sent = row_count;
  v_rid := net.http_post(
    url := v_url,
    body := jsonb_build_object('text', format('ZipFit 분석 발송 run %s · 이번 몫 %s건 · 남은 대기 %s건 · 사유 %s', v_run, n_sent, n_ready - n_sent, v_reason)
                                       || case when v_reason = 'followup' then format(' — 분석 몫 없음 · 우편함 후속 처리 요청 %s건만', n_fu_sent)
                                               when n_fu_sent > 0 then format(' · 우편함 후속 처리 요청 %s건(먼저)', n_fu_sent) else '' end),
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_tok,
                                  'anthropic-beta', 'experimental-cc-routine-2026-04-01', 'anthropic-version', '2023-06-01'),
    timeout_milliseconds := 30000);
  update public.analysis_dispatch_runs set net_request_id = v_rid where id = v_run;
  return jsonb_build_object('result', 'fired', 'run', v_run, 'reason', v_reason, 'items', n_sent, 'left', n_ready - n_sent,
                            'followups', n_fu_sent, 'new', n_new, 'dropped', n_drop, 'reclaimed', n_reclaim);
end
$function$
;
