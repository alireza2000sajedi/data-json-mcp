# START HERE

اول این فایل را به Agent بده: `prompts/01-start-province.txt`

ورودی اولیه (فقط همین یک مقدار):
```text
province_id=<PROVINCE_ID>
```
اگر مقدار واقعی (مثلاً `30`) در خودِ درخواست آمده باشد، همان authoritative است؛ عدد را MCP خودش به `province-30` تبدیل می‌کند.

Prompt 01 خودش مخزن MCP را پیدا یا Clone می‌کند، `npm install` / `npm run build` / `npm run verify` را اجرا می‌کند، ابزارها و Resourceها را بررسی می‌کند و **فقط Province root** را پردازش می‌کند. در پایان متوقف می‌شود و Scope بعدی را از کاربر می‌پرسد.

Scopeهای بعدی با `prompts/02-run-scope.txt`، Resume با `03-resume.txt` و Repair با `04-repair-entity.txt` انجام می‌شوند. آخر کار `05-final-audit-minify.txt` اجرا می‌شود.

## بررسی سلامت پروژه (اختیاری، قبل از تحویل به Agent)

```bash
npm install
npm run build
npm run verify     # قرارداد پروژه
npm run e2e        # اجرای واقعی مرحلهٔ استان (۴۵ assertion)
```

گزارش کامل تصمیم‌ها، قواعد و وضعیت اجرا: `docs/PROJECT_REPORT.md`
