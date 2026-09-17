# Prompt Sequence

1. `01-start-province.txt` — Prompt مادر + MCP bootstrap + فقط Province root؛ بعد توقف برای Scope (County/City).
2. `02-run-scope.txt` — اجرای یک Scope (زیردرخت County یا City + Placeها).
3. `03-resume.txt` — ادامه همان Scope با `previous_id`.
4. `04-repair-entity.txt` — تعمیر یک Entity.
5. `07-full-province-places.txt` — جبران همهٔ Placeهای استان (continuous؛ فقط `province_id`).
6. `08-media-gap-audit.txt` — جبران عکس‌های صفر/زیر target.
7. `06-province-text-rewrite.txt` — بازنویسی متن (انسانی، بدون OTA).
8. `05-final-audit-minify.txt` — Audit نهایی + cleanup + minify.

### کی کدام
| هدف | پرامپت |
|---|---|
| شروع استان | `01` |
| یک شهرستان یا شهر | `02` (+ `03` resume) |
| تعمیر یک Entity | `04` |
| همه Placeهای استان | `07` |
| فقط عکس | `08` |
| متن یکدست | `06` سپس `05` |

### قرارداد مشترک
- Entityها: Province / County / City / Place
- محل کمپ = Place (`campground`) — نه Entity جدا
- Media: Province=۵ · County=۳ · City=۳ · Place=۴
- Parent بدون operational dataی Child
- بدون `costs` / `evidence`
- متن از save اول انسانی و بدون نام OTA
- TURBO/SPEED: موازی تحقیق، save خطی، توقف media در target، `districts`/`ruralDistricts` خالی با count 0
