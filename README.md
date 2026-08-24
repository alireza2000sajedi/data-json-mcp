# Planro MCP Server

یک **MCP Server واقعی** (Model Context Protocol) برای پروژهٔ Planro که به Agentهای تحقیق کمک می‌کند دادهٔ گردشگری را به‌صورت **سلسله‌مراتبی، قابل‌ردیابی و بدون آلودگی Parent/Child** تولید کنند.

این MCP جای Prompt تحقیق یا Runner را نمی‌گیرد؛ فقط **Tool** و **Resource** ساخت‌یافته ارائه می‌دهد:

```
Agent / LLM
   → Planro MCP Server (stdio)
   → planro-deliverables (schema/README) + output dataset
```

- ✅ TypeScript + Node.js (بدون هیچ فایل Python)
- ✅ فقط transport استاندارد **stdio**
- ✅ بدون HTTP / UI / Docker / database / crawler / scraper / browser automation
- ✅ فقط Toolهای domain-specific — بدون `run_shell` یا دسترسی آزاد filesystem
- ✅ اعتبارسنجی JSON Schema Draft 2020-12 با Ajv + دروازهٔ کیفیت (Quality Gate)
- ✅ تست با `node:test`

---

## ساختار پروژه

```
data-json-mcp/
├── package.json
├── tsconfig.json
├── dataset/                  ← Source of Truth (اسکیماها و README، read-only)
│   ├── README.md
│   ├── PLANRO_AGENT_PROMPT.txt
│   ├── place.schema.json
│   ├── iran-cpi.schema.json
│   └── brand_voice_example.md
├── src/
│   ├── index.ts              ← نقطهٔ ورود stdio
│   ├── server.ts             ← ثبت Toolها و Resourceها
│   ├── config.ts             ← مسیرها + مسدودسازی path traversal
│   ├── types.ts
│   ├── schemas.ts            ← بارگذاری/کامپایل Ajv + enumهای schema
│   ├── notes.ts              ← notes.md ساخت‌یافته (اتمیک)
│   ├── graph.ts              ← مدل Node، پیمایش عمقی، scope state
│   ├── dataset.ts            ← فایلهای Entity، مسیر canonical، ID/slug
│   ├── quality-gate.ts       ← دروازهٔ کیفیت پیش از ذخیره
│   ├── resources.ts          ← ۱۱ Resource
│   └── tools.ts              ← ۱۷ Tool
└── tests/                    ← تستهای node:test
```

مسیرها از طریق متغیر محیطی قابل تغییرند (پیش‌فرض: داخل خود پروژه):

| متغیر | پیش‌فرض | نقش |
|---|---|---|
| `PLANRO_DATASET_DIR` | `./dataset` | محل اسکیماها و README (فقط خواندنی) |
| `PLANRO_OUTPUT_DIR` | `./output` | محل `output/{provinceId}/` (خواندنی/نوشتنی) |

---

## اجرا

```bash
npm install
npm run build          # tsc → dist/
npm start              # اجرای stdio server (node dist/index.js)
```

Server روی stdin/stdout صحبت می‌کند و از همان ابتدا برای اتصال به هر MCP client آماده است:

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"planro-agent","version":"1"}}}
```

## تست

```bash
npm test               # build + node --test tests/
```

۳۵ تست، شامل همهٔ موارد اجباری (رد URL Markdown در `validateEntity`، نرمال‌سازی خودکار URL هنگام ذخیره، رد evidence خارج از sources، رد id/slug تکراری، رد Relation ناموجود، رد nearby به‌عنوان parent، رد Media/Thumbnail تکراری، رد ۹/۲۱ تصویر، رد تصویر استان برای شهرستان، رد min>max، رد CPI نامعتبر، رد Village بدون ruralDistrict، رد City بدون county، ساخت Candidate بدون JSON، ذخیرهٔ Active معتبر در مسیر canonical، پیمایش عمقی Node ناتمام، batch save، صف کار، و ساختار پوشهٔ سلسله‌مراتبی).

---

## فهرست Toolها

| Tool | ورودی کلیدی | خروجی |
|---|---|---|
| `get_scope_state` | `provinceId` | وضعیت کامل Scope، Candidateها، Conflictها، DoD، Node بعدی |
| `get_next_research_node` | `provinceId` | اولین Node ناتمام در پیمایش عمقی + Context اداری + taskهای اجباری |
| `get_node_context` | `provinceId`, `nodeId` | nodeType، canonicalName، parent، administrativePath، نامهای جایگزین، Relations، discovery tracks |
| `find_existing_entity` | `provinceId`, `name`, … | match قطعی/احتمالی + دلیل + مسیر canonical (ضد تکراری) |
| `reserve_entity_id` | `provinceId`, `entityKind`, `preferredSlug` | id یکتا، slug یکتا، مسیر پیشنهادی |
| `record_search_result` | `provinceId`, `nodeId`, `query`, `sourceUrl`, `sourceTitle`, `resultSummary`, `ownershipStatus` | ثبت Source Matrix با مالکیت Context |
| `create_candidate` | `provinceId`, `nodeId`, `name`, … | فقط در notes.md (هیچ JSON ساخته نمی‌شود) |
| `resolve_candidate` | `provinceId`, `candidateId`, `outcome` | بستن Candidate |
| `save_active_entity` | `provinceId`, `entity`, `expectedNodeId` | دروازهٔ کیفیت کامل → ذخیره در مسیر canonical یا خطای ساخت‌یافته |
| `save_entities` | `provinceId`, `entities[]` | ذخیرهٔ دسته‌جمعی چند Entity در یک فراخوانی (یک round-trip به‌جای N) — والدها را قبل از فرزندان بگذارید |
| `link_entities` | `provinceId`, `fromId`, `toId`, `relationType`, … | Relation معتبر + به‌روزرسانی هر دو فایل |
| `update_notes` | `provinceId`, `operation`, `payload` | به‌روزرسانی ساخت‌یافته و قابل‌ردیابی notes |
| `check_definition_of_done` | `provinceId` | complete + موارد ناقص + nextAction |
| `discover_node` | `provinceId`, `nodeType`, `canonicalName`, `context?` | لیست Queryهای ساخت‌یافتهٔ همان Node (تولیدکنندهٔ Query، بدون اتصال به اینترنت) |
| `discover_subtree` | `provinceId`, `nodeId?` | همهٔ Queryهای یک زیردرخت (یا کل استان) در یک فراخوانی، برای جستجوی موازی |
| `validate_province` | `provinceId` | بازبینی همهٔ Entityهای ذخیره‌شده و گزارش خطاهای ساخت‌یافته (evidence ناقص، ناسازگاری مالکیت و…) |
| `list_pending_nodes` | `provinceId` | صف کامل کار: همهٔ Nodeهای ناتمام به ترتیب عمقی (برای batch و ادامهٔ برنامه‌ریزی) |

### `ownershipStatus` (در `record_search_result`)

`belongs_to_node` · `belongs_to_parent` · `belongs_to_child` · `nearby_only` · `unverified` · `rejected`

### `update_notes` operationها

`add_research_coverage` · `add_conflict` · `resolve_conflict` · `add_discovery_task` · `complete_discovery_task` · `mark_node_complete` · `add_source_matrix_entry` · `update_registry` · `register_node`

(هیچ operationای اجازهٔ بازنویسی آزاد کل notes.md را نمی‌دهد.)

---

## فهرست Resourceها (read-only)

| URI | محتوا |
|---|---|
| `planro://rules/readme` | متن README (Source of Truth) |
| `planro://rules/brand-voice` | مثالهای قبل/بعدِ لحن برند (brand_voice_example.md) |
| `planro://rules/brand-voice-guide` | راهنمای کامل لحن برند: تنظیم لحن، لیست سیاه، قواعد جمله، نشانه‌های متن AI‌گون (brand_voice.md) |
| `planro://schema/place` | `place.schema.json` |
| `planro://schema/iran-cpi` | `iran-cpi.schema.json` |
| `planro://province/{provinceId}/notes` | notes.md |
| `planro://province/{provinceId}/registry` | ID Registry |
| `planro://province/{provinceId}/tree` | درخت Nodeها |
| `planro://province/{provinceId}/scope-state` | `provinceId`, `discoveredNodes`, `activeEntities`, `openCandidates`, `openConflicts`, `nextRequiredNode`, `definitionOfDone`, `blockingReasons` |
| `planro://province/{provinceId}/next-node` | اولین Node ناتمام در پیمایش عمقی |
| `planro://entity/{entityId}` | سند Entity |

---

## تصمیم‌های مهم معماری

1. **Active-only**: هیچ JSON ناقصی ذخیره نمی‌شود. `save_active_entity` ابتدا کل Quality Gate را اجرا می‌کند و فقط در صورت موفقیت کامل، فایل را (اتمیک) می‌نویسد. status ذخیره‌شده همیشه `active` است (حتی `archived` که Schema اجازه می‌دهد، رد می‌شود).

2. **Candidate فقط در notes.md**: `create_candidate` هیچ فایلی نمی‌سازد؛ خروجی آن صراحتاً `jsonCreated: false` است.

3. **notes.md ساخت‌یافته و اتمیک**: notes.md شامل بلوک `<!-- planro:state -->` (JSON) + جدولهای قابل‌خواندن (ID Registry، Research coverage، …) است. همهٔ نوشتنها با temp+rename اتمیک انجام می‌شوند و هیچ Toolای «بازنویسی آزاد» ندارد.

4. **پیمایش عمقی (DFS)**: ترتیب `province → county → district → ruralDistrict → city → village → place → camping` ثابت است؛ `next-node` اولین Node ناتمام را برمی‌گرداند، نه یک Node تصادفی. «کامل» بودن یک Node = ذخیرهٔ Entity فعال (برای نوعهای entity) + تکمیل همهٔ `requiredDiscovery` + نبود Candidate/Conflict باز.

5. **مالکیت Source (Source Ownership)**: هر Search Result با `ownershipStatus` در Source Matrix ثبت می‌شود. در ذخیره، `evidence.sourceUrl` باید دقیقاً یکی از `sources[].url` باشد و Source باید برای همان Node (یا به‌صورت `belongs_to_child` برای والد) ثبت شده باشد. Source ثبت‌شده برای استان نمی‌تواند Fact اختصاصی شهرستان را پشتیبانی کند.

6. **مسیر Canonical از Graph گرفته می‌شود** (نه از رشتهٔ نام): ساختار پوشه دقیقاً آینهٔ سلسله‌مراتب اداری واقعی است و پوشهٔ type-prefix (مثل `counties/`) ندارد. هر Entity اداری پوشه‌ای به نام id خودش دارد و زیر پوشهٔ والدهایش قرار می‌گیرد؛ Place/Camp فایل برگ‌مانند داخل پوشهٔ والدش است. روستا و مکان می‌توانند در هر سطحی (استان/شهرستان/شهر/روستا) باشند:

   ```
   output/{provinceId}/
   ├── province.json
   ├── county-30-1/county.json
   ├── county-30-1/city-30-1/city.json
   ├── county-30-1/city-30-1/village-30-v1/village.json
   ├── county-30-1/city-30-1/village-30-v1/place-30-3.json
   ├── county-30-1/place-30-1.json          ← مکان مستقیم زیر شهرستان
   └── place-30-4.json                       ← مکان مستقیم زیر استان
   ```

7. **ID/slug یکتا**: الگوی README (`province-{n}`, `county-{province}-{n}`, `city-…`, `village-…-v{n}`, `place-…`) رعایت می‌شود و قبل از تخصیص، Registry و همهٔ فایلهای JSON اسکن می‌شوند.

8. **Path traversal مسدود است**: همهٔ مسیرها با `safeJoin` زیر `outputDir` (یا `datasetDir` خواندنی) قفل می‌شوند؛ ابزارها فقط `../` و کاراکترهای خطرناک را رد می‌کنند.

9. **خطاهای ساخت‌یافته**: خروجی رد، `{ accepted:false, errors:[{code,path,message}], warnings:[] }` است. کدها مانند `SOURCE_OWNERSHIP_MISMATCH`، `URL_NOT_RAW_HTTPS`، `EVIDENCE_SOURCE_NOT_IN_SOURCES`، `MEDIA_OWNERSHIP_MISMATCH`، `COST_MIN_GT_MAX` و … هستند.

10. **بدون Loop خودکار**: MCP فقط Tool/Resource می‌دهد؛ حلقهٔ «ادامه تا پایان Scope» وظیفهٔ Runner بیرونی است (همان‌طور که در پرامپت مشخص شده).

11. **Query-Generator، نه Search**: `discover_node` فقط رشته‌های Queryِ node-scoped را (مطابق قالب‌های `PLANRO_AGENT_PROMPT.txt`) تولید می‌کند و به اینترنت وصل نمی‌شود. اجرای جستجو و ثبت نتیجه با `record_search_result` بر عهدهٔ Agent است. این هم ممنوعیت crawl/scrape را حفظ می‌کند و هم مانع آلودگی Parent→Child می‌شود (Query شهرستان همیشه نام کامل شهرستان را دارد، نه نام استان).

12. **ذخیره فقط از مسیر MCP**: تنها راه مجاز برای نوشتن JSON، `save_active_entity` / `save_entities` است. هر نوشتن مستقیم فایل (bash/heredoc) دروازهٔ کیفیت را دور می‌زند.

13. **سرعت (Batch)**: برای جمع‌آوری حجم بالا، `save_entities` چند Entity را در یک فراخوانی ذخیره می‌کند و `discover_subtree` همهٔ Queryهای یک زیردرخت را یک‌جا می‌دهد تا Agent بتواند جستجوها را موازی اجرا کند. ترتیب در `save_entities` مهم است: والدها قبل از فرزندان.

14. **URLها خودکار نرمال می‌شوند**: چون لایهٔ چتِ Agent گاهی URL را به شکل Markdown (`[url](url)`) رندر می‌کند، `save_active_entity` و `save_entities` پیش از اعتبارسنجی، همهٔ فیلدهای URL را به لینک خام `https://…` تبدیل می‌کنند و همان نسخهٔ تمیز را ذخیره می‌کنند. لازم نیست Agent نگران این خطای رندر باشد.

---

## محدودیت‌های شناخته‌شده

- **Provenance وابسته به ثبت پژوهشگر است، نه صرف URL**: بررسی «تصویر استان برای شهرستان»، «منبع واقعی بودن»، «لینک مجوز همان فایل» و «واقعی بودن priceAsOf» به provenance ثبت‌شده توسط Agent (`record_search_result` و Source Matrix) وابسته است. MCP فقط ناسازگاری‌های ثبت‌شده را رد می‌کند؛ نمی‌تواند محتوای وب را scrape یا راستی‌آزمایی کند.
- **لحن برند (Brand Voice)** با سه دسته هیوریستیک کنترل می‌شود: `BRAND_VOICE_SUPERLATIVE` (صفات تبلیغاتی مانند بهترین/زیباترین/جادویی)، `BRAND_VOICE_TECH_NOISE` (هوش مصنوعی/سیستم هوشمند/فناوری…)، `BRAND_VOICE_CLICHE` (کلیشهٔ رباتی مانند «تجربه‌ای … فراهم می‌کند»). **تصمیم نهایی**: این موارد **خطای blocking** هستند، مگر اینکه برای همان فیلد، `evidence` اختصاصی ثبت شده باشد — در این صورت به Warning تنزل می‌یابند (چون README می‌گوید ادعاهایی مثل «قدیمی‌ترین» فقط «با Evidence اختصاصی» مجازند). مرجع کامل مثالها در `planro://rules/brand-voice` و راهنمای کامل لحن (تنظیم لحن، لیست سیاه، نشانه‌های متن AI‌گون) در `planro://rules/brand-voice-guide` است.
- **تطبیق نام→id اداری** در مسیر canonical به ثبت صحیح سلسله‌مراتب Nodeها (via `register_node` / `add_discovery_task` با `parentNodeId`) وابسته است.
- این پروژه **پیش‌نمونه** است؛ `reserve_entity_id`، slug و الگوی ID مطابق README پیاده شده اما transliteration فارسی→لاتین فعلاً حداقلی است (به `preferredSlug` ارائه‌شده توسط Agent متکی است).

---

## توسعه

```bash
npm run dev            # اجرا با tsx بدون build
npm run build          # build
npm test               # build + test
```
