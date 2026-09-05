# گزارش جامع پروژه، تصمیم‌ها، اصلاحات و وضعیت اجرا

> این سند، قرارداد نهایی پروژهٔ `data-json-mcp` (Planro MCP) است: چه چیزی ساخته شده، چه تصمیم‌هایی گرفته شده،
> چه چیزهایی حذف/اصلاح شده و **چه چیزی واقعاً روی سرویس اجرا و اثبات شده است**.
> هر بندی که در این سند «قرارداد» نامیده می‌شود، در `scripts/verify-project.mjs` یا
> `scripts/e2e-province-smoke.mjs` یک بررسی خودکار متناظر دارد.

نسخهٔ سرویس: **0.2.0** — تاریخ آخرین اجرای اثبات: با `npm test` قابل بازتولید است.

---

## ۱) هدف پروژه

یک MCP Server واقعی (stdio) که به Agent تحقیق اجازه می‌دهد دادهٔ گردشگری ایران را **سلسله‌مراتبی، قابل‌ردیابی و
بدون آلودگی Parent/Child** تولید کند. MCP جای Agent یا موتور جستجو را نمی‌گیرد؛ فقط Tool و Resource ساخت‌یافته و
یک **دروازهٔ کیفیت غیرقابل‌دور‌زدن** ارائه می‌دهد. هیچ HTTP، UI، دیتابیس، crawler یا shell آزادی وجود ندارد.

## ۲) معماری اجرای پلکانی

هر اجرا دقیقاً یک Scope دارد:

1. **مرحلهٔ استان**: فقط Entity خودِ استان + مکان‌های سطح استان.
2. **توقف**: `awaitingScopeSelection: true` و پرسش «کدام شهرستان/شهر/روستا؟».
3. **Scope بعدی**: با `set_active_scope` قفل می‌شود و DFS/DoD فقط همان زیردرخت را می‌سنجند.

state در `output/{provinceId}/notes.state.json` نگه داشته می‌شود و Resume کاملاً از روی همین state انجام می‌شود.

## ۳) دنبالهٔ پرامپت‌ها (۵ فایل، ادغام‌نشده)

| فایل | نقش |
|---|---|
| `prompts/01-start-province.txt` | **قرارداد مادر**: bootstrap، ورودی، ماتریس فیلدها، رسانه، منابع، Taxonomy، ترتیب فراخوانی MCP |
| `prompts/02-run-scope.txt` | اجرای یک Scope مشخص |
| `prompts/03-resume.txt` | ادامهٔ کار نیمه‌تمام از روی state |
| `prompts/04-repair-entity.txt` | اصلاح یک Entity مشخص |
| `prompts/05-final-audit-minify.txt` | ممیزی نهایی و آماده‌سازی خروجی |

تصمیم: این پنج فایل **ادغام نمی‌شوند**؛ فقط ۰۱ قرارداد کامل را دارد و بقیه به آن ارجاع می‌دهند.
قرارداد: هیچ پرامپتی نباید id واقعی (`province-30`, `county-30-5`, …) داشته باشد — پرامپت‌ها generic می‌مانند.

## ۴) قرارداد ورودی

تنها ورودی مرحلهٔ یک `province_id` است. هرگز `scope_id`، نام استان یا مسیر فایل از کاربر پرسیده نمی‌شود.

- مقدار واقعی موجود در Task جاری **authoritative** است و placeholderِ `<PROVINCE_ID>` را باطل می‌کند.
- نبود مقدار واقعی → `MISSING_INPUT: province_id` و توقف (بدون سؤال تعاملی).
- ورودی عددی `30` هم در پرامپت و هم در خودِ MCP به `province-30` نرمال می‌شود
  (`src/config.ts: assertProvinceId` + نرمال‌سازی سراسری در `src/server.ts` + `readNotes` + `buildScopeRegistry`).

## ۵) ترتیب فراخوانی MCP (Call Order)

`import_province_scopes` → `get_next_research_node` → `get_node_context` → `record_search_result` ×۵ →
`get_source_coverage` → `record_media_candidate` ×n → `finalize_media` → `save_active_entity` →
`complete_discovery_task(count)` → `check_definition_of_done` → `validate_province` → توقف روی
`awaitingScopeSelection` → `set_active_scope`.

## ۶) مالکیت داده (Scope Ownership)

والد می‌تواند فرزند را در **متن** نام ببرد، اما هرگز دادهٔ عملیاتی فرزند را تکرار نمی‌کند: بلیت، ساعت کار،
امکانات، مسیر رسیدن، FAQ عملیاتی، چک‌لیست، هزینه و ایمنی فرزند فقط روی خودِ فرزند ذخیره می‌شود.

پیاده‌سازی: `FAQ_CHILD_SCOPE` (فقط برای پرسش‌های عملیاتی؛ نام‌بردن ساده Warning است)،
`COST_CHILD_SCOPE` حذف شد (فیلد costs دیگر وجود ندارد)، `VISIT_FIELD_NOT_ALLOWED`، `CHECKLIST_ITEM_NOT_CONCRETE`.
تطبیق نام با مرز واژه و نرمال‌سازی فارسی (نیم‌فاصله، ی/ک عربی) انجام می‌شود و **نام‌های خودِ Entity و اجدادش
استثنا هستند** — وگرنه استانی مثل همدان که شهرستان و شهر هم‌نام دارد، هرگز نمی‌توانست نام خود را بنویسد.

## ۷) نرمال‌سازی فیلدها بر اساس نوع Entity

مرجع قطعی: `dataset/entity-field-policy.json` و Resource `planro://rules/entity-fields`
(Required / Recommended / Optional / Forbidden برای province، county، city، village، place، camping).

**تقسیم Visit**

| نوع | فیلدهای مجاز |
|---|---|
| province / county | `bestSeasons`, `bestMonths` |
| city | + `crowdLevel` |
| village | همه به‌جز `openingHours` |
| place / camping | کامل (duration، bestTimeOfDay، openingHours، entryFee، difficulty، reservation، guide، crowd) |

**تقسیم Costs**: استان/شهرستان/شهر → اقامت، خوراک، حمل‌ونقل درون‌شهری؛ place → ورودی، پارکینگ، راهنما؛
camping → هزینهٔ کمپ. قیمت هرگز حدس زده نمی‌شود؛ فقط با منبع و `priceAsOf`.

## ۸) رسانه

| نوع | هدف |
|---|---|
| province / county / city / place | ۵ تصویر |
| village / camping | ۳ تصویر |

- تامبنیل **داخل** همین بودجه است و باید از تصویر دیگری تکرار نشود (`MEDIA_THUMBNAIL_DUPLICATED`).
- یک image URL نباید بین دو Entity تکرار شود — کنترل سراسری در زمان ثبت کاندید و در زمان ذخیره
  (`MEDIA_GLOBAL_DUPLICATE`).
- عکس Parent/Child/Sibling برای Entity دیگر قابل استفاده نیست؛ عکس استان باید نمایندهٔ خود استان باشد.
- ذخیرهٔ ۰-عکس فقط پس از Coverage کامل منابع Primary مجاز است (`MEDIA_ZERO_WITHOUT_PRIMARY_COVERAGE`)،
  ولی برای **Definition of Done** رسیدن به هدف لازم است.
- سقف مطلق اعتبارسنجی ۲۰ تصویر است. `mark_node_media_deficit` فقط برای «نبودِ کل دادهٔ Entity» است، نه کمبود عکس.

قرارداد: هدف‌های بالا در `dataset/entity-field-policy.json`، `src/media.ts` و `dataset/place.schema.json`
یکسان‌اند و `npm run verify` این هم‌خوانی را می‌سنجد.

## ۹) منابع و Evidence

پنج منبع Primary اجباری برای **هر** Node: کجارو، جاباما، علی‌بابا، لست‌سکند، فلای‌تیودی
(`dataset/source_policy.json`, `enforcement: all` برای همهٔ انواع Entity).

- «نتیجه‌ای نبود» ≠ «جستجو نشد»: نتیجهٔ خالی یا منبع در دسترس نبودن هم باید با `record_search_result` ثبت شود.
- **کشف تصویر هرگز به‌عنوان Fact Source Coverage حساب نمی‌شود** (Coverage فقط از `sourceMatrix` می‌آید).
- هر `sources[].url` باید برای همان Node در Source Matrix ثبت شده باشد (`SOURCE_NOT_REGISTERED`).
  فیلد `evidence` از قرارداد حذف شده است.
- URL باید خام `https://` باشد؛ رندر Markdown (`[url](url)`) در زمان ذخیره خودکار تعمیر می‌شود و در زمان
  ثبت منبع رد می‌شود.

## ۱۰) Taxonomy

تنها مرجع، Taxonomy سراسری در `taxonomy/` است (types, subtypes, categories, activities, features, facilities, risks).
Taxonomy داخل استان/Scope کپی نمی‌شود. مفهوم جدید مثل خود Taxonomy ساخته می‌شود، اما فقط داخل
`taxonomy/agent-taxonomy/{catalog}.json` (staging؛ `planro://taxonomy/agent`) و **هرگز** تا promote انسانی
وارد Entity تولیدی نمی‌شود.
(`TAXONOMY_UNKNOWN`, `TYPE_UNKNOWN`, `SUBTYPE_UNKNOWN`).

قرارداد: idها یکتا و snake_case هستند و enumهای `place.schema.json` (`type`, `features`, `facilities`)
دقیقاً با Taxonomy یکی‌اند؛ اختلاف، `npm run verify` را قرمز می‌کند.

## ۱۱) فیلدهای حذف‌شده

`tags`، `safety.emergencyNumbers` و `transportNode.distanceKm` از اسکیما حذف شده‌اند و بازگشتشان
در verify رد می‌شود. فاصله در اپ از مختصات محاسبه می‌شود، نه در Entity.

## ۱۲) تغییرات ابزارها

- `resolve_scope_name` **حذف شد**. تبدیل نام → id از Resource `planro://scopes/{provinceId}` (`indexByName`)
  و سپس `set_active_scope`.
- `mark_node_complete` Tool مستقل ندارد؛ فقط operationای از `update_notes` است.
- `complete_discovery_task` بدون `count` عددی رد می‌شود و DoD تطابق count با Nodeهای ثبت‌شده را می‌سنجد.
- `record_media_candidate` تکرار سراسری URL را در همان لحظه رد می‌کند.
- `check_definition_of_done` **Scope-محور** است: `scopeMode` (`province-stage` / `scoped` / `full-province`)،
  `scopeLabel`، `scopeNodes` و `awaitingScopeSelection` را برمی‌گرداند و در مرحلهٔ استان فقط همان مرحله را می‌سنجد.

## ۱۳) لایه‌های کیفیت

ترتیب: اسکیما (Ajv 2020-12) → Taxonomy → سلسله‌مراتب و یکتایی id/slug → مالکیت منبع و Evidence →
نرمال‌سازی فیلدها و مالکیت Visit/Cost/FAQ/Checklist → رسانه → لحن برند → **Definition of Done** → ذخیره →
Scope بعدی. لحن برند سه دستهٔ `BRAND_VOICE_SUPERLATIVE` / `BRAND_VOICE_TECH_NOISE` / `BRAND_VOICE_CLICHE` دارد
که با Evidence اختصاصیِ همان فیلد به Warning تنزل می‌یابد.

## ۱۴) اصلاحات این دور (Changelog)

1. **DoD مرحلهٔ استان**: پیش‌تر کامل‌بودن اداری کل استان را می‌سنجید و مرحلهٔ استان هرگز `complete` نمی‌شد؛
   حالا با `effectiveScope(state)` فقط Nodeهای درون Scope مؤثر سنجیده می‌شوند.
2. **حذف کامل `resolve_scope_name`** از `src/`، پرامپت‌ها و مستندات (۹۰ خط کد + ۶ ارجاع متنی).
3. **کد مرده و تکراری**: حذف بلوک تکراری `MEDIA_GLOBAL_DUPLICATE`، `NODE_ANCESTOR_PRIORITY` و importهای بلااستفاده.
4. **بازنویسی `src/media.ts`** به شکل خوانا (`TARGET_5`/`TARGET_3`، `mediaPolicyFor`، `mediaStatusFor`، `MEDIA_POLICY_SUMMARY`).
5. **اسناد رسانه**: توضیح‌های `place.schema.json` از هدف قدیمی ۱۰ به ۵/۳ اصلاح شد.
6. **Coverage**: تصریح شد که کشف تصویر جای Fact Source را نمی‌گیرد (کد + توضیح ابزار).
7. **باگ نرمال‌سازی استان**: `buildScopeRegistry("30")` قبلاً درخت را زیر id خام `30` می‌ساخت؛ حالا همه‌جا canonical است.
8. **باگ هم‌نامی**: مالکیت FAQ/Cost با تطبیق substring، نام خودِ استان را «نام فرزند» می‌دید و ذخیرهٔ همدان را
   برای همیشه بلوکه می‌کرد؛ حالا نام خود و اجداد استثنا و تطبیق مرز-واژه‌ای است.
9. **اسکیما ↔ Taxonomy**: enum فیلد `features` با `taxonomy/features.json` یکی شد (۱۰ id معتبر Taxonomy قبلاً
   در اسکیما رد می‌شدند).
10. **verify واقعی**: اسکریپت verify از «چک وجود فایل» به **بررسی قرارداد** ارتقا یافت و دو حالت
    workspace/package گرفت (قبلاً بعد از `npm install` همیشه شکست می‌خورد).
11. **E2E واقعی**: `scripts/e2e-province-smoke.mjs` اضافه شد.
12. **مستندات**: README، START_HERE، `dataset/README.md` و پرامپت‌ها با وضعیت واقعی هم‌تراز شدند.

## ۱۵) وضعیت اجرا — Final Runtime Checklist

اجرای واقعی روی `province-30` (همدان) با خروجی موقت و سرویس build-شده:

- [x] `import_province_scopes` → نرمال‌سازی `30 → province-30`، ثبت **۹ شهرستان / ۳۱ شهر / ۹۶۲ روستا**، idempotent
- [x] DFS از خود استان شروع می‌شود و خودکار وارد شهرستان‌ها نمی‌شود
- [x] `record_search_result` برای هر ۵ منبع Primary → Coverage از ۰/۵ به **۵/۵ satisfied**
- [x] منبع خارج از سیاست به‌عنوان `other` دسته‌بندی و هشدار داده می‌شود؛ URL مارک‌داون در زمان ثبت رد می‌شود
- [x] `record_media_candidate` (idempotent) + `finalize_media` → دقیقاً **۵ تصویر متمایز**، تامبنیل داخل بودجه، `status=complete`
- [x] همهٔ گیت‌های منفی واقعاً رد می‌کنند: VISIT_FIELD_NOT_ALLOWED،
      FAQ_CHILD_SCOPE، CHECKLIST_ITEM_NOT_CONCRETE، TAXONOMY_UNKNOWN، SOURCE_NOT_REGISTERED،
      SOURCE_NOT_REGISTERED، BRAND_VOICE_SUPERLATIVE، MEDIA_ZERO_WITHOUT_PRIMARY_COVERAGE،
      MEDIA_THUMBNAIL_DUPLICATED، MEDIA_GLOBAL_DUPLICATE، DUPLICATE_ID
- [x] `save_active_entity` → ذخیره در مسیر canonical `output/province-30/province.json` + تعمیر خودکار URL مارک‌داون
- [x] `complete_discovery_task` بدون `count` و با `count` نادرست رد می‌شود
- [x] ترتیب DFS اجباری است و تکمیل خارج از ترتیب رد می‌شود
- [x] پس از تکمیل استان: `provinceStageComplete` و **`awaitingScopeSelection: true`**؛ هیچ شهرستانی بدون انتخاب کاربر کامل نمی‌شود
- [x] `check_definition_of_done` → **`complete: true`** با `scopeMode: "province-stage"` و ثبت نتیجه در notes
- [x] `validate_province` → **`invalid: 0`**
- [x] `set_active_scope("county-…")` → قفل Scope، رد Node خارج از Scope، شروع DoD جدید با `complete:false`
- [x] Resume: state از `notes.state.json` بازخوانی می‌شود

نتیجه: `npm run e2e` → **۴۵ assertion سبز**. `npm run verify` → **PASS**. `npx tsc --noEmit` → بدون خطا.
`node mcp-client.mjs list-tools` → ۲۳ ابزار.

## ۱۶) بازتولید

```bash
npm install
npm run build
npm run verify        # قرارداد پروژه (workspace)
npm run e2e           # اجرای واقعی مرحلهٔ استان
npm test              # هر دو
npm run verify:package  # فقط پیش از تحویل ZIP (بدون node_modules/dist/output)
```

## ۱۷) محدودیت‌های باقی‌مانده

- راستی‌آزمایی محتوای وب ممکن نیست؛ صحت provenance به ثبت درست Agent وابسته است.
- کنترل لحن برند هیوریستیک است و جای ویرایش انسانی را نمی‌گیرد.
- transliteration فارسی→لاتین حداقلی است و به `preferredSlug` متکی است.
- E2E روی داده‌های نمونهٔ محلی اجرا می‌شود؛ کیفیت واقعی محتوا همچنان به منابع وب و داوری Agent وابسته است.
