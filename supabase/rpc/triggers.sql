-- 트리거 바인딩 (pg_get_triggerdef 출력 그대로)
-- 함수 본문은 각 <함수명>.sql 참고.

CREATE TRIGGER protect_created_at_trigger BEFORE UPDATE ON public.announcements FOR EACH ROW EXECUTE FUNCTION protect_created_at();
CREATE TRIGGER protect_detail_columns_trigger BEFORE UPDATE ON public.announcements FOR EACH ROW EXECUTE FUNCTION protect_detail_columns();
CREATE TRIGGER trg_announcements_updated_at BEFORE UPDATE ON public.announcements FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_compute_flags BEFORE INSERT OR UPDATE ON public.announcements FOR EACH ROW EXECUTE FUNCTION compute_announcement_flags();
CREATE TRIGGER trg_set_revised_at BEFORE INSERT OR UPDATE ON public.announcements FOR EACH ROW EXECUTE FUNCTION set_revised_at();
CREATE TRIGGER trg_track_attachment_history BEFORE UPDATE ON public.announcements FOR EACH ROW WHEN ((old.attachment_urls IS DISTINCT FROM new.attachment_urls)) EXECUTE FUNCTION track_attachment_history();
CREATE TRIGGER trg_user_profiles_updated_at BEFORE UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_sh_run_log_started_at BEFORE INSERT ON public.sh_collection_run_log FOR EACH ROW EXECUTE FUNCTION sh_run_log_fill_started_at();
CREATE TRIGGER trg_policy_plain_stale_clear BEFORE UPDATE ON public.announcement_policies FOR EACH ROW WHEN (((old.content_raw IS DISTINCT FROM new.content_raw) AND (old.content_plain IS NOT NULL) AND (NOT (new.content_plain IS DISTINCT FROM old.content_plain)) AND (NOT (new.content_plain_at IS DISTINCT FROM old.content_plain_at)))) EXECUTE FUNCTION policy_plain_clear_on_raw_change();
