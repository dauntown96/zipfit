-- 트리거 바인딩 (pg_get_triggerdef 출력 그대로)
-- 함수 본문은 각 <함수명>.sql 참고.

CREATE TRIGGER protect_created_at_trigger BEFORE UPDATE ON public.announcements FOR EACH ROW EXECUTE FUNCTION protect_created_at();
CREATE TRIGGER protect_detail_columns_trigger BEFORE UPDATE ON public.announcements FOR EACH ROW EXECUTE FUNCTION protect_detail_columns();
CREATE TRIGGER trg_announcements_updated_at BEFORE UPDATE ON public.announcements FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_compute_flags BEFORE INSERT OR UPDATE ON public.announcements FOR EACH ROW EXECUTE FUNCTION compute_announcement_flags();
CREATE TRIGGER trg_set_revised_at BEFORE INSERT OR UPDATE ON public.announcements FOR EACH ROW EXECUTE FUNCTION set_revised_at();
CREATE TRIGGER trg_user_profiles_updated_at BEFORE UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
