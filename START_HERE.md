# START HERE

مسیر اصلی (بدون Scope):

1. `prompts/01-start-province.txt` — bootstrap + فقط Province root  
2. `prompts/07-full-province-places.txt` — **کل استان یک‌سره** (اداری از input؛ Place با تحقیق وب)  
3. `prompts/05-final-audit-minify.txt` — Audit + minify

```text
province_id=<PROVINCE_ID>
```
مثال: `30` → MCP به `province-30` normalize می‌کند.

`07` فقط `province_id` می‌خواهد — **`scope_id` نده / نپرس.**  
County/City/Village فقط از `input/{n}.json`؛ **Place** = checklist بذر (seed در import) + تحقیق وب اجباری.  
بستن Place زیر checklist یا با `count:0` بدون جستجو توسط MCP رد می‌شود.

اختیاری: یک شهرستان/شهر/روستای تکی → `prompts/02-run-scope.txt` (`scope_id=...`)

Media: Province=۵ · County=۳ · City=۳ · Village=۲ · Place=۴  
فقط URL عکس — دانلود/ذخیرهٔ فایل ممنوع.  
محل کمپ = Place (مثلاً `campground`).

```bash
npm install && npm run build && npm run verify && npm run e2e
```
