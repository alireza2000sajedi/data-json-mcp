# PLANRO — قانون‌نامهٔ واحد تولید دیتای راهنمای گردشگری

> **این فایل تنها مرجع معتبر و یکپارچهٔ قواعد پروژهٔ Planro است.**
> `place.schema.json` تنها مرجع ساختار، enumها، Requiredها و Validation JSON است. هر Patch، قانون یا پرامپت قدیمی که با این فایل یا Schema نهایی تعارض دارد، ملغی است.

## 1. مراتب اعتبار

1. `README.md`: Scope، رفتار Agent، کیفیت تحقیق، ساختار فایل و Definition of Done.
2. `place.schema.json`: نام کلیدها، نوع داده، `required`، enum، الگوها و اعتبارسنجی JSON.
3. `input/`: ساختار اداری کامل ۳۱ استان (`1.json` تا `31.json`) — چک‌لیست مرجع کشف اداری و مبنای `count` قرارداد تکمیل؛ اما منبع Fact، مختصات یا قیمت نیست (تفصیل در بخش ۱-۱).

- README و Prompt نباید فهرست موازی Required بسازند؛ Requiredها فقط از Schema خوانده می‌شوند.
- در تعارض اجرایی، README مقدم است؛ در تعارض ساختار JSON، Schema مقدم است.

## 1-1. دیتای ورودی `input/` — ساختار اداری کامل استان‌ها

پوشهٔ `input/` ریشهٔ ریپو شامل ۳۱ فایل JSON است — `1.json` تا `31.json` — که هر کدام اطلاعات کامل یک استان را دارد. برای `province-{n}` فایل `input/{n}.json` است (مثلاً `province-30` → `input/30.json`).

ساختار هر فایل:

```json
{
  "id": 1,
  "name": "نام استان",
  "counties": [
    {
      "name": "نام شهرستان",
      "cities": ["نام شهرها"],
      "villages": ["نام روستاها"]
    }
  ]
}
```

- `id`: شناسهٔ استان؛ همان عدد Entity استان (`province-{id}`).
- `name`: نام فارسی استان.
- `counties`: فهرست کامل شهرستان‌های استان؛ هر شهرستان دارای:
  - `name`: نام شهرستان؛
  - `cities`: فهرست شهرهای آن شهرستان؛
  - `villages`: فهرست روستاهای آن شهرستان.

قواعد استفادهٔ Agent:

1. **چک‌لیست مرجع کشف اداری**: در گام Discovery هر Node، فایل input مبنای شروع است. همهٔ شهرستان‌ها، شهرها و روستاهای فایل باید پوشش داده شوند: هر مورد یا Node/Entity واقعی می‌شود یا دلیل مستند (Conflict یا تصمیم Deduplication) در notes می‌گیرد. غافل‌گذاشتن موارد فایل، نقض کامل‌بودن کشف است.
2. **مبنای `count` قرارداد تکمیل**: هنگام `complete_discovery_task`، `count` باید با این فایل سازگار باشد (مثلاً همدان در `input/30.json` دارای ۹ شهرستان است → `count: 9`؛ تعداد شهرها و روستاهای هر شهرستان نیز از همین فایل خوانده می‌شود). `count` غیرواقعی، DoD را به‌اشتباه complete می‌کند و تخلف است.
3. **نام‌ها initial هستند**: نام Canonical، نام‌های جایگزین، مالکیت والد و تعلق جغرافیایی با تحقیق زندهٔ وب تعیین و Cross-check می‌شود؛ نه کورکورانه از input.
4. **input منبع Fact نیست**: Fact، مختصات، قیمت، ساعت کاری، تصویر و هر دادهٔ محتوایی فقط از Sourceهای وب ثبت‌شده در Source Matrix می‌آید (مختصات input ممنوع است — بخش ۸).
5. **تضاد با واقعیت** (تقسیمات جدید، تغییر نام، انحلال): در notes به‌عنوان Conflict ثبت و تصمیم بر اساس تحقیق و منابع رسمی گرفته می‌شود.

## 2. نقش Agent

Agent، Deep Research & Data Collection Agent پروژهٔ Planro است. وظیفه: Search زنده، تحقیق عمیق، Cross-check، ساخت دستی JSON، Validation، ذخیره و ادامهٔ پلکانی Scope.

ممنوع: script، crawler، scraper، API client، اتوماسیون Search/Extraction، pipeline، ETL، database، application، Dockerfile، dependency یا پروژهٔ جدید.

## 3. Scope و ادامهٔ اجباری

### قرارداد اجرای بی‌صدا

بعد از دریافت `province_id`، Agent هیچ پیام کاربرمحور تا پایان واقعی Scope تولید نمی‌کند. تأیید دریافت، گزارش شروع، Checkpoint، Batch، Commit، Push، وضعیت `in_progress`، قدم بعدی، سؤال ادامه یا درخواست تأیید ممنوع است.

```text
ممنوع:
province_id دریافت شد و کار آغاز شد
Checkpoint ثبت شد
Push موفق بود
Scope هنوز در حال انجام است
اگر خواستید ادامه می‌دهم
```

بعد از دریافت province_id، Agent باید فوراً Search/Research/Write را شروع کند. Checkpoint و Git فقط داخل notes.md ثبت می‌شوند و هرگز Interaction Boundary نیستند.

- `province_id` ورودی پایه است. اگر وجود ندارد فقط بپرس: «لطفاً province_id را مشخص کنید.»
- فقط `province_id` یعنی کل استان Scope است:

```text
Province → County → District → City / Rural District → Village → POIهای هر سطح
```

- استان، شهرستان، شهر، روستا و هر POI قابل‌ثبت مستقل تحقیق می‌شوند.
- District و Rural District برای تحقیق و `location.district` / `location.ruralDistrict` اجباری‌اند، اما فایل مستقل ندارند.
- Agent همهٔ POIهای قابل‌کشف و قابل‌ثبت را بررسی می‌کند: طبیعی، تاریخی، مذهبی، فرهنگی، تفریحی، اقامت، رستوران، فروشگاه، پارک، خدمات، Camping و دیگر نقاط نام‌دار.

### الگوریتم اجباری پخش و تحقیق پلکانی

Agent خودش باید دربارهٔ پایین‌ترین سطح اداری و نوع هر Entity فکر کند؛ نباید فقط County یا City بسازد و جاذبه‌ها/روستاها را در متن آن رها کند.

```text
1. Province
   → Placeهای خودِ استان را پیدا کن
   → Countyها، Cityها، Districtها، Rural Districtها و Villageهای آن را کشف کن

2. هر County
   → Placeهای متعلق به خود County و خارج از City/Village را پیدا کن
   → Cityها، Districtها، Rural Districtها و Villageهای آن را کامل کشف کن

3. هر City
   → City Entity را بساز
   → تمام Placeهای داخل همان City را جداگانه جست‌وجو و فایل‌سازی کن
   → Villageهای وابسته/نزدیک را از ساختار اداری واقعی کشف کن؛ Village را اشتباهاً Place City ثبت نکن

4. هر Village
   → Village Entity را بساز و خود Village را از نظر گردشگری، معماری، طبیعت، فرهنگ و Camping بررسی کن
   → اگر خود روستا مقصد گردشگری است، همان village.json Entity اصلی است؛ Place تکراری با همان نام نساز
   → اگر داخل/نزدیک روستا POI مستقل وجود دارد، برای هر POI فایل جدا در villages/{village_id}/places/ بساز

5. هر Place
   → Placeهای داخلی/مستقل مرتبط، Camping و Relationهای واقعی را بررسی کن
   → هر Entity جدید را دوباره به صف همین چرخه اضافه کن
```

- هیچ جاذبه‌ای فقط در description یا tags نام برده نمی‌شود؛ باید Entity مستقل یا Candidate مستند در notes باشد.
- Placeهای Province مستقیم در ریشهٔ پوشهٔ استان، Placeهای County در پوشهٔ خود County، Placeهای City/Village در پوشهٔ خودشان ذخیره می‌شوند — ساختار پوشه دقیقاً آینهٔ سلسله‌مراتب اداری واقعی است (تفصیل در بخش ۴).

### ممنوعیت توقف میان Scope

- ساخت `province.json`، یک Batch پنج‌فایلی، Commit، Push، JSON parse شدن، رکورد ناقص پایان Scope نیست.
- Commit/Push فقط Checkpoint ذخیره‌سازی است، نه Interaction Boundary. پس از هر Push، Agent باید در همان اجرای جاری و بدون گزارش کاربرمحور، اولین Query/Research/Write مربوط به اولین Entity ناتمام `notes.md` را شروع کند.
- گزارش Batch فقط داخل `notes.md` ثبت می‌شود؛ فهرست فایل‌های Batch یا وضعیت `in_progress` نباید پاسخ کاربر باشد.
- اختلاف منبع یا Cross-check ناتمام مجوز توقف نیست.
- عبارت‌هایی مانند «Batch اول تمام شد»، «Scope هنوز in_progress است»، «قدم بعدی اجباری»، «ادامه در نشست بعد» یا «اگر خواستید ادامه می‌دهم» تا زمانی که کار قابل‌انجامی باقی است، پایان پاسخ ممنوع هستند.
- JSON parse شدن به‌تنهایی Validation نیست؛ هر فایل باید هم با `place.schema.json` و هم Quality Gate معتبر باشد.
- فقط وقتی همهٔ Definition of Done تمام شد، گزارش نهایی مجاز است.
- اگر پلتفرم Agent را اجباراً متوقف کرد، فقط Checkpoint واقعی در `notes.md` و Git ثبت می‌شود؛ Scope هرگز کامل اعلام نمی‌شود.

## 3-0. Active-Only و ترتیب تکمیل عمقی

- رکورد ناقص برای خروجی Dataset وجود ندارند و نباید در JSON ذخیره شوند.
- هر JSON ذخیره‌شده باید `status: "active"` داشته باشد؛ یعنی تمام Requiredهای Schema، Quality Gate، تصاویر، URL خام، Relations و Validation آن کامل شده‌اند.
- دادهٔ ناقص فقط در `notes.md` به‌صورت Candidate/Task ثبت می‌شود؛ فایل JSON ناقص، County Shell، City Shell یا Place Shell ساخته و Commit نمی‌شود.

### ترتیب اجباری تکمیل

```text
1. Province Entity را کامل و Active کن
2. County اول را کامل کن
3. City اول آن County را کامل کن
4. تمام Placeهای City اول را کامل کن
5. تمام Villageهای واقعیِ همان County / Rural District را کشف و کامل کن
6. برای هر Village، خود Village و همهٔ Placeهای مستقلش را کامل کن
7. سپس City بعدی و بعد County بعدی
```

- Agent حق ندارد City، Village، POI یا County جدیدی را Active کند، وقتی City/County قبلی طبق این ترتیب هنوز Place، Village، Media یا Relation ناتمام دارد.
- Province فقط زمانی واقعاً کامل تلقی می‌شود که تمام Countyهایش همین چرخه را گذرانده باشند؛ تکمیل Province Entity در مرحلهٔ ۱ به‌معنای پایان Scope استان نیست.

## 3-1. County Traversal Gate — ممنوعیت County Shell

- ساختن `county.json` به‌تنهایی به‌معنای پردازش‌شدن County نیست؛ County Shell یک Checkpoint موقت است، نه خروجی کامل.
- پس از ساخت County، Agent باید پیش از رفتن به County بعدی این مسیر را کامل کند:

```text
County → District/Rural District discovery → Cities → Villages → named POIs → Camping search → Deduplication → canonical files → relations
```

- هر City، Village، POI، Campground، اثر تاریخی یا جاذبه‌ای که در `content`، `tags`، `faq`، `tips` یا `relations` نام برده می‌شود، باید یا:
  1. Entity واقعی با فایل Canonical داشته باشد؛ یا
  2. به‌صورت Candidate با Query، URLها و دلیل در notes ثبت و پیش از عبور از County دوباره پیگیری شود.
- County که فقط نام جاذبه‌ها را در Description می‌نویسد ولی فایل City/Village/POI آن‌ها را نمی‌سازد، ناقص است و نباید Complete یا آمادهٔ عبور به County بعدی تلقی شود.
- Agent حق ندارد County بعدی را به‌عنوان جایگزین ادامهٔ County ناتمام شروع کند؛ تحقیق موازی ممکن است، اما ذخیره‌سازی و تکمیل Canonical هر County خطی است.
- `relations.child` فقط برای Entityهایی مجاز است که فایل واقعی‌شان از قبل ساخته شده باشد.

## 3-2. اجرای پلکانی Scope و شناسه‌های اختصاصی

قرارداد اجرای جاری، **Stage-Based** است (مرجع عملیاتی: `STAGED_WORKFLOW.md` در ریشهٔ ریپو):

```text
Scope A (مرحلهٔ استان: ساختار + Entity استان) → سؤال «کدام شهرستان/شهر/روستا؟» → Scope B (Deep Research یک شهرستان/شهر + زیردرختش) → توقف → Scope C (روستا) → توقف → Scope D (POI) → …
```

- هر اجرای Agent دقیقاً **یک Scope** دارد؛ پس از ذخیرهٔ فایل‌ها، Checkpoint و `completed`، اجرا متوقف می‌شود و برای Scope بعدی منتظر دستور کاربر می‌ماند.
- `import_province_scopes` فهرست Scopeهای استان را از `input/{n}.json` با **idهای اختصاصیِ قطعی** می‌سازد. الگوها: `province-{n}`، `county-{p}-{n}`، `city-{p}-{n}`، `village-{p}-v{n}` (شمارهٔ شهر/روستا سراسریِ استان است تا نام‌های تکراری یکتا باشند) و بعداً `place-{p}-{n}`.
- `set_active_scope` Scope انتخابی را قفل می‌کند: `nextRequiredNode`/DFS فقط روی زیردرخت همان Scope کار می‌کند و `mark_node_complete` خارج از آن با `SCOPE VIOLATION` رد می‌شود. والد/همسایه‌ها برای اجراهای بعدی pending می‌مانند.
- Resume: ابتدا `get_scope_state`/`get_next_research_node` خوانده می‌شود؛ فقط Scope ناتمام بعدی اجرا می‌شود و هیچ فایل تکمیل‌شده‌ای دوباره تولید نمی‌شود.
- در Scope A (مرحلهٔ استان) فقط Entity خودِ استان + مکان‌های سطح استان تحقیق و ذخیره می‌شود؛ Entity شهرستان/شهر/روستا ساخته نمی‌شود. پس از آن Agent متوقف می‌شود و می‌پرسد: «کدام شهرستان/شهر/روستا؟» (نام فارسی از طریق Resource `planro://scopes/{provinceId}` و `indexByName` به id تبدیل می‌شود و سپس با `set_active_scope` قفل می‌شود).

## 4. مدل Entity و محل ذخیره

| سطح | JSON مستقل | type / subType |
|---|---:|---|
| Province | بله | `other` / `province` |
| County | بله | `other` / `county` |
| District / Rural District | خیر | فقط location |
| City | بله | `city` |
| Village | بله | `village` |
| POI | بله | type واقعی + subType |

```text
output/{province_id}/
├── notes.md
├── province.json
├── county-{p}-{n}/county.json
├── county-{p}-{n}/city-{p}-{n}/city.json
├── county-{p}-{n}/city-{p}-{n}/village-{p}-v{n}/village.json
├── county-{p}-{n}/city-{p}-{n}/village-{p}-v{n}/place-{p}-{n}.json
├── county-{p}-{n}/place-{p}-{n}.json        ← POI مستقیم زیر شهرستان
└── place-{p}-{n}.json                        ← POI مستقیم زیر استان
```

- ساختار پوشه دقیقاً آینهٔ سلسله‌مراتب اداری واقعی است و پوشهٔ type-prefix (مثل `places/` یا `counties/`) ندارد. هر Entity اداری پوشه‌ای به نام id خودش دارد و Place/Camp فایل برگ‌مانند داخل پوشهٔ والد واقعی‌اش است.
- روستا و مکان می‌توانند در هر سطحی (استان/شهرستان/شهر/روستا) باشند — همان جایی که Node در Graph ثبت شده است.
- مسیر Canonical را همیشه MCP از گراف سلسله‌مراتب می‌گیرد (`save_active_entity` / `save_entities`)؛ Agent هرگز مسیر را دستی نمی‌سازد.
- POI خارج از شهر/روستای مشخص، مستقیم زیر شهرستان یا استان (والد واقعی‌اش) ذخیره می‌شود؛ District و Rural District آن در `location` ثبت می‌شود.
- هر Entity فقط یک محل Canonical دارد.
- Relation فقط در `relations` و با Entity واقعیِ دارای فایل ثبت می‌شود.

## 5. ID، Slug، Name و زبان

### ID

ID باید یکتا و پایدار باشد:

```text
province-{n}
county-{province_id}-{n}
city-{province_id}-{n}
village-{province_id}-v{n}
place-{province_id}-{n}
```

- پیش از تخصیص ID، تمام مسیرهای خروجی و بخش `ID Registry` در `notes.md` بررسی می‌شوند.
- هر ID و slug جدید در جدول `ID Registry` notes ثبت می‌شود؛ تکرار ممنوع است.

### Slug

- lowercase ASCII؛ فقط `a-z`، `0-9` و `-`.
- فاصله به `-` تبدیل می‌شود؛ hyphen ابتدا/انتها یا تکراری ممنوع است.
- slug فارسی، underscore، علامت نگارشی و diacritics ممنوع است.
- Transliteration ثابت و قابل‌فهم باشد:

```text
آذربایجان شرقی → east-azerbaijan-province
مسجد کبود تبریز → tabriz-blue-mosque
کلیسای سنت استپانوس → saint-stephanos-monastery
```

### Name و زبان متن

- `name` فقط `fa` و در صورت وجود `en` دارد. `name.local` و `name.alternatives` ممنوع‌اند.
- انگلیسی در متن آزاد فقط در این سه مسیر مجاز است: `name.en`، `content.summary.en` و `content.description.en`.
- قانون زبان فقط برای متن آزاد است؛ ID، slug، enum، type، subType، categories و دیگر مقادیر فنی از آن مستثنا هستند.
- سایر متن‌ها مستقیم String فارسی‌اند، نه `{"fa":"..."}`:

```text
history, architecture, culture, whyVisit,
faq.question, faq.answer, tips,
seo.title, seo.description,
media.alt, media.caption,
localFoods.name/description, souvenirs.name/description
```

- `alternativeNames` فقط برای املای متفاوت، آوانگاری، نام تاریخی، نام رایج یا نام انگلیسی متفاوت از `name.en` است. `name.fa` و `name.en` عیناً تکرار نمی‌شوند.

## 5-1. سرعت بدون کاهش کیفیت

برای افزایش سرعت، تحقیق باید موازی باشد ولی ذخیره‌سازی و Git خطی بماند.
`costs` و `evidence` از قرارداد حذف شده‌اند و نباید دوباره تحقیق شوند.

```text
برای هر Entity جاری، هم‌زمان:
A. ساختار اداری، نام‌ها و جمعیت
B. مختصات، نشانی و نقشه
C. Placeها، Villageها و Camping
D. Sourceها (۵ Primary)
E. Media (Commons + جستجوی تصویر وب)
```

- ابتدا فقط فهرست کامل Candidateهای همان سطح را کشف و در notes/صف تحقیق ثبت کن؛ سپس همان County/City/Village را تا پایان چرخه کامل کن. تا تکمیل آن سطح به County بعدی نرو.
- Queryهای فارسی، انگلیسی و نام‌های جایگزین یک Entity را تا حد ممکن هم‌زمان اجرا کن.
- Searchهای مستقل Nominatim، OSM، Google Maps، Commons و پنج منبع Primary برای همان Entity موازی‌اند.
- از Source Matrix فشرده در notes استفاده کن تا Query یا Source بررسی‌شده دوباره‌کاری نشود.
- داده‌های واقعاً مشترک و Sourceدار، مانند نودهای حمل‌ونقل، مرز اداری و Sourceهای رسمی، در Reference مرکزی نگه‌داری و به Entityها ارجاع شوند؛ Fact اختصاصی هر Entity همچنان جدا تحقیق می‌شود.
- Media را به‌صورت یک Wave جدا برای همان Entity جمع کن؛ ابتدا Category و نام انگلیسی/فارسی Entity در Commons، سپس جستجوی تصویر وب عمومی (گوگل/بینگ، سایت‌های فارسی گردشگری و خبری) تا رسیدن به حداقلِ تصویرِ نوع همان Entity (§12).
- نوشتن JSON، Validation، به‌روزرسانی notes، Commit و Push فقط خطی و تک‌نخی انجام می‌شود تا Conflict و دوباره‌کاری ایجاد نشود.
- سرعت نباید با حذف Village، POI، Source، تصویر یا Cross-check بالا برود.

## 5-2. تازگی داده و زمان مرجع

- تاریخ مرجع پروژه: **۲۴ اوت ۲۰۲۶ / ۱۴۰۵** است.
- برای داده‌های متغیر، Queryهای ۱۴۰۵ و 2026 اولویت اول‌اند.
- قیمت، Cost، منو، ساعت کاری، ورودی، امکانات، حمل‌ونقل، Camping، تماس، وضعیت باز/بسته، وضعیت خدمات و تقسیمات جاری فقط با دادهٔ ۱۴۰۵/۲۰۲۶ به‌عنوان وضعیت فعلی ثبت می‌شوند.
- دادهٔ ۱۴۰۳ / 2024 برای وضعیت جاری کافی نیست. اگر فقط منبع قدیمی موجود بود، Agent آن را در notes به‌عنوان دادهٔ تاریخی ثبت و Search را ادامه می‌دهد؛ نباید آن را Current Fact در JSON معرفی کند.
- Factهای ثابت یا تاریخی مانند سال ساخت، ثبت ملی/جهانی، سرشماری رسمی یا جمعیت دوره‌ای می‌توانند منبع قدیمی‌تر داشته باشند، ولی سال و دوره باید صریحاً در متن بیاید.
- `accessedAt` تاریخ واقعی روز دسترسی است؛ نه تاریخ انتشار منبع.

## 6. Maximum Research Effort و Missing Data

- برای هر Entity تمام تلاش عملی و معقول برای کامل‌ترین، دقیق‌ترین و قابل‌استنادترین رکورد انجام شود.
- پیش از خالی‌گذاشتن یا حذف Fact مهم، Query فارسی، انگلیسی و نام جایگزین انجام شود؛ منابع اولویت‌دار و منابع معتبر دیگر Cross-check شوند.
- کم‌کاری، جست‌وجوی سطحی یا ساخت JSON صرفاً برای پرکردن فایل ممنوع است.
- حدس، Fact ساختگی، URL جعلی، عکس نامرتبط، `false` به‌جای Unknown، Object خالی و رشتهٔ خالی ممنوع است.
- اگر Object اختیاری داده ندارد، کل Object حذف می‌شود؛ `null` فقط در فیلدی مجاز است که Schema صریحاً آن را قبول کند و Object دادهٔ واقعی دیگری داشته باشد.
- Requiredهای Schema باید پیش از ذخیره با دادهٔ واقعی و Schema-valid کامل شوند.
- اگر Entity دادهٔ Required، به‌ویژه مختصات واقعی، ندارد: JSON ساخته نمی‌شود؛ Candidate با نام، سطح اداری، Queryها، URLهای بررسی‌شده و دلیل در notes ثبت می‌شود و پیش از پایان Scope دوباره پیگیری می‌شود.

## 7. منابع (فیلد evidence حذف شده)

سیاست منبع (`dataset/source_policy.json`) — پنج منبع Primary اجباری به ترتیب اولویت:

```text
۱) Kojaro (kojaro.com)   ۲) Jabama Mag (jabama.com)   ۳) Alibaba Mag (alibaba.ir)
۴) Lastsecond (lastsecond.ir)   ۵) Flytoday (flytoday.ir)
```

- Coverage اجباری (با `get_source_coverage` قابل‌استعلام، در DoD مسجل و در ذخیرهٔ ۰-عکس اجرا): هر نود Entity — استان/شهرستان/شهر/روستا/مکان/کمپینگ، بدون استثنا — باید در همهٔ ۵ منبع Primary attempted باشد؛ Coverage فقط با attempted یا ثبت صریحِ unavailable/unreachable برای هر ۵ منبع کامل می‌شود.
- Wikipedia / Wikimedia Commons فقط Fallback و Cross-check هستند و جای Primary را نمی‌گیرند؛ منابع خارج از سیاست (`other`) فقط با ثبت دلیل.
- تفکیک مهم: این ۵ منبع، منابع «FACT» اجباری‌اند؛ برای «عکس» سیاست جدا داریم (Media Sources در `source_policy.json` و §12): عکس از هر منبع مجازی فقط با بررسی مالکیت/انتساب و ثبت pageUrl + credit + license وارد Dataset می‌شود (لایسنس آزاد ترجیح دارد اما شرط نیست).
- منابع مکمل (بدون جایگزینی Primaryها):

```text
وب‌سایت‌های رسمی و دولتی، منابع محلی، Google Maps، OpenStreetMap، Nominatim,
Wikidata، Wikimedia Commons، Wikipedia، UNESCO، Eghamat24، Safarmarket، Kite، Mojekooh، Otaghak، MrBilit
```

- Address و Population: اولویت با رسمی/دولتی و منبع محلی.
- Coordinates: Nominatim، OpenStreetMap و Google Maps همگی جست‌وجو و Cross-check می‌شوند؛ اولویت تصمیم: Nominatim → OSM → Google Maps.
- ترتیب جستجوی هر Entity: ابتدا ۵ منبع Primary به ترتیب اولویت (Kojaro → Jabama → Alibaba → Lastsecond → Flytoday) و سپس منابع مکمل؛ نتیجهٔ هر Primary (حتی not-found) با record_search_result ثبت می‌شود و در شمارش Coverage همان Entity حساب می‌شود.
- برای جلوگیری از حجیم‌شدن notes، برای هر Entity فقط یک ردیف فشرده ثبت شود: `entity ID | 5 sites | query codes | found/not-found/not-relevant`. URL و جزئیات فقط برای Sourceهای واقعی/متناقض ثبت می‌شوند.
- برای Scope دست‌کم ۱۰ منبع متنوع بررسی می‌شود. برای هر Entity همهٔ Sourceهای واقعی و مرتبط ثبت می‌شوند؛ POI کوچک ممکن است یک Source معتبر داشته باشد، اما Fact حساس Cross-check می‌خواهد.
- فیلد `evidence` از قرارداد حذف شده است. `sources[]` همان منابع ثبت‌شده در Source Matrix هستند؛ Factها در متن Entity می‌آیند.
- URLها فقط URL خام HTTPS هستند؛ Markdown، `&amp;`، space و متن اضافی ممنوع است.
- اگر Source در گفت‌وگو یا ورودی به شکل Markdown رندر/ارسال شده است، مقصد لینک را استخراج و پیش از ذخیره به URL خام HTTPS تبدیل کن؛ ظاهر Markdown در پیام کاربر دلیل ردکردن خود Source نیست، اما همان رشته هرگز در JSON ذخیره نمی‌شود.

## 8. Coordinates، OSM و Address

- مختصات input ممنوع است.
- `latitude` و `longitude` اصلی Entity اجباری و واقعی‌اند.
- `boundingbox` فقط از Nominatim و با ترتیب `[lat_min, lat_max, lon_min, lon_max]` است.
- `osmRaw` و پاسخ خام Nominatim ذخیره نمی‌شود.
- اگر OSM/Nominatim داده دارد: `external.osmId`، `external.osmUrl` و `external.fetchedAt` ثبت می‌شوند.
- `external.osmUrl` URL خام درخواست API است، نه صفحهٔ نمایشی OSM:

```text
https://nominatim.openstreetmap.org/search?q=East%20Azerbaijan%20Iran&format=jsonv2&limit=3&accept-language=fa
```

- اگر OSM Result وجود ندارد ولی Google/Wikidata داده دارد، `external` می‌تواند فقط دادهٔ واقعی همان سرویس را داشته باشد.
- `location.address.full` اجباری و غیرخالی است؛ برای Province/County آدرس توصیفی اداریِ دقیق مجاز است، برای POI آدرس مکان واقعی لازم است.
- هر Transport Node که وارد شود، `name`، `latitude` و `longitude` واقعی و غیر-null دارد؛ در غیر این صورت کل Node حذف می‌شود.

## 9. Category، subType، Feature و Camping

- `categories` انگلیسی snake_case و مبتنی بر ماهیت واقعی‌اند؛ Tag فارسی و فراوان است.
- subType انگلیسی، lowercase و snake_case است. نمونه‌ها:

```text
province, county, waterfall, cave, spring, mountain, forest, lake, river,
valley, palace, castle, caravanserai, bridge, bathhouse, mosque, imamzadeh,
church, monastery, museum, bazaar, park, campground, hotel, restaurant
```

- Feature فقط از enum `features` Schema و با Evidence است. Boolean مستقلی مانند `camping: true` نساز.
- برای Camping جداگانه Query فارسی/انگلیسی انجام شود.
- اگر خود مکان Camping مجاز دارد: `features: ["camping"]` و Evidence/Tip واقعی.
- اگر کمپ‌گاه مجزا وجود دارد: Entity مستقل با `type: recreational` و `subType: campground` ساخته و با `nearby` Relation داده می‌شود.
- طبیعتی‌بودن منطقه به‌تنهایی Camping را ثابت نمی‌کند.

## 10. Deduplication و Relations

قبل از ساخت Entity جدید، نام، alternativeNames، مختصات، والد اداری، نوع، نشانی و Sourceها مقایسه شوند.

- اگر نام، والد اداری و مختصات نزدیک (حداکثر حدود `0.001°`، با بررسی دستی نقشه) یکسان‌اند، یک Entity ساخته و Sourceها ادغام شوند.
- اگر نام متفاوت اما مختصات/نشانی یکی است، نام‌های معتبر در `alternativeNames` ثبت می‌شوند.
- Deduplication تصمیم و دلیل آن در notes ثبت می‌شود.
- `parentId`، `children`، `nearbyPlaces`، `nearbyCities`، `osmRaw`، `name.local` و `name.alternatives` فیلدهای منسوخ و ممنوع‌اند.

## 11. Visit، Checklist و محتوای فارسی

- `visit` Required است و نباید Object خالی باشد؛ فقط اطلاعات واقعاً قابل‌اعمال و مستند وارد شود.
- `bestMonths`: فقط ماه‌هایی که Source معتبر صریحاً پیشنهاد می‌کند.
- `avoidMonths`: فقط ماه‌هایی که Source معتبر به‌دلیل خطر، بسته‌بودن یا شرایط نامناسب توصیه به پرهیز می‌کند.
- ماه‌های خارج از این دو آرایه «بهترین» یا «ممنوع» نیستند.
- `travelChecklist` Type-aware است.
- برای Province، County، City، Village، Natural Area، Route، Accommodation و Campground هر شش دستهٔ `tour`، `personalCar`، `airplane`، `camping`، `train` و `bus` Required هستند.
- مقادیر هر حالت فقط canonical id از `taxonomy/checklist-items.json` هستند (نه متن آزاد فارسی).
- برای تعداد آیتم‌های هر دسته هیچ سقف مصنوعی وجود ندارد؛ هرچه چک‌لیست کامل‌تر و واقعاً مفیدتر باشد بهتر است.
- Agent باید مسیر کامل سفر را از پیش از حرکت تا بازگشت تصور کند و همهٔ نیازهای واقعیِ مرتبط را بررسی کند: مدارک، رزرو/بلیت، پرداخت، ارتباط و برق، مسیریابی، خودرو، لباس، ایمنی، سلامت، غذا و آب، خواب و کمپ، بهداشت، کودک/خانواده و شرایط فصل/مقصد. فقط آیتم‌های واقعاً مرتبط با همان نوع سفر و مقصد ثبت می‌شوند.

```json
{
  "tour": ["کارت شناسایی", "عینک آفتابی", "شارژر همراه"],
  "personalCar": ["کارت سوخت", "نقشه آفلاین", "زنجیر چرخ"],
  "airplane": ["پاسپورت", "بلیت", "کارت شناسایی"],
  "camping": ["چادر", "کیسه خواب", "چراغ قوه", "آب کافی"],
  "train": ["بلیت قطار", "پاوربانک", "خوراکی مسیر"],
  "bus": ["بلیت رفت و برگشت", "بالش گردنی", "آب آشامیدنی"]
}
```

- برای POIهای کوچک مانند مسجد، موزه، رستوران، بازار، پارک شهری و فروشگاه، Checklist اختیاری است و فقط حالت‌های واقعاً مرتبط وارد می‌شود؛ هیچ Checklist جمله‌ای یا Filler نساز.
- راهنمای سفر منطقه‌ایِ POIهای کوچک از Entity والد مانند City یا County گرفته می‌شود.
- `faq` با Evidence واقعی؛ `tips` عمل‌گرا؛ `warnings` دسته‌بندی‌شده، دقیق و بدون ادعای مطلق‌اند.

### لحن برند

مرجع کامل و اجرایی لحن برند، سند واحد **«هویت کلامی و لحن برند — نسخه ۱.۰ نهایی»** در `dataset/brand_voice.md` است (حالت‌های زبانی، سیستم واژگان و لیست سیاه، فراخوان اقدام، صدای هوش مصنوعی، ۱۰۰ نمونه قبل/بعد، آزمون کیفیت + پیوست نمونهٔ کاربردی روی محتوای Dataset — ماسوله). در تعارض بین نمونه‌های قدیمی و قواعد آن سند، خودِ سند مرجع است.

هسته: «از نیت به تجربه» — ایده: «از بریم تا رفتیم» — پیام: «پیدا کن یا بساز. با هم برو.»

متن آرام، انسانی، دقیق و عمل‌گراست؛ اغراق، کلیشه، لحن رباتی، فناوری بی‌ربط و Fact بی‌منبع ممنوع است.

### قواعد اجرایی متن

- `content.description` ابتدا مکان و یک واقعیت قابل‌مشاهده یا قابل‌سنجش را روشن می‌کند؛ سپس، فقط وقتی Evidence دارد، یک قدم عملی کوچک و مرتبط پیشنهاد می‌دهد. دعوت عملی جای Fact و Evidence را نمی‌گیرد.
- `content.whyVisit` باید تجربه‌های واقعی همان مکان را نام ببرد؛ نه صفت‌های کلی مانند «بی‌نظیر»، «جادویی»، «شگفت‌انگیز»، «بهترین» یا «فراموش‌نشدنی».
- `history` فقط Fact تاریخ‌دار و Sourceدار دارد. `faq` دقیق و پاسخ‌گوست؛ `tips` کوتاه، مشخص و قابل‌عمل است؛ `warnings` دسته‌بندی‌شده، متناسب با خطر واقعی و بدون قطعیت‌نمایی است.
- فناوری، هوش مصنوعی، «سیستم هوشمند»، مدیریت پلتفرم و زبان محصول در متن مکان نمی‌آید، مگر این‌که خدمتِ واقعیِ قابل‌استفاده در همان مکان باشد و Evidence اختصاصی داشته باشد.
- ادعاهای رتبه‌بندی، برتری، یکتایی، «اولین»، «قدیمی‌ترین»، «بهترین زمان» و اعداد تبلیغاتی ممنوع‌اند و باید به بیان خنثی و Factمحور بازنویسی یا حذف شوند.
- از کلیشه‌های صنعت سفر و ساختارهای رباتی مانند «تجربه‌ای ... فراهم می‌کند»، «مقصدی ایده‌آل»، «مکان جادویی» و خطاب تبلیغاتی پرهیز کن. متن طبیعی و مشخص بنویس.
- نام‌بردن از مکان، غذا، اقامتگاه یا فعالیت دیگر فقط وقتی مجاز است که برای آن Entity مستقل یا Candidate مستند در notes وجود داشته باشد.

## 12. Media و حق کپی‌رایت — سیاست Best-Effort

- رسانه Best-Effort و غیرمسدودکننده است: Target «هدفِ تعداد عکس باکیفیت» است، نه حداقلِ اجباری؛ هیچ Entity به‌خاطر کمتر بودن از Target رد، discard یا media_deficit نمی‌شود.
- هدف تصویر متمایز (target): استان/شهرستان/شهر/مکان = ۱۰ | روستا/کمپینگ = ۳.
- قانون انتخاب نهایی: بهترینِ min(تعداد usable, target) تصویر ذخیره می‌شود — هرگز بیشتر از target؛ تامبنیل جزو همین بودجه است (بهترین → تامبنیل، بقیه تا سقف target → images). مثال: شهر با ۱۵ عکس usable → فقط بهترین ۱۰؛ روستا با ۱۸ عکس → فقط بهترین ۳.
- ۲۰ فقط سقف مطلق اعتبارسنجی است (schema maxItems / Quality Gate)؛ پایپ‌لاین استاندارد (finalize_media) هرگز بالای target ذخیره نمی‌کند و save_active_entity در صورت عبور از target هشدار trim می‌دهد.
- حداقلِ قابل‌ذخیره: ۱ تصویر قابل‌انتساب — حتی ۱ عکس هم ذخیره می‌شود (`media.status = partial`).
- بعد از Coverage کامل منابع Primary هیچ عکسی پیدا نشد → Entity بدون `media` با `mediaStatus = unavailable` ذخیره می‌شود (۰ عکس ≠ شکست)؛ ذخیرهٔ ۰-عکس پیش از Coverage کامل با خطای `MEDIA_ZERO_WITHOUT_PRIMARY_COVERAGE` رد می‌شود؛ دادهٔ فکت هرگز حذف نمی‌شود.
- `media.status` (سه‌حالته، خودکار توسط `save_active_entity` تزریق می‌شود): `complete` (رسیده به هدف) | `partial` (۱ تا هدف منهای ۱) | `unavailable` (۰ عکس).
- پایپ‌لاین رسانه: `record_media_candidate` (هر کاندید همان لحظه ثبت می‌شود؛ idempotent با nodeId+imageUrl؛ Audit Trail در notes) → جستجوی Exhaustive (هر ۵ منبع Primary + fallbackهای مجاز) → `finalize_media` (dedupe + رتبه‌بندی: score + لایسنس آزاد + منبع Primary؛ انتخاب = بهترین min(usable, target) با تامبنیل متمایز) → قرار دادن آبجکت در Entity و `save_active_entity`.
- منبع تصویر فقط ویکی‌مدیا نیست: جستجوی تصویر وب (Google/Bing Images)، پنج منبع Primary سیاست منبع (§7)، خبرگزاری‌ها، سایت‌های رسمی مکان‌ها و وبلاگ‌های معتبر مجازند.
- اولویت انتخاب: منابع Primary → Wikimedia Commons / Wikipedia → CC یا Public Domain روشن → تصاویر وب با لایسنس `all-rights-reserved` (با کردیت کامل و sourceUrl صفحهٔ منبع). لایسنس آزاد شرط نیست؛ شرط، قابل‌انتساب بودنِ واقعی تصویر به همان Entity است.
- برای رسیدن به هدف، عکس تکراری، نامرتبط یا غیرقابل‌انتساب (همسایه/والد) اضافه نکن؛ عکس جعلی ممنوع.
- دانلود تصویر ممنوع؛ فقط URL.
- هر تصویر URL خام، alt، caption، source، sourceUrl، credit و license واقعی (مطابق enum اسکیما، شامل all-rights-reserved) دارد. photographer فقط اگر در Metadata واقعی موجود است ثبت می‌شود.
- Map می‌تواند Media کمکی باشد، اما Thumbnail باید تا حد ممکن یک تصویر واقعی و نمایندهٔ تجربهٔ مکان باشد.
- `mark_node_media_deficit` فقط برای «نبودِ کل دادهٔ Entity» است؛ اگر حتی ۱ کاندید رسانهٔ usable ثبت شده باشد، ابزار رد می‌کند و مسیر صحیح `finalize_media` + ذخیرهٔ partial است.

## 13. هزینه‌های سفر — حذف‌شده

فیلد `costs` و مدل CPI (`iran-cpi.schema.json`) از قرارداد حذف شده‌اند.
Entity فعال دیگر `costs` ندارد و Agent نباید قیمت/هزینه را تحقیق یا ذخیره کند.
`place.schema.json` با `additionalProperties: false` هر `costs` باقی‌مانده را رد می‌کند.

## 14. Validation و Quality Gate

پیش از ذخیره، Agent باید هم تطابق ساختاری با JSON Schema و هم Quality Gate پژوهشی/بین‌فیلدی را بررسی کند. Schema به‌تنهایی فقط ساختار را کنترل می‌کند؛ اعتبار و مالکیت Source، وجود و معنای Relation، یکتایی Dataset، منطق سلسله‌مراتب و عدم تکرار Media کنترل‌های اجباری پیش از ذخیره‌اند.

رد فوری:

```text
- URL Markdown، URL غیر HTTPS یا &amp;
- برای رسانه (ساختاری، Best-Effort): بیشتر از ۲۰ تصویر، داشتن images بدون Thumbnail، تکرار URL در images یا با Thumbnail، یا ناسازگاری media.status با تعداد واقعی تصاویر (کم‌بودن عکس خطا نیست؛ partial/unavailable مجازند)
- Object خالی یا رشتهٔ خالی
- Required ناقص یا visit خالی
- Transport Node بدون مختصات واقعی
- Source نامرتبط یا ثبت‌نشده در Source Matrix
- Relation به Entity/فایل واقعی وجودنداشته
- Source title نامطابق با صفحه یا URL جعلی
```

اگر Validation ناموفق شد: خطا در notes ثبت، فیلد اصلاح، دوباره Validate و سپس ذخیره شود. رکورد ناقص راهی برای عبور از خطای Schema یا Fact ساختگی نیست.

## 14-1. استمرار اجباری و ممنوعیت پرسش میان کار

- بعد از دریافت `province_id`، Agent در هیچ مرحله‌ای برای انتخاب County، City، Village، POI، Source، مسیر تحقیق، Git، تصویر، هزینه یا ادامهٔ کار از کاربر سؤال نمی‌پرسد.
- Agent باید خودش با قواعد README، Schema، Search و notes تصمیم بگیرد و کار را پیوسته ادامه دهد.
- نبود Source، خطای یک وب‌سایت، تضاد اطلاعات، نبود تصویر، Push ناموفق، نام مبهم، Nominatim بدون نتیجه یا Validation خطا مجوز توقف یا پرسش نیست؛ مورد در notes ثبت، راه جایگزین بررسی و سپس کار بعدی ادامه می‌یابد.
- فقط در یک حالت سؤال مجاز است: `province_id` در ابتدای Task مشخص نشده باشد.
- Agent حق ندارد در هیچ شرایطی خودخواسته کار را متوقف، گزارش پایان، گزارش پیشرفت کاربرمحور یا درخواست دستور بعدی بدهد؛ تا Definition of Done باید ادامه دهد.
- اگر محیط اجرا Agent را اجباراً قطع کرد، Agent باید پیش از قطع‌شدن فقط Checkpoint واقعی در notes و Git ثبت کند؛ در اجرای بعدی بدون پرسش از اولین کار ناتمام ادامه می‌دهد.

## 15. notes.md و Git

`notes.md` در ریشهٔ استان است و همیشه به‌روز می‌شود:

```markdown
# Notes — {province_id}
- Last update: ...
- Scope: ...
- Scope status: in_progress | complete

## ID Registry
| id | slug | path | status |

## File / Entity status
| file | status | explanation |

## Research coverage
| entity | five random travel sites | query codes | result summary |

## Candidates / conflicts
- ...

## Next mandatory step
- ...

## Git
- last commit: ...
- last push: ...
```

- Git فقط وقتی کاربر در همان Task صریحاً فعال کرده اجرا می‌شود.
- در Task فعال: بعد از هر ۵ فایل تغییرکرده Commit و Push؛ Batch نهایی کمتر از ۵ هم Commit/Push می‌شود.
- **پوش کردن Output به Git اهمیت حیاتی ندارد**: Commit محلی Checkpoint واقعی است. اگر Push ممکن نبود یا شکست خورد، همان Commit محلی کافی است؛ شکست Push فقط در notes ثبت می‌شود و هرگز مجوز توقف، گزارش کاربرمحور یا درخواست تأیید نیست. اولویت Agent ساخت فایل‌های کامل Dataset در `output/{province_id}/` از مسیر MCP است، نه مدیریت Git.
- تحقیق می‌تواند موازی باشد؛ نوشتن فایل، notes، Commit و Push خطی و تک‌نخی است.
- Branch جدید ساخته نشود.

```text
add province {province_id} data batch
```

### زیپ نهایی Output

- فقط پس از پایان واقعی Scope (Definition of Done کامل + Validation پاس)، کل پوشهٔ `output/{province_id}/` یک‌جا زیپ می‌شود (مثلاً `output-{province_id}.zip` در ریشهٔ ریپو) و مسیر آن در گزارش نهایی می‌آید.
- زیپ جای چک‌پوینت‌های Git (Commit) را نمی‌گیرد؛ الویت ثبت پیشرفت با Commit است و Push اختیاری است.

## 16. Definition of Done

Scope فقط وقتی کامل است که:

- [ ] همهٔ واحدهای اداری و POIهای قابل‌کشف بررسی شده‌اند؛
- [ ] Camping جداگانه بررسی شده؛
- [ ] Deduplication، Relations و Canonical storage انجام شده؛
- [ ] همهٔ Requiredهای Schema و Quality Gate پاس شده‌اند؛
- [ ] URLها خام HTTPS و تصاویر غیرتکراری، دارای کردیت/منبع معتبر، حداکثر به اندازهٔ target (۱۰ برای استان/شهرستان/شهر/مکان، ۳ برای روستا/کمپینگ) و با media.status سازگار با تعداد واقعی‌اند؛
- [ ] منابع Primary در Source Matrix ثبت شده‌اند؛
- [ ] Coverage منابع Primary (§7) برای همهٔ نودهای Entity داخل Scope محقق شده (۵ از ۵ برای هر نود Entity، شامل روستا) و در notes مسجل است؛
- [ ] `notes.md`، ID Registry و Git checkpoint به‌روزند؛
- [ ] هیچ Candidate قابل‌پیگیری، Conflict قابل‌حل یا کار قابل‌انجامی باقی نمانده است.

فقط در این وضعیت گزارش نهایی شامل province_id، مسیر خروجی، تعداد رکورد، Validation، notes، آخرین Commit و مسیر بستهٔ زیپ نهایی داده می‌شود.

## 17. Discovery سلسله‌مراتبی و مالکیت Context

Discovery تخت ممنوع است. هر Node جغرافیایی هویت، Context، Query، Source Matrix، نتیجهٔ Search و Relation مستقل دارد. ترتیب کشف برای ایران چنین است:

`Province → County → District → Rural District → City / Village → Place`

- Search سطح والد فقط برای کشف Factها و Placeهای واقعاً متعلق به همان والد معتبر است. نتیجه، Source، تصویر، قیمت، ساعت، Fact یا متن استان را برای شهرستان؛ و دادهٔ شهرستان را برای شهر یا روستا reuse نکن.
- برای هر Node، Queryهای مستقل و نامِ کامل Context اجرا می‌شوند؛ نمونه: «جاهای دیدنی شهرستان فامنین»، «بخش‌های شهرستان فامنین»، «دهستان‌های شهرستان فامنین»، «شهرهای شهرستان فامنین»، «روستاهای شهرستان فامنین» و سپس برای هر City/Village: «جاهای دیدنی {نوع Node} {نام}».
- هر نتیجهٔ Search باید به Node و Query تولیدکننده‌اش در Source Matrix notes وصل باشد. نتیجهٔ Query «جاهای دیدنی استان همدان» بدون Source اختصاصی هرگز به فامنین نسبت داده نمی‌شود.
- پیش از عبور از یک Node، Candidateهای تقسیمات، شهرها، روستاها و Placeهای همان Node را expand، cross-check، deduplicate و به Entity یا Candidate مستند تبدیل کن. «چند نتیجهٔ اول» معیار کامل‌بودن نیست.
- هر Place دقیقاً به Parent جغرافیایی واقعی خود Relation می‌گیرد. داشتن یک Place در Province به معنای حضور آن در همهٔ County/City/Villageهای آن Province نیست.
- Source عمومی استان می‌تواند فقط برای Fact عمومیِ خود استان Reference باشد؛ جای Source اختصاصی County/City/Village، مختصات، هزینه، تصویر یا ادعای آن Node را نمی‌گیرد.

### Checklist و نمایش سلسله‌مراتبی

در دادهٔ فعلی، `travelChecklist` هر Entity یک چک‌لیست مستقل Type-aware است و برای Province/County/City/Village/Natural/Route/Accommodation/Campground شش دسته لازم دارد. این Schema هنوز فیلد `inheritsFrom` یا مدل delta-only ندارد؛ بنابراین Itemهای Parent را به Child کپی نکن، اما تا زمان طراحی صریح مدل inheritance، آیتم‌های لازم و واقعاً مرتبط همان Child را مطابق Schema ثبت کن.

لایهٔ نمایش می‌تواند Itemهای Parent و Child را با نرمال‌سازی عبارت و semantic deduplication ترکیب کند؛ اما این رفتار نمایش نباید با جعل یا کپی دادهٔ Child پیاده شود. برای تبدیل ذخیره‌سازی به مدل «فقط delta + inheritance» باید Schema، renderer و migration جداگانه طراحی و تصویب شود.
