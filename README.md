# Planro MCP Server

یک **MCP Server واقعی** (Model Context Protocol) برای پروژهٔ Planro که به Agentهای تحقیق کمک می‌کند دادهٔ گردشگری را به‌صورت **سلسله‌مراتبی، قابل‌ردیابی و بدون آلودگی Parent/Child** تولید کنند.

این MCP جای Prompt تحقیق یا Runner را نمی‌گیرد؛ فقط **Tool** و **Resource** ساخت‌یافته ارائه می‌دهد:

```
Agent / LLM
   → Planro MCP Server (stdio)
   → dataset/ (schema + قانون‌نامه، read-only) + output/ (خروجی Entityها)
```

- ✅ TypeScript + Node.js (بدون هیچ فایل Python)
- ✅ فقط transport استاندارد **stdio**
- ✅ بدون HTTP / UI / Docker / database / crawler / scraper / browser automation
- ✅ فقط Toolهای domain-specific — بدون `run_shell` یا دسترسی آزاد filesystem
- ✅ اعتبارسنجی JSON Schema Draft 2020-12 با Ajv + دروازهٔ کیفیت (Quality Gate)
- ✅ پروف اجرا: `npm run verify` (قرارداد پروژه) + `npm run e2e` (۴۵ assertion روی سرویس واقعی)

کار به‌صورت **پلکانی و مرحله‌ای** اجرا می‌شود: هر اجرا فقط یک Scope دارد و پس از آن Agent متوقف می‌شود
(اول فقط خودِ استان → سپس یک شهرستان/شهر/روستا/POI به انتخاب کاربر). هر Scope یک **id اختصاصی و
پایدار** دارد (`province-30`، `county-30-5`، `city-30-12`، `village-30-v2`، `place-30-3`) و پیشرفت بین
اجراها در `notes.state.json` ذخیره و Resume می‌شود.

قرارداد کامل اجرا در **`prompts/01-start-province.txt`** است؛ چهار Prompt دیگر فقط مرحله‌های بعدی را اجرا می‌کنند.
گزارش تصمیم‌ها، قواعد و وضعیت اجرا: [`docs/PROJECT_REPORT.md`](docs/PROJECT_REPORT.md).

---

## ساختار پروژه

```
data-json-mcp/
├── package.json
├── tsconfig.json
├── START_HERE.md             ← نقطهٔ شروع کاربر
├── mcp-client.mjs            ← کلاینت CLI برای فراخوانی Toolها از شل
├── prompts/                  ← دنبالهٔ ۵ پرامپت مرحله‌ای (قرارداد مادر: 01)
│   ├── 01-start-province.txt · 02-run-scope.txt · 03-resume.txt
│   └── 04-repair-entity.txt · 05-final-audit-minify.txt
├── docs/PROJECT_REPORT.md    ← گزارش جامع پروژه، تصمیم‌ها و وضعیت اجرا
├── dataset/                  ← Source of Truth (اسکیماها و قانون‌نامه، read-only)
│   ├── README.md             ← قانون‌نامهٔ کامل محتوا و مالکیت داده
│   ├── place.schema.json     ← اسکیمای Entity (Draft 2020-12)
│   ├── entity-field-policy.json ← ماتریس Required/Recommended/Optional/Forbidden هر نوع Entity
│   ├── source_policy.json    ← ۵ منبع Primary اجباری + fallbackها + منابع تصویر + Coverage
│   ├── brand_voice.md        ← هویت کلامی و لحن برند
├── taxonomy/                 ← Global Taxonomy (تنها مرجع مقادیر مجاز)
│   ├── types · subtypes · categories · activities · features · facilities · risks
│   └── agent-taxonomy/       ← کاتالوگ‌های موازی staging (همان شکل taxonomy؛ تا promote وارد Entity نمی‌شوند)
├── input/                    ← ساختار اداری کامل ۳۱ استان (1.json … 31.json)
├── scripts/
│   ├── verify-project.mjs    ← بررسی قرارداد پروژه (workspace / package)
│   └── e2e-province-smoke.mjs← اجرای واقعی مرحلهٔ استان روی یک output موقت
└── src/
    ├── index.ts              ← نقطهٔ ورود stdio
    ├── server.ts             ← ثبت Toolها و Resourceها (+ نرمال‌سازی provinceId)
    ├── config.ts             ← مسیرها + مسدودسازی path traversal + `30 → province-30`
    ├── types.ts
    ├── schemas.ts            ← بارگذاری/کامپایل Ajv + enumهای schema
    ├── media.ts              ← سیاست رسانه: هدف ۵ (روستا/کمپینگ ۳)، سقف ۲۰، وضعیت سه‌حالته
    ├── source-policy.ts      ← سیاست منابع: primary/fallback/other + قرارداد Coverage
    ├── notes.ts              ← notes.state.json + notes.md (نوشتن اتمیک)
    ├── graph.ts              ← مدل Node، پیمایش عمقی، Scope مؤثر و Scope state
    ├── scopes.ts             ← رجیستری قطعی IDها از input/
    ├── dataset.ts            ← فایلهای Entity، مسیر canonical، ID/slug
    ├── quality-gate.ts       ← دروازهٔ کیفیت پیش از ذخیره
    ├── discovery.ts          ← تولید Queryهای node-scoped
    ├── resources.ts          ← Resourceها
    └── tools.ts              ← Toolها
```

### دیتای ورودی `input/`

پوشهٔ `input/` شامل ۳۱ فایل JSON (`1.json` تا `31.json`) است که هر کدام ساختار اداری کامل یک استان را دارد: `id`، `name` و `counties[]` (هر شهرستان با `name`، `cities[]` و `villages[]`). برای `province-{n}` فایل `input/{n}.json` معادل است. این فایل‌ها **چک‌لیست مرجع کشف اداری** و **مبنای `count`** در قرارداد تکمیل (`complete_discovery_task`) هستند، اما منبع Evidence، مختصات یا قیمت نیستند — این‌ها فقط از Sourceهای وب ثبت‌شده می‌آیند.

مسیرها از طریق متغیر محیطی قابل تغییرند (پیش‌فرض: داخل خود پروژه):

| متغیر | پیش‌فرض | نقش |
|---|---|---|
| `PLANRO_DATASET_DIR` | `./dataset` | محل اسکیماها و README (فقط خواندنی) |
| `PLANRO_OUTPUT_DIR` | `./output` | محل `output/{provinceId}/` (خواندنی/نوشتنی) |
| `PLANRO_INPUT_DIR` | `./input` | محل چک‌لیست‌های اداری `1.json … 31.json` (فقط خواندنی) |

---

## اجرا

```bash
npm install
npm run build          # tsc → dist/
npm run verify         # بررسی قرارداد پروژه
npm start              # اجرای stdio server (node dist/index.js)
```

Server روی stdin/stdout صحبت می‌کند و از همان ابتدا برای اتصال به هر MCP client آماده است:

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"planro-agent","version":"1"}}}
```

بررسی سریع اتصال:

```bash
node mcp-client.mjs list-tools
node mcp-client.mjs list-resources
```

## تست و اعتبارسنجی

```bash
npm run verify          # قرارداد پروژه در حالت workspace (node_modules/dist مجاز)
npm run verify:package  # حالت تحویل/ZIP: node_modules، dist و output نباید وجود داشته باشند
npm run e2e             # build + اجرای واقعی مرحلهٔ استان (۴۵ assertion)
npm test                # verify + e2e
```

`scripts/verify-project.mjs` صرفاً وجود فایل‌ها را چک نمی‌کند؛ **خودِ قرارداد** را بررسی می‌کند:
ساختار هر ۳۱ فایل ورودی، یکتایی و canonical بودن idهای Taxonomy، هم‌خوانی enumهای `place.schema.json`
با Taxonomy، نبود فیلدهای حذف‌شده (`tags`، `emergencyNumbers`، `distanceKm`)، یکسان بودن هدف رسانه بین
`entity-field-policy.json` و `src/media.ts` (۵/۵/۵/۵ و ۳/۳)، وجود هر ۵ منبع Primary با `enforcement: all`،
عمومی ماندن پرامپت‌ها (بدون id واقعی) و حذف کامل `resolve_scope_name` از `src/`.

`scripts/e2e-province-smoke.mjs` سرویس ساخته‌شده را روی یک پوشهٔ خروجی موقت اجرا می‌کند و کل مرحلهٔ استان را
می‌سنجد: نرمال‌سازی `30 → province-30`، ثبت ۹ شهرستان / ۳۱ شهر / ۹۶۲ روستای همدان، Coverage پنج منبع،
پایپ‌لاین رسانه تا هدف ۵، همهٔ گیت‌های منفی (مالکیت Visit/FAQ/Checklist، Taxonomy، Evidence، Brand Voice،
تکرار سراسری تصویر)، ذخیرهٔ Entity در مسیر canonical، قرارداد `count`، ترتیب DFS، `awaitingScopeSelection`،
`check_definition_of_done` و `validate_province`، و در پایان قفل‌شدن Scope بعدی و Resume از روی state.

---

## فهرست Toolها

| Tool | ورودی کلیدی | خروجی |
|---|---|---|
| `import_province_scopes` | `provinceId` | **مرحلهٔ استان**: ثبت ساختار کامل استان از `input/{n}.json` با idهای قطعی (`county-{p}-{n}`، `city-{p}-{n}`، `village-{p}-v{n}`) + ترک‌های اداری بر مبنای Count؛ idempotent |
| `set_active_scope` | `provinceId`, `nodeId` (یا `null`) | **Scope بعدی**: قفل DFS/next-node/completion روی زیردرخت همان Scope؛ بقیهٔ واحدها pending می‌مانند |
| `get_scope_state` | `provinceId` | وضعیت کامل Scope (`activeScopeId`, `scopeMode`, `scopeLabel`)، Candidateها، Conflictها، DoD، Node بعدی |
| `get_next_research_node` | `provinceId` | اولین Node ناتمام در پیمایش عمقی + Context اداری + taskهای اجباری؛ پس از پایان مرحلهٔ استان و بدون Scope فعال: `awaitingScopeSelection: true` |
| `get_node_context` | `provinceId`, `nodeId` | nodeType، canonicalName، parent، administrativePath، نامهای جایگزین، Relations، discovery tracks |
| `find_existing_entity` | `provinceId`, `name`, … | match قطعی/احتمالی + دلیل + مسیر canonical (ضد تکراری) |
| `reserve_entity_id` | `provinceId`, `entityKind`, `preferredSlug` | id و slug یکتا + رزرو واقعی در Registry |
| `record_search_result` | `provinceId`, `nodeId`, `query`, `sourceUrl`, `sourceTitle`, `resultSummary`, `ownershipStatus` | ثبت Source Matrix با مالکیت Context + دسته‌بندی خودکار منبع (primary/fallback/other) + شمارش Coverage |
| `create_candidate` | `provinceId`, `nodeId`, `name`, … | فقط در notes (هیچ JSON ساخته نمی‌شود) |
| `resolve_candidate` | `provinceId`, `candidateId`, `outcome` | بستن Candidate |
| `record_media_candidate` | `provinceId`, `nodeId`, `imageUrl`, `pageUrl`, `license`, … | ثبت idempotent هر تصویر کاندید + رد تکرار سراسری URL بین Entityها |
| `finalize_media` | `provinceId`, `nodeId` | dedupe + رتبه‌بندی → انتخاب دقیقاً `min(usable, target)` تصویر (تامبنیل جزو بودجه) + `mediaStatus` |
| `get_source_coverage` | `provinceId`, `nodeId` | شمارش منابع Primary جستجو‌شدهٔ نود (۵ از ۵) + ردیف هر منبع (کشف تصویر در این شمارش لحاظ نمی‌شود) |
| `mark_node_media_deficit` | `provinceId`, `nodeId`, `reason`, `imagesFound`, `searchesPerformed[]` | فقط برای «نبودِ کل دادهٔ Entity»: بستن نود بدون فایل JSON؛ اگر کاندید رسانهٔ usable وجود داشته باشد رد می‌شود |
| `save_active_entity` | `provinceId`, `entity`, `expectedNodeId` | دروازهٔ کیفیت کامل → ذخیره در مسیر canonical یا خطای ساخت‌یافته |
| `save_entities` | `provinceId`, `entities[]` | ذخیرهٔ دسته‌جمعی (والدها قبل از فرزندان) |
| `link_entities` | `provinceId`, `fromId`, `toId`, `relationType`, … | Relation معتبر + به‌روزرسانی هر دو فایل |
| `update_notes` | `provinceId`, `operation`, `payload` | به‌روزرسانی ساخت‌یافتهٔ notes — `complete_discovery_task` نیازمند `count` عددی است |
| `check_definition_of_done` | `provinceId` | complete + موارد ناقص + nextAction + Coverage — **Scope-محور** (`scopeMode`، `scopeLabel`، `scopeNodes`) |
| `discover_node` | `provinceId`, `nodeType`, `canonicalName`, `context?` | Queryهای ساخت‌یافتهٔ همان Node (بدون اتصال به اینترنت) |
| `discover_subtree` | `provinceId`, `nodeId?` | همهٔ Queryهای یک زیردرخت برای جستجوی موازی |
| `validate_province` | `provinceId` | بازبینی همهٔ Entityهای ذخیره‌شده و گزارش خطاهای ساخت‌یافته |
| `list_pending_nodes` | `provinceId` | صف کامل کار: همهٔ Nodeهای ناتمام به ترتیب عمقی |

> `resolve_scope_name` حذف شده است. تبدیل نام فارسی به id از Resource `planro://scopes/{provinceId}`
> (کلید `indexByName`) انجام می‌شود و انتخاب Scope فقط با `set_active_scope` قفل می‌شود.
> `mark_node_complete` هم Tool مستقل ندارد و فقط operationای از `update_notes` است.

### `ownershipStatus` (در `record_search_result`)

`belongs_to_node` · `belongs_to_parent` · `belongs_to_child` · `nearby_only` · `unverified` · `rejected`

### `update_notes` operationها

`add_research_coverage` · `add_conflict` · `resolve_conflict` · `add_discovery_task` · `complete_discovery_task` · `mark_node_complete` · `update_registry` · `register_node`

(ثبت Source Matrix **فقط** از طریق `record_search_result` انجام می‌شود و هیچ operationای اجازهٔ بازنویسی آزاد کل notes را ندارد.)

---

## فهرست Resourceها (read-only)

| URI | محتوا |
|---|---|
| `planro://scopes` | ایندکس ۳۱ استان با `provinceId` و `countyId`ها |
| `planro://scopes/{provinceId}` | رجیستری Scopeهای یک استان: `tree`، `index` (id → واحد)، `indexByName` (نام → idها) |
| `planro://rules/readme` | قانون‌نامهٔ `dataset/README.md` |
| `planro://rules/entity-fields` | ماتریس قطعی فیلدهای هر نوع Entity (`entity-field-policy.json`) |
| `planro://rules/brand-voice-guide` | هویت کلامی و لحن برند |
| `planro://rules/source-policy` | ۵ منبع Primary اجباری + fallback + منابع مجاز تصویر + قرارداد Coverage |
| `planro://taxonomy` | Global Taxonomy catalogs |
| `planro://taxonomy/agent` | Agent Taxonomy staging catalogs (`taxonomy/agent-taxonomy/`) |
| `planro://schema/place` | `place.schema.json` |
| `planro://province/{provinceId}/notes` | notes.md |
| `planro://province/{provinceId}/registry` | ID Registry |
| `planro://province/{provinceId}/tree` | درخت Nodeها |
| `planro://province/{provinceId}/scope-state` | وضعیت Scope + DoD + Node بعدی |
| `planro://province/{provinceId}/next-node` | اولین Node ناتمام در پیمایش عمقی |
| `planro://entity/{entityId}` | سند Entity |

---

## تصمیم‌های مهم معماری

1. **Active-only + سیاست رسانه**: هیچ JSON ناقصی ذخیره نمی‌شود؛ `save_active_entity` ابتدا کل Quality Gate را اجرا می‌کند و فقط در صورت موفقیت، فایل را اتمیک می‌نویسد. هدف رسانه **۵ عکس** برای استان/شهرستان/شهر/مکان و **۳ عکس** برای روستا/کمپینگ است (تامبنیل جزو همین بودجه؛ ۲۰ فقط سقف مطلق). ذخیرهٔ ۰-عکس پیش از Coverage کامل منابع Primary با `MEDIA_ZERO_WITHOUT_PRIMARY_COVERAGE` رد می‌شود، اما رسیدن به هدف شرط **Definition of Done** است. یک image URL نباید بین دو Entity تکرار شود (`MEDIA_GLOBAL_DUPLICATE`).
2. **Candidate فقط در notes**: `create_candidate` هیچ فایلی نمی‌سازد (`jsonCreated: false`). نودی که اصلاً دادهٔ Entity ندارد با `mark_node_media_deficit` بسته می‌شود تا DFS متوقف نشود.
3. **notes ساخت‌یافته و اتمیک**: `notes.state.json` (منبع state) + `notes.md` (خوانا). همهٔ نوشتنها temp+rename هستند.
4. **پیمایش عمقی (DFS) + قرارداد Count**: ترتیب والد-آگاه است (`province → مکان‌های سطح استان → county → …`). هر discovery track قابل‌شمارش هنگام تکمیل باید `count` واقعی را اعلام کند و DoD همان تعداد Node ثبت‌شده را می‌سنجد.
5. **مالکیت Source**: هر Search Result فقط با `record_search_result` ثبت می‌شود؛ در ذخیره هر `sources[].url` باید برای همان Node در Source Matrix ثبت شده باشد. فیلد `evidence` از قرارداد حذف شده است. **کشف تصویر هرگز جای Fact Source Coverage را نمی‌گیرد.**
6. **مالکیت داده بین والد و فرزند**: Visit/FAQ/Checklist/Media هر Entity متعلق به خودش است. والد می‌تواند فرزند را در متن **نام ببرد**، اما دادهٔ عملیاتی فرزند (ساعت کار، بلیت، رزرو، مسیر) روی والد رد می‌شود (`FAQ_CHILD_SCOPE`). تطبیق نام، هم‌نامیِ استان/شهرستان/شهر (مثل «همدان») را به‌درستی استثنا می‌کند. فیلد `costs` از قرارداد حذف شده است.
7. **مسیر Canonical از Graph** گرفته می‌شود، نه از رشتهٔ نام:

   ```
   output/{provinceId}/
   ├── province.json
   ├── county-30-1/county.json
   ├── county-30-1/city-30-1/city.json
   ├── county-30-1/city-30-1/village-30-v1/village.json
   ├── county-30-1/place-30-1.json          ← مکان مستقیم زیر شهرستان
   └── place-30-4.json                       ← مکان مستقیم زیر استان
   ```

8. **ID/slug یکتا** و **Path traversal مسدود** (`safeJoin` زیر `outputDir`).
9. **خطاهای ساخت‌یافته**: `{ accepted:false, errors:[{code,path,message}], warnings:[] }` با کدهایی مانند `SOURCE_OWNERSHIP_MISMATCH`، `URL_NOT_RAW_HTTPS`، `SOURCE_NOT_REGISTERED`، `VISIT_FIELD_NOT_ALLOWED`، `TAXONOMY_UNKNOWN`.
10. **Query-Generator، نه Search**: `discover_node` فقط رشتهٔ Query تولید می‌کند؛ اجرای جستجو با Agent است.
11. **ذخیره فقط از مسیر MCP**: نوشتن مستقیم فایل، Quality Gate را دور می‌زند و ممنوع است.
12. **URLها خودکار نرمال می‌شوند**: اگر لایهٔ چت URL را به شکل `[url](url)` رندر کند، هنگام ذخیره به لینک خام تبدیل می‌شود (در `record_search_result` اما URL باید از ابتدا خام باشد).
13. **Taxonomy سراسری + Agent Taxonomy**: Entity تولیدی فقط idهای Global Taxonomy را می‌گیرد. اگر مفهومی نبود، Agent مثل taxonomyنویس رفتار می‌کند: تحقیق می‌کند، داده می‌گیرد، و آیتم کامل را در کاتالوگ متناظر `taxonomy/agent-taxonomy/` می‌سازد (`planro://taxonomy/agent`). تا promote انسانی وارد Entity نمی‌شود. در پایان استان باید بگوید چه نبود و چه ساخته.
14. **اجرای پلکانی + Scope مؤثر**: تا وقتی Scope فعالی انتخاب نشده، DoD فقط مرحلهٔ استان را می‌سنجد؛ با `set_active_scope` همان زیردرخت معیار می‌شود و `mark_node_complete` بیرون از Scope با `SCOPE VIOLATION` رد می‌شود.

---

## محدودیت‌های شناخته‌شده

- **Provenance وابسته به ثبت Agent است**: MCP نمی‌تواند وب را scrape یا راستی‌آزمایی کند؛ فقط ناسازگاری‌های ثبت‌شده را رد می‌کند.
- **لحن برند** با سه دستهٔ هیوریستیک کنترل می‌شود (`BRAND_VOICE_SUPERLATIVE`, `BRAND_VOICE_TECH_NOISE`, `BRAND_VOICE_CLICHE`) و در حضور Evidence اختصاصی برای همان فیلد به Warning تنزل می‌یابد.
- **transliteration فارسی→لاتین** حداقلی است و به `preferredSlug` ارائه‌شده توسط Agent متکی است.

---

## توسعه

```bash
npm run dev            # اجرا با tsx بدون build
npm run build          # build
npm test               # verify + e2e
```
