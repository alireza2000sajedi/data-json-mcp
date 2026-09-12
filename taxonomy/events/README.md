# Event Taxonomy (Planro)

سلسله‌مراتب رویداد برای میزبان/برنامه — از dump کپی‌شده پاکسازی و با قرارداد Taxonomy پلن‌رو و لحن `dataset/brand_voice.md` بازنویسی شده است.

**MCP:** از resourceهای MCP خارج است؛ `planro://taxonomy` فقط taxonomy مکان‌ها را می‌دهد.

## فایل‌ها

| File | نقش |
|---|---|
| `roots.json` | ریشهٔ سطح بالا (۶ حوزه) |
| `categories.json` | دسته‌های سطح ۱ (`rootId`) |
| `types.json` | نوع رویداد برگ (`categoryId` + `defaults` عملیاتی) |

## قرارداد آیتم

- `id`: انگلیسی `snake_case`
- `label`: فارسی کوتاه و طبیعی
- `description`: نوشتاری/مشاهده‌محور؛ می‌گوید کاربر واقعاً چه می‌کند (نه «رویداد X برای علاقه‌مندان»)
- `defaults`: پیشنهاد ظرفیت/قیمت/مهلت — قابل override در محصول؛ بخشی از هویت taxonomy نیستند

## بهبود نسبت به منبع کپی‌شده

- اسکواش از «تناسب» به `racket` منتقل شد
- «تناسب و ذهن‌وبدن» به `fitness` و `mind_body` شکسته شد
- شهربازی از ورزش تفریحی به `entertainment_venues` منتقل شد
- `group_psychology` زیر `discussion` آمد (نه دورهمی عمومی)
- نام‌های فارسی در `name` اصلاح شد: `squash`, `clay_play`, `name_surname_game`, `mobilegraphy`
- UUIDها، SVG خام و مسیر تصویر حذف شدند
- دستهٔ `content_creation` برای موبایل‌گرافی اضافه شد

این کاتالوگ جدا از Global Taxonomy مکان‌ها (`taxonomy/*.json`) است و فعلاً وارد enumهای `place.schema` نمی‌شود مگر promote جداگانه.
