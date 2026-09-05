# Prompt Sequence

1. `01-start-province.txt` — Prompt مادر + Bootstrap MCP + شروع Province. فقط `province_id` می‌گیرد.
2. `02-run-scope.txt` — اجرای یک Scope مشخص.
3. `03-resume.txt` — ادامه یک Scope با `previous_id`.
4. `04-repair-entity.txt` — تعمیر یک Entity مشخص.
5. `05-final-audit-minify.txt` — Audit نهایی.

هر Entity Visit/FAQ/Checklist/Media مستقل دارد. Parent نباید operational data مربوط به Child را duplicate کند.
فیلد `costs` از قرارداد حذف شده است.

Media target: Province/County/City/Place = 5 unique images؛ Village/Camping = 3 unique images. هیچ image URL بین Entityها reuse نمی‌شود.
