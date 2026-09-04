# Planro — Start Here

این نسخه برای شروع جمع‌آوری دیتا آماده شده است.

## نصب و بررسی

```bash
npm install
npm run build
npm run verify
```

`npm run verify` بدون وابستگی خارجی، ساختار پروژه، taxonomy، source policy، schema و فایل‌های prompt را کنترل می‌کند.

## اجرای MCP

```bash
npm start
```

برای بررسی اتصال:

```bash
node mcp-client.mjs list-tools
node mcp-client.mjs list-resources
```

## اولین Run

Runner فقط این دو مقدار را بدهد:

```text
province_id=<PROVINCE_ID>
```

پرامپت مورد استفاده:

```text
prompts/01-start-province.txt
```

بعد از اتمام استان، برای هر Scope بعدی فقط id بده:

```text
province_id=<PROVINCE_ID>
scope_id=<SCOPE_ID>
```

برای Scope بعدی، `prompts/02-run-scope.txt` را استفاده کن. Resume و Repair نیز prompt مستقل دارند.

## قانون مهم

Taxonomy در `taxonomy/` سراسری است. Proposalهای Agent در `taxonomy/agent-taxonomy/proposals.json` فقط پیشنهاد هستند و تا promotion دستی، وارد Entity نمی‌شوند.
