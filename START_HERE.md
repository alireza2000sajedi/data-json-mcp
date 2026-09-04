# START HERE

اول این فایل را به Agent بده: `prompts/01-start-province.txt`

ورودی اولیه:
```text
province_id=<PROVINCE_ID>
```

Prompt 01 خودش مخزن MCP را پیدا یا Clone می‌کند، `npm install`/`npm run build`/`npm run verify` را اجرا می‌کند، ابزارها و Resourceها را بررسی می‌کند و فقط Province root را پردازش می‌کند.

Scopeهای بعدی با `prompts/02-run-scope.txt`، Resume با `03-resume.txt` و Repair با `04-repair-entity.txt` انجام می‌شوند. آخر کار `05-final-audit-minify.txt` اجرا می‌شود.
