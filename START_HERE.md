# START HERE

اول این فایل را به Agent بده: `prompts/01-start-province.txt`

```text
province_id=<PROVINCE_ID>
```
مثال: `30` → MCP به `province-30` normalize می‌کند.

`01` مخزن را آماده می‌کند و **فقط Province root** را کامل می‌کند؛ سپس برای Scope بعدی (County/City) می‌ایستد.

ادامه:
- یک Scope → `prompts/02-run-scope.txt` (`scope_id=...`)
- Resume → `03-resume.txt`
- Repair → `04-repair-entity.txt`
- همه Placeهای استان → `07-full-province-places.txt`
- کمبود عکس → `08-media-gap-audit.txt`
- متن → `06-province-text-rewrite.txt` سپس Audit → `05-final-audit-minify.txt`

Media: Province=۵ · County=۳ · City=۳ · Place=۴  
محل کمپ = Place (مثلاً `campground`).

```bash
npm install && npm run build && npm run verify && npm run e2e
```
