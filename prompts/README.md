# Prompt Sequence

1. `01-start-province.txt` — Prompt مادر + Bootstrap MCP + شروع Province. فقط `province_id` می‌گیرد.
2. `02-run-scope.txt` — اجرای یک Scope مشخص.
3. `03-resume.txt` — ادامه یک Scope با `previous_id`.
4. `04-repair-entity.txt` — تعمیر یک Entity مشخص.
5. `06-province-text-rewrite.txt` — بازنویسی متن‌ها با Brand Voice؛ لحن انسانی (بدون حس AI) و بدون نام OTA در متن کاربرمحور (قبل از audit).
6. `05-final-audit-minify.txt` — Audit نهایی + minify.
7. `07-full-province-places.txt` — تکمیل همهٔ Placeها در کل استان؛ فقط `province_id`؛ پیمایش `county-*` و داخل هر کدام `city-*` (بدون انتخاب Scope از کاربر). تمرکز Place؛ deep-research دوبارهٔ اداری نه.
8. `08-media-gap-audit.txt` — اسکن Entityهای بدون عکس / زیر target و تکمیل media؛ فقط `province_id`.
9. `09-province-county-city-places.txt` — **خودکفا** (MCP bootstrap + همهٔ قواعد داخل همان فایل): استان + شهرستان(+Place) + شهر(+Place)؛ فقط `province_id`؛ continuous whole-province. روستا پیش‌نیاز DFS است و باید کامل شود.

### کی کدام را بزنی
| هدف | پرامپت |
|---|---|
| فقط ریشهٔ استان، بعد توقف برای Scope | `01` |
| یک شهرستان/واحد مشخص | `02` (+ `03` برای resume) |
| استان + شهرستان(+مکان) + شهر(+مکان) یک‌سره | `09` |
| فقط جبران Placeهای جاافتاده | `07` |
| فقط جبران عکس | `08` |
| یکدست‌سازی متن | `06` سپس `05` |

هر Entity Visit/FAQ/Checklist/Media مستقل دارد. Parent نباید operational data مربوط به Child را duplicate کند.
فیلد `costs` از قرارداد حذف شده است.
متن کاربرمحور از save اول باید انسانی (بدون حس AI) و بدون نام OTA باشد — بخش ۱۲ در `01-start-province.txt`؛ پاس استانی در `06-province-text-rewrite.txt`.

Media target: Province/County/City/Place = 5 unique images؛ Village/Camping = 3 unique images. هیچ image URL بین Entityها reuse نمی‌شود.
