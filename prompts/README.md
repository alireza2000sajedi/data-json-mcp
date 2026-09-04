# Planro Prompt Sequence

## Normal workflow
1. `01-start-province.txt` — **Bootstrap MCP + start one province Scope.** این فایل قرارداد مادر Agent را هم در خود دارد و اولین فایلی است که برای شروع کار اجرا می‌شود.
2. `02-run-scope.txt` — one explicitly selected Scope per run.
3. `03-resume.txt` — continue the same Scope after interruption.
4. `04-repair-entity.txt` — repair one explicitly selected Entity.
5. `05-final-audit-minify.txt` — global audit only after the full dataset is complete.

## MCP bootstrap
`01-start-province.txt` فرض نمی‌کند MCP از قبل نصب/متصل است. Agent باید با Terminal/Shell مخزن رسمی زیر را در workspace پیدا یا Clone کند و سپس `npm install`, `npm run build`, `node mcp-client.mjs list-tools` و `node mcp-client.mjs list-resources` را اجرا کند:

`https://github.com/alireza2000sajedi/data-json-mcp.git`

بعد از آماده‌شدن MCP، ادامهٔ تحقیق و ذخیره فقط با Tool/Resourceهای رسمی MCP انجام می‌شود.

## Input rule
این فایل‌ها عمداً ID واقعی داخل مثال ندارند. Agent فقط باید از مقدار صریحی که کاربر در اجرای فعلی داده استفاده کند. در Prompt 01 فقط `province_id` ورودی کاربر است؛ `scope_id` استان از همان مقدار به‌صورت deterministic ساخته می‌شود.

Agent نباید برای bootstrap، مسیر فایل، نام فایل یا Scope مشتق‌شده از کاربر سؤال کند؛ این موارد از clone و Resourceهای MCP قابل کشف‌اند.
