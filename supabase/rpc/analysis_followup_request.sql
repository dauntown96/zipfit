CREATE OR REPLACE FUNCTION public.analysis_followup_request(p_page_ref text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
-- 우편함 「진행 요청」 후속 처리 페이지(「운영 — 데이터 쓰기 …」)를 루틴에 바로 맡긴다(2026-10-02 · 우편함 「협의 — 원문 키 사이클 …」 1).
-- 🔴 service_role(관리 API)·postgres 만 부른다 — 페이지를 만든 뒤 Claude Code(관리 API)나 다운님이 한 번 부른다(claude.ai 는 DB 를 쓰지 않는다 — 분석 스킬).
-- 요청을 대기(waiting)로 남길 뿐 루틴을 직접 부르지 않는다 — 다음 발송 판정(cron zipfit-analysis-dispatch · 10분마다)이
-- 분석 몫이 없어도 사유 followup 으로 루틴을 부른다(도는 회차가 있으면 끝난 뒤 · 스위치·연속 3실패 멈춤은 그대로).
-- 같은 페이지의 대기 요청이 이미 있으면 새로 만들지 않고 그 요청을 돌려준다.
-- 루틴은 Notion 우편함에서 진행 요청 페이지를 스스로 찾는다 — p_page_ref 는 기록용(페이지 id 또는 제목)이다.
declare
  v_ref text := btrim(coalesce(p_page_ref, ''));
  v_id bigint;
begin
  if v_ref = '' then
    raise exception '우편함 페이지(p_page_ref)가 필요하다';
  end if;
  insert into public.analysis_followup_requests (page_ref, note) values (v_ref, p_note)
  on conflict (page_ref) where state = 'waiting' do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.analysis_followup_requests where page_ref = v_ref and state = 'waiting';
    return jsonb_build_object('request', v_id, 'state', 'waiting', 'duplicate', true);
  end if;
  return jsonb_build_object('request', v_id, 'state', 'waiting', 'duplicate', false,
                            'next', '다음 발송 판정(10분마다 · 매시 6분부터)이 루틴을 부른다 — 도는 회차가 있으면 끝난 뒤');
end
$function$
