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

کار به‌صورت **پلکانی و مرحله‌ای** اجرا می‌شود: هر اجرا فقط یک Scope دارد و پس از آن Agent متوقف می‌شود
(استان فقط برای Discovery → بعداً یک شهرستان/شهر/روستا/POI از سوی کاربر). هر Scope یک **id اختصاصی و
پایدار** دارد (`province-30`، `county-30-5`، `city-30-12`، `village-30-v2`، `place-30-3`) و پیشرفت بین
اجراها در `notes.state.json` ذخیره و Resume می‌شود. راهنمای کامل قرارداد اجرا: [`STAGED_WORKFLOW.md`](STAGED_WORKFLOW.md).

---

## ساختار پروژه

```
data-json-mcp/
├── package.json
├── tsconfig.json
├── prompt.txt                ← پرامپت واحد Agent تحقیق (تنها پرامپت مجاز)
├── STAGED_WORKFLOW.md        ← قرارداد اجرای پلکانی + شناسه‌های اختصاصی Scope
├── mcp-client.mjs            ← کلاینت CLI برای فراخوانی Toolها از شل
├── dataset/                  ← Source of Truth (اسکیماها و قانون‌نامه، read-only)
│   ├── README.md
│   ├── brand_voice.md        ← هویت کلامی و لحن برند — نسخه ۱.۰ نهایی (+ پیوست نمونهٔ کاربردی)
│   ├── iran-cpi.schema.json
│   └── place.schema.json
├── input/                    ← ساختار اداری کامل ۳۱ استان (1.json … 31.json)
├── src/
│   ├── index.ts              ← نقطهٔ ورود stdio
│   ├── server.ts             ← ثبت Toolها و Resourceها
│   ├── config.ts             ← مسیرها + مسدودسازی path traversal
│   ├── types.ts
│   ├── schemas.ts            ← بارگذاری/کامپایل Ajv + enumهای schema
│   ├── notes.ts              ← notes.md ساخت‌یافته (اتمیک)
│   ├── graph.ts              ← مدل Node، پیمایش عمقی، scope state
│   ├── scopes.ts             ← رجیستری قطعی IDها (استان/شهرستان/شهر/روستا) از input/
│   ├── dataset.ts            ← فایلهای Entity، مسیر canonical، ID/slug
│   ├── quality-gate.ts       ← دروازهٔ کیفیت پیش از ذخیره
│   ├── resources.ts          ← Resourceها
│   └── tools.ts              ← Toolها
└── tests/                    ← تستهای node:test
```

### دیتای ورودی `input/`

پوشهٔ `input/` شامل ۳۱ فایل JSON (`1.json` تا `31.json`) است که هر کدام ساختار اداری کامل یک استان را دارد: `id` (شناسهٔ استان)، `name` (نام استان) و `counties[]` (هر شهرستان با `name`، `cities[]` و `villages[]`). برای `province-{n}` فایل `input/{n}.json` معادل است. این فایل‌ها **چک‌لیست مرجع کشف اداری** و **مبنای `count`** در قرارداد تکمیل (`complete_discovery_task`) هستند، اما منبع Evidence، مختصات یا قیمت نیستند — این‌ها فقط از Sourceهای وب ثبت‌شده می‌آیند. (قواعد کامل در `dataset/README.md` بخش ۱-۱ و در `prompt.txt`.)

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

۵۴ تست، شامل همهٔ موارد اجباری (رد URL Markdown در `validateEntity`، نرمال‌سازی خودکار URL هنگام ذخیره، رد evidence خارج از sources، رد id/slug تکراری، رد Relation ناموجود، رد nearby به‌عنوان parent، رد Media/Thumbnail تکراری، رد ۹/۲۱ تصویر، رد تصویر استان برای شهرستان، رد min>max، رد CPI نامعتبر، رد Village بدون ruralDistrict، رد City بدون county، ساخت Candidate بدون JSON، ذخیرهٔ Active معتبر در مسیر canonical، پیمایش عمقی Node ناتمام، batch save، صف کار، ساختار پوشهٔ سلسله‌مراتبی، مسیر شرعی §9: بسته‌شدن نود کم‌رسانه با `mark_node_media_deficit` بدون فایل JSON، پیشروی خودکار DFS، پاس شدن DoD با گزارش شفاف نودهای کم‌رسانه، گاردهای imagesFound/جستجو/ترتیب DFS، ارتقای خودکار رکورد با ذخیرهٔ فعال بعدی، و **رجیستری Scope**: قطعی‌بودن و یکتایی idها، ایندکس ۳۱ استان، import بدون Deep Research، idempotence، قفل‌شدن DFS به Scope انتخابی و رد `mark_node_complete` خارج از Scope).

---

## فهرست Toolها

| Tool | ورودی کلیدی | خروجی |
|---|---|---|
| `import_province_scopes` | `provinceId` | **Scope A (Discovery)**: ثبت ساختار کامل استان از `input/{n}.json` با idهای اختصاصیِ قطعی (`county-{p}-{n}`، `city-{p}-{n}`، `village-{p}-v{n}`) + تکمیل ترک‌های اداری بر مبنای Count — بدون Deep Research و بدون هیچ Entity فایل |
| `set_active_scope` | `provinceId`, `nodeId` (یا `null`) | **Scope B/C**: قفل DFS/next-node/completion روی زیردرخت همان Scope؛ بقیهٔ واحدها pending می‌مانند |
| `get_scope_state` | `provinceId` | وضعیت کامل Scope (شامل `activeScopeId`)، Candidateها، Conflictها، DoD، Node بعدی |
| `get_next_research_node` | `provinceId` | اولین Node ناتمام در پیمایش عمقی + Context اداری + taskهای اجباری |
| `get_node_context` | `provinceId`, `nodeId` | nodeType، canonicalName، parent، administrativePath، نامهای جایگزین، Relations، discovery tracks |
| `find_existing_entity` | `provinceId`, `name`, … | match قطعی/احتمالی + دلیل + مسیر canonical (ضد تکراری) |
| `reserve_entity_id` | `provinceId`, `entityKind`, `preferredSlug` | id یکتا + slug یکتا + **رزرو واقعی** (ثبت pending در Registry که در ذخیره، active می‌شود) |
| `record_search_result` | `provinceId`, `nodeId`, `query`, `sourceUrl`, `sourceTitle`, `resultSummary`, `ownershipStatus` | ثبت Source Matrix با مالکیت Context |
| `create_candidate` | `provinceId`, `nodeId`, `name`, … | فقط در notes.md (هیچ JSON ساخته نمی‌شود) |
| `resolve_candidate` | `provinceId`, `candidateId`, `outcome` | بستن Candidate |
| `mark_node_media_deficit` | `provinceId`, `nodeId`, `reason`, `imagesFound` (۰-۹)، `searchesPerformed[]` | بستن شرعیِ نودِ ناتوان از تأمین ۱۰ تصویر آزاد پس از جستجوی خسته‌نشده (§9 پرامپت) — بدون فایل JSON، نود در DFS/DoD کامل حساب می‌شود؛ ذخیرهٔ فعالِ بعدی همان نود، وضعیت را خودکار resolved می‌کند |
| `save_active_entity` | `provinceId`, `entity`, `expectedNodeId` | دروازهٔ کیفیت کامل → ذخیره در مسیر canonical یا خطای ساخت‌یافته |
| `save_entities` | `provinceId`, `entities[]` | ذخیرهٔ دسته‌جمعی چند Entity در یک فراخوانی (یک round-trip به‌جای N) — والدها را قبل از فرزندان بگذارید |
| `link_entities` | `provinceId`, `fromId`, `toId`, `relationType`, … | Relation معتبر + به‌روزرسانی هر دو فایل |
| `update_notes` | `provinceId`, `operation`, `payload` | به‌روزرسانی ساخت‌یافته و قابل‌ردیابی notes — `complete_discovery_task` نیازمند `count` (تعداد کاملِ واحدهای کشف‌شده) است |
| `check_definition_of_done` | `provinceId` | complete + موارد ناقص + nextAction |
| `discover_node` | `provinceId`, `nodeType`, `canonicalName`, `context?` | لیست Queryهای ساخت‌یافتهٔ همان Node (تولیدکنندهٔ Query، بدون اتصال به اینترنت) |
| `discover_subtree` | `provinceId`, `nodeId?` | همهٔ Queryهای یک زیردرخت (یا کل استان) در یک فراخوانی، برای جستجوی موازی |
| `validate_province` | `provinceId` | بازبینی همهٔ Entityهای ذخیره‌شده و گزارش خطاهای ساخت‌یافته (evidence ناقص، ناسازگاری مالکیت و…) |
| `list_pending_nodes` | `provinceId` | صف کامل کار: همهٔ Nodeهای ناتمام به ترتیب عمقی (برای batch و ادامهٔ برنامه‌ریزی) |

### `ownershipStatus` (در `record_search_result`)

`belongs_to_node` · `belongs_to_parent` · `belongs_to_child` · `nearby_only` · `unverified` · `rejected`

### `update_notes` operationها

`add_research_coverage` · `add_conflict` · `resolve_conflict` · `add_discovery_task` · `complete_discovery_task` · `mark_node_complete` · `update_registry` · `register_node`

(ثبت Source Matrix **فقط** از طریق `record_search_result` انجام می‌شود؛ `update_notes` دیگر operation مستقیم برای آن ندارد تا validation مالکیت/URL دور نخورد.)

(هیچ operationای اجازهٔ بازنویسی آزاد کل notes.md را نمی‌دهد.)

---

## فهرست Resourceها (read-only)

| URI | محتوا |
|---|---|
| `planro://scopes` | ایندکس ۳۱ استان با `provinceId` و `countyId`ها (Scope IDs) |
| `planro://scopes/{provinceId}` | رجیستری Scopeهای یک استان: `tree` (county → city/village)، `index` (id → واحد)، `indexByName` (نام → idها) — خروجی قطعی از `input/{n}.json` |
| `planro://rules/readme` | متن README (Source of Truth) |
| `planro://rules/brand-voice-guide` | هویت کلامی و لحن برند — نسخه ۱.۰ نهایی (فایل واحد): حالت‌های زبانی، سیستم واژگان و لیست سیاه، فراخوان اقدام، صدای هوش مصنوعی، ۱۰۰ نمونه قبل/بعد، آزمون کیفیت + پیوست نمونهٔ کاربردی روی محتوای Dataset — ماسوله (brand_voice.md) |
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

1. **Active-only + شرط کمبود رسانه (§9)**: هیچ JSON ناقصی ذخیره نمی‌شود. `save_active_entity` ابتدا کل Quality Gate را اجرا می‌کند و فقط در صورت موفقیت کامل، فایل را (اتمیک) می‌نویسد. status ذخیره‌شده همیشه `active` است (حتی `archived` که Schema اجازه می‌دهد، رد می‌شود). اما برای نودهای اداریِ واقعی که پس از جستجوی خسته‌نشده در آرشیوهای آزاد (Wikimedia Commons، Flickr CC، geosearch، WLM…) کمتر از ۱۰ تصویرِ قابل‌انتساب به خود نود دارند، ابزار `mark_node_media_deficit` مسیر شرعی است: نود با وضعیت `media_deficit` و بدون هیچ فایل JSON بسته می‌شود، رکورد قابل‌ممیزی (`reason`, `imagesFound`, `searchesPerformed`) در notes.state.json می‌ماند، و نود در پیمایش DFS و در `check_definition_of_done` کامل محسوب می‌شود. این ابزار فقط روی نود اجباری فعلی کار می‌کند (همان قاعدهٔ DFS)، ترک‌های کشف باید بسته باشند و Candidate/Conflict باز نباشد؛ اگر بعداً ۱۰+ تصویر پیدا شد و `save_active_entity` اجرا شد، رکورد کمبود خودکار به `resolved/promoted_to_active` تبدیل می‌شود. عکس جعلی، تکراری یا متعلق به همسایه/والد همچنان اکیداً ممنوع است.

2. **Candidate فقط در notes.md**: `create_candidate` هیچ فایلی نمی‌سازد؛ خروجی آن صراحتاً `jsonCreated: false` است. کمبود رسانهٔ نودِ اداری اما Candidate نیست — با `mark_node_media_deficit` ثبت می‌شود (بند ۱) تا برخلاف Candidateِ باز، نود را باز نگه ندارد و چرخهٔ DFS متوقف نشود.

3. **notes.md ساخت‌یافته و اتمیک**: notes.md شامل بلوک `<!-- planro:state -->` (JSON) + جدولهای قابل‌خواندن (ID Registry، Research coverage، …) است. همهٔ نوشتنها با temp+rename اتمیک انجام می‌شوند و هیچ Toolای «بازنویسی آزاد» ندارد.

4. **پیمایش عمقی (DFS) + قرارداد تعداد (Count)**: ترتیب نسبت به والد آگاه است — `province → مکانهای سطح استان/کمپینگ → county → …`؛ یعنی Place/Camp مستقیمِ یک سطح، پیش از ورود به فرزندان اداری آن سطح بازدید می‌شود (مطابق پرامپت). `next-node` اولین Node ناتمام را برمی‌گرداند، نه یک Node تصادفی. «کامل» بودن یک Node = ذخیرهٔ Entity فعال (برای نوعهای entity) + تکمیل همهٔ `requiredDiscovery` + نبود Candidate/Conflict باز. علاوه بر آن، هر discovery track قابل‌شمارش (مثل `counties`) هنگام تکمیل باید `count` (تعداد کاملِ واحدهای کشف‌شده) را اعلام کند و DoD چک می‌کند که دقیقاً همان تعداد Node ثبت شده باشد — این مانع ادعای `complete` با تنها ۱ شهرستان از ۱۰ شهرستان می‌شود.

5. **مالکیت Source (Source Ownership)**: هر Search Result فقط با `record_search_result` (نه `update_notes`) در Source Matrix ثبت می‌شود و مالکیت + URL خام آنجا validate می‌شود. در ذخیره، `evidence.sourceUrl` باید دقیقاً یکی از `sources[].url` باشد و Source باید برای همان Node (یا به‌صورت `belongs_to_child` برای والد) ثبت شده باشد. Source ثبت‌شده برای استان نمی‌تواند Fact اختصاصی شهرستان را پشتیبانی کند. `link_entities` هم قواعد معنایی را اعمال می‌کند: `parent` باید والد اداری واقعی باشد، `gateway_city` باید شهر باشد، `nearby` نباید والد/فرزند اداری باشد.

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

11. **Query-Generator، نه Search**: `discover_node` فقط رشته‌های Queryِ node-scoped را (مطابق قالب‌های `prompt.txt`) تولید می‌کند و به اینترنت وصل نمی‌شود. اجرای جستجو و ثبت نتیجه با `record_search_result` بر عهدهٔ Agent است. این هم ممنوعیت crawl/scrape را حفظ می‌کند و هم مانع آلودگی Parent→Child می‌شود (Query شهرستان همیشه نام کامل شهرستان را دارد، نه نام استان).

12. **ذخیره فقط از مسیر MCP**: تنها راه مجاز برای نوشتن JSON، `save_active_entity` / `save_entities` است. هر نوشتن مستقیم فایل (bash/heredoc) دروازهٔ کیفیت را دور می‌زند.

13. **سرعت (Batch)**: برای جمع‌آوری حجم بالا، `save_entities` چند Entity را در یک فراخوانی ذخیره می‌کند و `discover_subtree` همهٔ Queryهای یک زیردرخت را یک‌جا می‌دهد تا Agent بتواند جستجوها را موازی اجرا کند. ترتیب در `save_entities` مهم است: والدها قبل از فرزندان. توجه: این **نوشتن ترتیبیِ اعتبارسنجی‌شده** است، نه تراکنش اتمیک — هر Entity مستقلاً validate و نوشته می‌شود و نتایج تک‌به‌تک برمی‌گردد.

14. **URLها خودکار نرمال می‌شوند**: چون لایهٔ چتِ Agent گاهی URL را به شکل Markdown (`[url](url)`) رندر می‌کند، `save_active_entity` و `save_entities` پیش از اعتبارسنجی، همهٔ فیلدهای URL را به لینک خام `https://…` تبدیل می‌کنند و همان نسخهٔ تمیز را ذخیره می‌کنند. لازم نیست Agent نگران این خطای رندر باشد.

15. **اجرای پلکانی + idهای اختصاصی Scope**: `src/scopes.ts` از `input/{n}.json` یک رجیستری **قطعی** می‌سازد که به هر استان/شهرستان/شهر/روستا یک id پایدار می‌دهد (شمارهٔ شهر و روستا سراسریِ استان است تا نام‌های تکراری id یکتا بگیرند). `import_province_scopes` همان ساختار را فقط به‌عنوان Node (+ ترک‌های اداریِ کامل‌شده با count) در notes ثبت می‌کند — هرگز Entity یا POI نمی‌سازد. `activeScopeId` در حالت `notes.state.json` ذخیره می‌شود و `nextRequiredNode`/DFS را به زیردرخت همان Scope محدود می‌کند؛ `mark_node_complete` برای نودهای خارج از Scope فعال با `SCOPE VIOLATION` رد می‌شود. این یعنی هر اجرا دقیقاً یک Scope دارد؛ والدها/همسایه‌ها برای اجراهای جداگانه pending می‌مانند و Resume از روی state انجام می‌شود.

---

## محدودیت‌های شناخته‌شده

- **Provenance وابسته به ثبت پژوهشگر است، نه صرف URL**: بررسی «تصویر استان برای شهرستان»، «منبع واقعی بودن»، «لینک مجوز همان فایل» و «واقعی بودن priceAsOf» به provenance ثبت‌شده توسط Agent (`record_search_result` و Source Matrix) وابسته است. MCP فقط ناسازگاری‌های ثبت‌شده را رد می‌کند؛ نمی‌تواند محتوای وب را scrape یا راستی‌آزمایی کند.
- **لحن برند (Brand Voice)** با سه دسته هیوریستیک کنترل می‌شود: `BRAND_VOICE_SUPERLATIVE` (صفات تبلیغاتی مانند بهترین/زیباترین/جادویی و واژه‌های ممنوع نسخه ۱.۰ مانند «نگین»، «بهشت گمشده»، «رؤیایی»)، `BRAND_VOICE_TECH_NOISE` (هوش مصنوعی/سیستم هوشمند/فناوری/الگوریتم قدرتمند…)، `BRAND_VOICE_CLICHE` (کلیشهٔ رباتی مانند «تجربه‌ای … فراهم می‌کند» و واژه‌های اداری/فشار زمانی مانند «نمایید»، «در راستای»، «همین حالا»، «فرصت استثنایی»). **تصمیم نهایی**: این موارد **خطای blocking** هستند، مگر اینکه برای همان فیلد، `evidence` اختصاصی ثبت شده باشد — در این صورت به Warning تنزل می‌یابند (چون README می‌گوید ادعاهایی مثل «قدیمی‌ترین» فقط «با Evidence اختصاصی» مجازند). مرجع کامل: سند واحد «هویت کلامی و لحن برند — نسخه ۱.۰ نهایی» (به‌همراه پیوست نمونهٔ کاربردی روی محتوای Dataset) در `planro://rules/brand-voice-guide` است.
- **تطبیق نام→id اداری** در مسیر canonical به ثبت صحیح سلسله‌مراتب Nodeها (via `register_node` / `add_discovery_task` با `parentNodeId`) وابسته است.
- این پروژه **پیش‌نمونه** است؛ `reserve_entity_id`، slug و الگوی ID مطابق README پیاده شده اما transliteration فارسی→لاتین فعلاً حداقلی است (به `preferredSlug` ارائه‌شده توسط Agent متکی است).

---

## توسعه

```bash
npm run dev            # اجرا با tsx بدون build
npm run build          # build
npm test               # build + test
```
