# Prompt Sequence

قرارداد مشترک از `01-start-province.txt`. کیفیت متن/media/تعمیر **همان‌جا** در هر Node تمام می‌شود — پرامپت جدا برای repair / rewrite / media-gap / resume وجود ندارد.

### مسیر اصلی (پیشنهادی) — بدون Scope
1. `01-start-province.txt` — MCP bootstrap + فقط Province root
2. `07-full-province-places.txt` — **کل استان یک‌سره** از input (County/City/Village/Place) — فقط `province_id`
3. `05-final-audit-minify.txt` — Audit نهایی + minify

### اختیاری
- `02-run-scope.txt` — فقط وقتی کاربر صریحاً یک Scope تکی می‌خواهد (`scope_id`)

### کی کدام
| هدف | پرامپت |
|---|---|
| شروع استان | `01` |
| کل استان بدون Scope | `07` |
| یک شهرستان / شهر / روستا (اختیاری) | `02` |
| بستن و minify | `05` |

### قرارداد مشترک (قفل)
- **Entityها:** Province / County / City / Village / Place
- **محل کمپ** = Place (`campground`) — نه Entity جدا
- **فقط از input:** `input/{n}.json` / `planro://scopes`؛ City/Village/Place جدید نساز
- **سلسله‌مراتب:** Village Parent = County یا City؛ روستا Place نیست
- **Media (همان save اول):** Province=۵ · County=۳ · City=۳ · Village=۲ · Place=۴
- **فقط URL:** دانلود/ذخیرهٔ فایل عکس ممنوع؛ فقط `imageUrl` در Entity
- **متن (همان save اول):** انسانی، ضد AI، بدون OTA (§۸ پرامپت ۰۱)
- **خطا:** همان Node را تعمیر کن؛ ناقص رد نشو
- بدون `costs` / `evidence`
- TURBO: موازی تحقیق، save خطی، توقف media در target، track خالی با count 0
- **`07`:** Scope نپرس؛ `02` لازم نیست
