# Planro Global Taxonomy

این پوشه تنها محل Taxonomy سراسری Planro است. Taxonomy هرگز داخل `output/{provinceId}` کپی یا ایجاد نمی‌شود.

## قواعد

- Entity فقط شناسه‌های canonical را ذخیره می‌کند؛ label فارسی از همین catalog قابل resolve است.
- `type` نوع اصلی Entity است.
- `subType` فقط وقتی مجاز است که در `subtypes.json` برای همان `type` ثبت شده باشد.
- `categories`، `activities`، `features`، `facilities` و `safety.risks` فقط از catalogهای همین پوشه قابل انتخاب‌اند.
- نام استان، شهرستان، شهر، روستا، POI، فصل، مقصد یا عبارت توصیفی نباید به taxonomy تبدیل شود.
- مفاهیم نزدیک باید تا حد ممکن merge شوند؛ taxonomy جای tags آزاد نیست.
- در صورت نبود مفهوم مناسب، Agent ابتدا همه catalogهای مرتبط را بررسی می‌کند و سپس فقط در `taxonomy/agent-taxonomy/proposals.json` پیشنهاد ثبت می‌کند.
- پیشنهاد Agent **قابل استفاده در Entity نیست** و تا promotion دستی maintainer، canonical محسوب نمی‌شود.

## Scope hierarchy
استان، شهرستان، بخش، دهستان، شهر و روستا، واحدهای جغرافیایی/اداری هستند و نباید به category تبدیل شوند.
