# 의도된 감소 장부 — 정리 회차가 한 줄 쓰는 법

> 2026-11-23 신설(우편함 「코드·운영 — 열두째 묶음」 A · zipfit-backup #40). 표 `zipfit_ops.intended_drops` · 읽는 쪽 `zipfit-backup` `scripts/heartbeat_report.py`.

데이터 쓰기 회차가 공개 표의 행을 **합치거나 지우면**(재생산 불가 표 `announcement_analysis` · `announcement_policies` 등 포함), 그날 밤 백업 생존 신호가 「행 수가 줄었다」 🔴와 `backup-failure` 이슈를 낸다(#40 — 분석 회차가 `announcement_analysis` 101행을 합친 날). 그 회차는 **정리 SQL과 같은 요청(한 트랜잭션)** 안에서 표마다 한 줄을 남긴다 — 정리가 롤백되면 장부 줄도 함께 사라진다. 생존 신호는 그날 덤프에서 「직전 신호 뒤에 쓰인 줄」을 표별로 합쳐, 그 표의 감소(직전 신호 행 수 − 지금 행 수)가 **합과 같으면 🟡**(경보·이슈 없음)로 낮추고, 다르거나 장부에 없으면 종전대로 🔴다. 같은 날 새로 들어온 행이 감소를 일부 메우면 「다름」이라 🔴가 남는다 — 그때는 회신에 까닭을 적고 이슈를 닫는다(장부를 고쳐 쓰지 않는다 · 덧붙이기만 하는 기록).

```sql
-- 정리 SQL 과 같은 요청 안에서(표마다 한 줄 · expected_drop = 그 표에서 줄어드는 행 수 · round = 우편함 회차 이름 또는 PR)
insert into zipfit_ops.intended_drops (table_name, expected_drop, round, note)
values ('announcement_analysis', 101, '분석 묶음 — ○○ 합치기', '같은 공고 상태 행 합침');
```

- 표 이름은 `public` 표 이름 그대로(스키마 접두 없이). 한 회차가 같은 표를 두 번 줄이면 줄을 둘 쓰거나 합친 수로 한 줄.
- 보관 기간 정리 표(`heartbeat_report.py` `RETENTION_DAYS`)는 쓰지 않는다 — 이미 감소가 경보 밖이다.
- 🔵 **정리 도구를 쓰면 저절로**(2026-11-23 열셋째 묶음 2): `scripts/backfill-kit.py` 계획에 지울 행을 `{"id": "<id>", "delete": true}`로 담고(합치기 = 남길 행은 `set` · 지울 행은 `delete`) `gen … --round "<우편함 회차 이름 또는 PR>"`로 지으면, test.sql · apply.sql 안에 장부 한 줄(표 · 키트가 센 지울 행 수 · 회차)이 지운 행 수 확인 **뒤** 같은 트랜잭션으로 들어간다. `--round`가 비면 짓지 않고 멈춘다. 되돌림(rollback.sql)은 지운 행을 BEFORE 행 전체로 다시 넣고 장부 줄은 그대로 둔다(그날 생존 신호 🔴 = 되돌림이 있었다는 신호). **손 SQL이면 위 한 줄을 직접** 쓴다.
- 정리를 03:00 KST(18:00 UTC 백업) 근처에 하지 않는다 — 공개 덤프와 운영 덤프 사이(수십 초)에 커밋되면 장부 줄만 먼저 실려 그날 🔴가 날 수 있다.
- 확인: `select table_name, expected_drop, round, at from zipfit_ops.intended_drops order by at desc limit 5;`
