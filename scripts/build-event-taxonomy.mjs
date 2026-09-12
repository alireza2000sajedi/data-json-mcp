/**
 * Builds cleaned Planro event taxonomy from the copied Weeos/API dump.
 * Conventions: snake_case ids, Persian labels, brand_voice descriptions (no fluff).
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve("taxonomy/events");
fs.mkdirSync(root, { recursive: true });

const roots = [
  {
    id: "sports",
    label: "ورزش و تناسب",
    description: "بازی تیمی، راکتی، تناسب، استقامت و فعالیت در طبیعت.",
  },
  {
    id: "arts_culture",
    label: "هنر و فرهنگ",
    description: "موسیقی، نمایش، رقص، هنرهای تجسمی، ادبیات و سینما.",
  },
  {
    id: "social",
    label: "دورهمی و اجتماع",
    description: "جمع‌شدن، غذا، گفت‌وگو و برنامه‌های گروهی در شهر یا طبیعت.",
  },
  {
    id: "learning",
    label: "آموزش و مهارت",
    description: "یادگیری زبان، فناوری و مهارت‌های محتوایی.",
  },
  {
    id: "entertainment",
    label: "سرگرمی و بازی",
    description: "مراکز تفریحی، بازی‌های گروهی، رقابتی و دیجیتال.",
  },
  {
    id: "business",
    label: "کسب‌وکار و حرفه‌ای",
    description: "شبکه‌سازی، استارتاپ، همایش و رویدادهای تجاری.",
  },
];

const categories = [
  // sports
  { id: "team_ball", rootId: "sports", label: "ورزش‌های تیمی و توپی", description: "فوتبال، فوتسال، بسکتبال، والیبال و مشابه." },
  { id: "racket", rootId: "sports", label: "ورزش‌های راکتی", description: "تنیس، پدل، بدمینتون، تنیس روی میز و اسکواش." },
  { id: "fitness", rootId: "sports", label: "تناسب و آمادگی جسمانی", description: "تمرین قدرتی، کراس‌فیت، شنا و ورزش‌های رزمی." },
  { id: "mind_body", rootId: "sports", label: "ذهن و بدن", description: "یوگا، پیلاتس و مدیتیشن." },
  { id: "endurance", rootId: "sports", label: "استقامتی و حرکتی", description: "دویدن، پیاده‌روی، دوچرخه و اسکیت." },
  { id: "outdoor_adventure", rootId: "sports", label: "طبیعت و ماجراجویی", description: "کوهنوردی، سنگ‌نوردی و طبیعت‌گردی." },
  { id: "recreational_games", rootId: "sports", label: "بازی‌های تفریحی رقابتی", description: "بولینگ، بیلیارد، دارت و پینت‌بال." },
  // arts
  { id: "performing_music", rootId: "arts_culture", label: "هنرهای نمایشی و موسیقی", description: "تئاتر، کنسرت و یادگیری ساز." },
  { id: "visual_arts_crafts", rootId: "arts_culture", label: "هنرهای تجسمی و صنایع‌دستی", description: "نقاشی، سفال، عکاسی و کارگاه‌های ساختنی." },
  { id: "dance", rootId: "arts_culture", label: "رقص", description: "سبک‌های دونفره، خیابانی، معاصر و آزاد." },
  { id: "literature", rootId: "arts_culture", label: "ادبیات", description: "کتاب‌خوانی، شعر، داستان و رونمایی کتاب." },
  { id: "cinema", rootId: "arts_culture", label: "سینما و نمایش فیلم", description: "سینما و پخش گروهی فیلم." },
  { id: "cultural_other", rootId: "arts_culture", label: "سایر فرهنگی", description: "رونمایی اثر و رویدادهای فرهنگی چندرشته‌ای." },
  // social
  { id: "social_gatherings", rootId: "social", label: "دورهمی‌های اجتماعی", description: "دورهمی عادی، موضوعی، پیک‌نیک و رستوران گروهی." },
  { id: "food_experiences", rootId: "social", label: "تجربه غذا و نوشیدنی", description: "آشپزی، شیرینی‌پزی، قهوه‌آزمایی و فستیوال غذا." },
  { id: "outdoor_social", rootId: "social", label: "دورهمی در طبیعت", description: "کمپینگ و رصد ستاره." },
  { id: "discussion", rootId: "social", label: "گفت‌وگو و خودشناسی", description: "گفت‌وگوی آزاد و جمع‌های روان‌شناسی غیر‌درمانی." },
  { id: "community_ceremonies", rootId: "social", label: "اجتماعی و مناسبتی", description: "افتتاحیه، خیریه و سایر مراسم جمعی." },
  // learning
  { id: "technology", rootId: "learning", label: "فناوری و برنامه‌نویسی", description: "کلاس و دورهمی فنی برنامه‌نویسی." },
  { id: "languages", rootId: "learning", label: "زبان", description: "تمرین و یادگیری زبان." },
  { id: "content_creation", rootId: "learning", label: "تولید محتوا", description: "مهارت‌های شبکه‌های اجتماعی و موبایل‌گرافی." },
  // entertainment
  { id: "entertainment_venues", rootId: "entertainment", label: "مراکز تفریحی", description: "شهربازی، پارک آبی و کارائوکه." },
  { id: "adventure_games", rootId: "entertainment", label: "ماجراجویی و رقابت", description: "اتاق فرار، لیزرتگ و بازی‌های رقابتی گروهی." },
  { id: "tabletop_social", rootId: "entertainment", label: "بازی‌های رومیزی و اجتماعی", description: "بردگیم، شطرنج، مافیا، پانتومیم و کوئیز." },
  { id: "digital_games", rootId: "entertainment", label: "دیجیتال و فراگیر", description: "گیم‌نت و واقعیت مجازی." },
  // business
  { id: "business_events", rootId: "business", label: "رویدادهای تجاری", description: "همایش، نمایشگاه و افتتاحیه کسب‌وکار." },
  { id: "pitch_investment", rootId: "business", label: "ارائه و سرمایه‌گذاری", description: "پچ ایده یا محصول و جلسه سرمایه‌گذاری." },
  { id: "startup_career", rootId: "business", label: "استارتاپ و مسیر شغلی", description: "رویداد استارتاپی، فرصت شغلی و تست محصول." },
  { id: "professional_networking", rootId: "business", label: "شبکه‌سازی حرفه‌ای", description: "شبکه‌سازی و دورهمی تخصصی." },
];

/** @type {Array<{id:string,label:string,categoryId:string,description:string,defaults:object}>} */
const types = [
  // team_ball
  { id: "football", label: "فوتبال", categoryId: "team_ball", description: "مسابقه یا تمرین فوتبال با ترکیب کامل.", defaults: { minParticipants: 14, maxParticipants: 22, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 200000, priceCourse: 0 } },
  { id: "futsal", label: "فوتسال", categoryId: "team_ball", description: "بازی فوتسال روی زمین سالنی با تیم کوچک.", defaults: { minParticipants: 8, maxParticipants: 12, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 150000, priceCourse: 0 } },
  { id: "basketball", label: "بسکتبال", categoryId: "team_ball", description: "تمرین یا مسابقه بسکتبال گروهی.", defaults: { minParticipants: 6, maxParticipants: 12, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 120000, priceCourse: 0 } },
  { id: "volleyball", label: "والیبال", categoryId: "team_ball", description: "بازی والیبال با تیم‌های کوچک.", defaults: { minParticipants: 8, maxParticipants: 14, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 120000, priceCourse: 0 } },
  { id: "padbol", label: "پدبال", categoryId: "team_ball", description: "بازی پدبال؛ ترکیبی از فوتبال و راکت روی زمین مخصوص.", defaults: { minParticipants: 2, maxParticipants: 8, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 0, priceCourse: 0 } },

  // racket (squash moved here from fitness)
  { id: "tennis", label: "تنیس", categoryId: "racket", description: "بازی تنیس دونفره یا چهارنفره.", defaults: { minParticipants: 2, maxParticipants: 4, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 250000, priceCourse: 0 } },
  { id: "padel", label: "پدل", categoryId: "racket", description: "پدل چهارنفره روی زمین محصور.", defaults: { minParticipants: 4, maxParticipants: 4, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 300000, priceCourse: 0 } },
  { id: "badminton", label: "بدمینتون", categoryId: "racket", description: "بدمینتون دونفره یا چهارنفره.", defaults: { minParticipants: 2, maxParticipants: 8, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 100000, priceCourse: 0 } },
  { id: "table_tennis", label: "تنیس روی میز", categoryId: "racket", description: "تنیس روی میز؛ کوتاه و قابل تکرار.", defaults: { minParticipants: 2, maxParticipants: 8, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 80000, priceCourse: 0 } },
  { id: "squash", label: "اسکواش", categoryId: "racket", description: "اسکواش در زمین بسته؛ دونفره یا تمرینی.", defaults: { minParticipants: 2, maxParticipants: 4, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 0, priceCourse: 0 } },

  // fitness
  { id: "crossfit", label: "کراس‌فیت", categoryId: "fitness", description: "تمرین گروهی شدت‌بالا با حرکات ترکیبی.", defaults: { minParticipants: 6, maxParticipants: 20, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 180000, priceCourse: 1500000 } },
  { id: "bodybuilding", label: "بدنسازی", categoryId: "fitness", description: "تمرین قدرتی گروهی در باشگاه.", defaults: { minParticipants: 4, maxParticipants: 20, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 200000, priceCourse: 1500000 } },
  { id: "swimming", label: "شنا", categoryId: "fitness", description: "شنای تمرینی یا آزاد در استخر.", defaults: { minParticipants: 4, maxParticipants: 25, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 180000, priceCourse: 0 } },
  { id: "martial_arts", label: "ورزش‌های رزمی", categoryId: "fitness", description: "تمرین یا کلاس ورزش‌های رزمی.", defaults: { minParticipants: 5, maxParticipants: 20, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 150000, priceCourse: 1200000 } },

  // mind_body (split from fitness)
  { id: "yoga", label: "یوگا", categoryId: "mind_body", description: "جلسه یوگا با تمرکز روی تنفس و حرکت.", defaults: { minParticipants: 5, maxParticipants: 15, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 100000, priceCourse: 800000 } },
  { id: "pilates", label: "پیلاتس", categoryId: "mind_body", description: "تمرین پیلاتس برای کنترل بدن و ثبات مرکزی.", defaults: { minParticipants: 5, maxParticipants: 15, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 150000, priceCourse: 1200000 } },
  { id: "meditation", label: "مدیتیشن", categoryId: "mind_body", description: "نشست کوتاه مدیتیشن گروهی.", defaults: { minParticipants: 5, maxParticipants: 20, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 100000, priceCourse: 0 } },

  // endurance
  { id: "running", label: "دویدن", categoryId: "endurance", description: "دویدن گروهی در مسیر شهری یا پارک.", defaults: { minParticipants: 5, maxParticipants: 50, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 0, priceCourse: 0 } },
  { id: "walking", label: "پیاده‌روی", categoryId: "endurance", description: "پیاده‌روی گروهی با سرعت قابل تنظیم.", defaults: { minParticipants: 5, maxParticipants: 50, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 0, priceCourse: 0 } },
  { id: "cycling", label: "دوچرخه‌سواری", categoryId: "endurance", description: "مسیر دوچرخه گروهی داخل یا اطراف شهر.", defaults: { minParticipants: 5, maxParticipants: 30, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 50000, priceCourse: 0 } },
  { id: "skating", label: "اسکیت", categoryId: "endurance", description: "اسکیت گروهی در پیست یا مسیر مناسب.", defaults: { minParticipants: 4, maxParticipants: 20, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 100000, priceCourse: 0 } },

  // outdoor_adventure
  { id: "hiking_mountaineering", label: "کوهنوردی و کوه‌پیمایی", categoryId: "outdoor_adventure", description: "صعود یا پیمایش کوهستانی با برنامه مشخص.", defaults: { minParticipants: 5, maxParticipants: 30, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 50000, priceCourse: 0 } },
  { id: "climbing_bouldering", label: "سنگ‌نوردی و بولدرینگ", categoryId: "outdoor_adventure", description: "سنگ‌نوردی سالنی یا بولدرینگ؛ تنها هم می‌شود آمد.", defaults: { minParticipants: 3, maxParticipants: 15, quorumDeadlineHoursBeforeStart: 12, minimumLeadTimeHoursBeforeStart: 24, price: 150000, priceCourse: 0 } },
  { id: "nature_touring", label: "طبیعت‌گردی", categoryId: "outdoor_adventure", description: "گشت کوتاه در طبیعت بدون صعود فنی.", defaults: { minParticipants: 5, maxParticipants: 40, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 100000, priceCourse: 0 } },

  // recreational_games (amusement_park moved out)
  { id: "bowling", label: "بولینگ", categoryId: "recreational_games", description: "چند فریم بولینگ گروهی.", defaults: { minParticipants: 4, maxParticipants: 12, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 200000, priceCourse: 0 } },
  { id: "billiards", label: "بیلیارد", categoryId: "recreational_games", description: "بیلیارد دونفره یا چند میز موازی.", defaults: { minParticipants: 2, maxParticipants: 8, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 150000, priceCourse: 0 } },
  { id: "darts", label: "دارت", categoryId: "recreational_games", description: "دارت رقابتی کوتاه و قابل تکرار.", defaults: { minParticipants: 2, maxParticipants: 12, quorumDeadlineHoursBeforeStart: 6, minimumLeadTimeHoursBeforeStart: 12, price: 100000, priceCourse: 0 } },
  { id: "paintball", label: "پینت‌بال", categoryId: "recreational_games", description: "بازی پینت‌بال تیمی در زمین اختصاصی.", defaults: { minParticipants: 8, maxParticipants: 20, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 300000, priceCourse: 0 } },

  // performing_music
  { id: "theater", label: "تئاتر", categoryId: "performing_music", description: "دیدن یا تمرین اجرای تئاتر.", defaults: { minParticipants: 5, maxParticipants: 100, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 0, priceCourse: 0 } },
  { id: "concert_music_performance", label: "کنسرت و اجرای موسیقی", categoryId: "performing_music", description: "کنسرت یا اجرای زنده موسیقی.", defaults: { minParticipants: 10, maxParticipants: 200, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 0, priceCourse: 0 } },
  { id: "guitar", label: "گیتار", categoryId: "performing_music", description: "کلاس یا دورهمی تمرین گیتار.", defaults: { minParticipants: 3, maxParticipants: 12, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 0, priceCourse: 1500000 } },
  { id: "piano", label: "پیانو", categoryId: "performing_music", description: "کلاس یا تمرین گروهی پیانو.", defaults: { minParticipants: 3, maxParticipants: 10, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 0, priceCourse: 1800000 } },

  // visual_arts_crafts
  { id: "painting", label: "نقاشی", categoryId: "visual_arts_crafts", description: "کارگاه یا جلسه نقاشی با خروجی قابل بردن.", defaults: { minParticipants: 4, maxParticipants: 16, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 0, priceCourse: 1200000 } },
  { id: "calligraphy", label: "خوشنویسی", categoryId: "visual_arts_crafts", description: "تمرین خوشنویسی در جمع کوچک.", defaults: { minParticipants: 4, maxParticipants: 20, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 0, priceCourse: 1000000 } },
  { id: "pottery", label: "سفالگری", categoryId: "visual_arts_crafts", description: "کار با گل و ساخت قطعه سفالی.", defaults: { minParticipants: 4, maxParticipants: 18, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 0, priceCourse: 0 } },
  { id: "photography", label: "عکاسی", categoryId: "visual_arts_crafts", description: "خروج گروهی عکاسی یا نقد عکس.", defaults: { minParticipants: 4, maxParticipants: 20, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 0, priceCourse: 1200000 } },
  { id: "exhibition_gallery", label: "نمایشگاه و گالری", categoryId: "visual_arts_crafts", description: "بازدید گروهی از نمایشگاه یا گالری.", defaults: { minParticipants: 5, maxParticipants: 100, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 0, priceCourse: 0 } },
  { id: "candle_making", label: "شمع‌سازی", categoryId: "visual_arts_crafts", description: "کارگاه شمع‌سازی؛ ساخته را با خودت می‌بری.", defaults: { minParticipants: 4, maxParticipants: 16, quorumDeadlineHoursBeforeStart: 12, minimumLeadTimeHoursBeforeStart: 24, price: 0, priceCourse: 1200000 } },
  { id: "jewelry_making", label: "ساخت زیورآلات", categoryId: "visual_arts_crafts", description: "ساخت زیورآلات دست‌ساز با خروجی فیزیکی.", defaults: { minParticipants: 4, maxParticipants: 12, quorumDeadlineHoursBeforeStart: 12, minimumLeadTimeHoursBeforeStart: 24, price: 0, priceCourse: 1200000 } },
  { id: "flower_arranging", label: "گل‌آرایی", categoryId: "visual_arts_crafts", description: "کارگاه گل‌آرایی با خروجی قابل بردن.", defaults: { minParticipants: 4, maxParticipants: 16, quorumDeadlineHoursBeforeStart: 12, minimumLeadTimeHoursBeforeStart: 24, price: 0, priceCourse: 1200000 } },
  { id: "terrarium_making", label: "ساخت تراریوم", categoryId: "visual_arts_crafts", description: "ساخت تراریوم شیشه‌ای؛ باغ کوچکی که می‌بری.", defaults: { minParticipants: 4, maxParticipants: 12, quorumDeadlineHoursBeforeStart: 12, minimumLeadTimeHoursBeforeStart: 24, price: 0, priceCourse: 1200000 } },
  { id: "clay_play", label: "خمیر بازی", categoryId: "visual_arts_crafts", description: "کار خلاقانه با خمیر یا گل بازی.", defaults: { minParticipants: 1, maxParticipants: 50, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 0, priceCourse: 0 } },

  // dance
  { id: "salsa_dance", label: "رقص سالسا", categoryId: "dance", description: "کلاس یا شب سالسا؛ دونفره و گروهی.", defaults: { minParticipants: 6, maxParticipants: 24, quorumDeadlineHoursBeforeStart: 12, minimumLeadTimeHoursBeforeStart: 24, price: 0, priceCourse: 1200000 } },
  { id: "bachata_dance", label: "رقص باچاتا", categoryId: "dance", description: "کلاس یا شب باچاتا از مبتدی تا پیشرفته.", defaults: { minParticipants: 6, maxParticipants: 24, quorumDeadlineHoursBeforeStart: 12, minimumLeadTimeHoursBeforeStart: 24, price: 0, priceCourse: 1200000 } },
  { id: "hiphop_dance", label: "رقص هیپ‌هاپ", categoryId: "dance", description: "کلاس یا جم هیپ‌هاپ و رقص خیابانی.", defaults: { minParticipants: 5, maxParticipants: 25, quorumDeadlineHoursBeforeStart: 12, minimumLeadTimeHoursBeforeStart: 24, price: 0, priceCourse: 1200000 } },
  { id: "contemporary_dance", label: "رقص معاصر", categoryId: "dance", description: "کلاس یا اجرای رقص معاصر.", defaults: { minParticipants: 5, maxParticipants: 20, quorumDeadlineHoursBeforeStart: 12, minimumLeadTimeHoursBeforeStart: 24, price: 0, priceCourse: 1200000 } },
  { id: "freestyle_dance", label: "رقص آزاد", categoryId: "dance", description: "شب رقص آزاد گروهی بدون سبک ثابت.", defaults: { minParticipants: 6, maxParticipants: 40, quorumDeadlineHoursBeforeStart: 12, minimumLeadTimeHoursBeforeStart: 24, price: 100000, priceCourse: 0 } },

  // literature
  { id: "book_reading_review", label: "کتاب‌خوانی و نقد کتاب", categoryId: "literature", description: "خواندن و گفت‌وگو درباره یک کتاب.", defaults: { minParticipants: 4, maxParticipants: 30, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 0, priceCourse: 0 } },
  { id: "poetry_story_night", label: "شب شعر و داستان", categoryId: "literature", description: "خواندن شعر و داستان در جمع.", defaults: { minParticipants: 5, maxParticipants: 50, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 0, priceCourse: 0 } },
  { id: "book_unveiling", label: "رونمایی کتاب", categoryId: "literature", description: "رونمایی و معرفی کتاب تازه منتشرشده.", defaults: { minParticipants: 10, maxParticipants: 100, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 0, priceCourse: 0 } },

  // cinema
  { id: "cinema", label: "سینما", categoryId: "cinema", description: "دیدن فیلم با هم در سینما.", defaults: { minParticipants: 5, maxParticipants: 100, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 0, priceCourse: 0 } },
  { id: "outdoor_film_screening", label: "پخش فیلم در طبیعت", categoryId: "cinema", description: "نمایش گروهی فیلم در فضای باز.", defaults: { minParticipants: 10, maxParticipants: 100, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 50000, priceCourse: 0 } },

  // cultural_other
  { id: "artwork_unveiling", label: "رونمایی اثر هنری", categoryId: "cultural_other", description: "رونمایی و بازدید از اثر هنری.", defaults: { minParticipants: 10, maxParticipants: 100, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 0, priceCourse: 0 } },
  { id: "other_cultural_event", label: "سایر رویدادهای فرهنگی", categoryId: "cultural_other", description: "رویداد فرهنگی که در دسته‌های دیگر جا نمی‌گیرد.", defaults: { minParticipants: 4, maxParticipants: 50, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 0, priceCourse: 0 } },

  // social_gatherings
  { id: "casual_gathering", label: "دورهمی عادی", categoryId: "social_gatherings", description: "جمع خودمانی بدون موضوع ثابت.", defaults: { minParticipants: 4, maxParticipants: 40, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 0, priceCourse: 0 } },
  { id: "themed_gathering", label: "دورهمی موضوعی", categoryId: "social_gatherings", description: "دورهمی حول یک موضوع مشخص.", defaults: { minParticipants: 4, maxParticipants: 40, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 0, priceCourse: 0 } },
  { id: "picnic", label: "پیک‌نیک", categoryId: "social_gatherings", description: "پیک‌نیک گروهی در پارک یا فضای سبز.", defaults: { minParticipants: 5, maxParticipants: 40, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 50000, priceCourse: 0 } },
  { id: "group_restaurant", label: "رستوران گروهی", categoryId: "social_gatherings", description: "غذا خوردن با هم در رستوران.", defaults: { minParticipants: 4, maxParticipants: 20, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 0, priceCourse: 0 } },

  // food_experiences
  { id: "cooking_class", label: "آشپزی", categoryId: "food_experiences", description: "کارگاه آشپزی گروهی با میزبان یا شف.", defaults: { minParticipants: 4, maxParticipants: 12, quorumDeadlineHoursBeforeStart: 12, minimumLeadTimeHoursBeforeStart: 24, price: 0, priceCourse: 1500000 } },
  { id: "baking_pastry", label: "شیرینی‌پزی", categoryId: "food_experiences", description: "کارگاه شیرینی‌پزی و قنادی.", defaults: { minParticipants: 4, maxParticipants: 12, quorumDeadlineHoursBeforeStart: 12, minimumLeadTimeHoursBeforeStart: 24, price: 0, priceCourse: 1500000 } },
  { id: "coffee_tasting", label: "قهوه‌آزمایی", categoryId: "food_experiences", description: "چشیدن و مقایسه چند قهوه در جمع کوچک.", defaults: { minParticipants: 4, maxParticipants: 12, quorumDeadlineHoursBeforeStart: 12, minimumLeadTimeHoursBeforeStart: 24, price: 150000, priceCourse: 0 } },
  { id: "food_festival", label: "فستیوال غذا", categoryId: "food_experiences", description: "حضور گروهی در فستیوال یا جشن غذا.", defaults: { minParticipants: 10, maxParticipants: 100, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 0, priceCourse: 0 } },

  // outdoor_social
  { id: "camping", label: "کمپینگ", categoryId: "outdoor_social", description: "اقامت گروهی یک‌شب یا چندساعته در طبیعت.", defaults: { minParticipants: 5, maxParticipants: 30, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 150000, priceCourse: 0 } },
  { id: "stargazing", label: "رصد ستاره‌ها", categoryId: "outdoor_social", description: "رصد آسمان شب بیرون شهر، جایی با آسمان صاف.", defaults: { minParticipants: 5, maxParticipants: 30, quorumDeadlineHoursBeforeStart: 24, minimumLeadTimeHoursBeforeStart: 48, price: 50000, priceCourse: 0 } },

  // discussion
  { id: "free_discussion", label: "گفت‌وگوی آزاد", categoryId: "discussion", description: "گفت‌وگوی باز حول موضوع یا بدون موضوع ثابت.", defaults: { minParticipants: 4, maxParticipants: 30, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 0, priceCourse: 0 } },
  { id: "group_psychology", label: "گفت‌وگوی روان‌شناسی و خودشناسی", categoryId: "discussion", description: "گفت‌وگوی گروهی درباره خودشناسی و روابط؛ جایگزین درمان نیست.", defaults: { minParticipants: 5, maxParticipants: 20, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 0, priceCourse: 0 } },

  // community_ceremonies
  { id: "opening_ceremony", label: "مراسم افتتاحیه", categoryId: "community_ceremonies", description: "افتتاحیه مکان یا برنامه جمعی.", defaults: { minParticipants: 10, maxParticipants: 100, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 0, priceCourse: 0 } },
  { id: "charity_event", label: "خیریه", categoryId: "community_ceremonies", description: "برنامه خیریه یا جمع‌آوری کمک.", defaults: { minParticipants: 10, maxParticipants: 100, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 0, priceCourse: 0 } },
  { id: "other_gathering", label: "سایر دورهمی‌ها", categoryId: "community_ceremonies", description: "دورهمی‌ای که در دسته‌های دیگر جا نمی‌گیرد.", defaults: { minParticipants: 4, maxParticipants: 50, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 0, priceCourse: 0 } },

  // learning
  { id: "programming", label: "برنامه‌نویسی", categoryId: "technology", description: "کلاس یا دورهمی تمرین برنامه‌نویسی.", defaults: { minParticipants: 5, maxParticipants: 25, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 0, priceCourse: 2000000 } },
  { id: "english_language", label: "زبان انگلیسی", categoryId: "languages", description: "تمرین مکالمه یا کلاس زبان انگلیسی.", defaults: { minParticipants: 5, maxParticipants: 25, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 0, priceCourse: 1800000 } },
  { id: "mobilegraphy", label: "موبایل‌گرافی", categoryId: "content_creation", description: "عکاسی و تولید محتوا با موبایل.", defaults: { minParticipants: 4, maxParticipants: 20, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 0, priceCourse: 0 } },

  // entertainment_venues (amusement_park moved here)
  { id: "amusement_park", label: "شهربازی", categoryId: "entertainment_venues", description: "رفتن گروهی به شهربازی.", defaults: { minParticipants: 3, maxParticipants: 40, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 0, priceCourse: 0 } },
  { id: "water_park", label: "پارک آبی", categoryId: "entertainment_venues", description: "رفتن گروهی به پارک آبی.", defaults: { minParticipants: 4, maxParticipants: 40, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 0, priceCourse: 0 } },
  { id: "karaoke", label: "کارائوکه", categoryId: "entertainment_venues", description: "شب کارائوکه گروهی.", defaults: { minParticipants: 4, maxParticipants: 30, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 0, priceCourse: 0 } },

  // adventure_games
  { id: "escape_room", label: "اتاق فرار", categoryId: "adventure_games", description: "حل معما و خروج از اتاق فرار به‌صورت تیمی.", defaults: { minParticipants: 4, maxParticipants: 10, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 250000, priceCourse: 0 } },
  { id: "laser_tag", label: "لیزرتگ", categoryId: "adventure_games", description: "بازی لیزرتگ تیمی در زمین مخصوص.", defaults: { minParticipants: 6, maxParticipants: 20, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 250000, priceCourse: 0 } },
  { id: "name_surname_game", label: "بازی اسم فامیل", categoryId: "adventure_games", description: "بازی گروهی اسم فامیل با کاغذ یا دیجیتال.", defaults: { minParticipants: 4, maxParticipants: 50, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 0, priceCourse: 0 } },

  // tabletop_social
  { id: "board_games", label: "بازی‌های رومیزی", categoryId: "tabletop_social", description: "چند بازی رومیزی پشت سر هم در جمع.", defaults: { minParticipants: 4, maxParticipants: 16, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 100000, priceCourse: 0 } },
  { id: "chess", label: "شطرنج", categoryId: "tabletop_social", description: "بازی یا تورنمنت سبک شطرنج.", defaults: { minParticipants: 2, maxParticipants: 16, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 50000, priceCourse: 0 } },
  { id: "mafia", label: "مافیا", categoryId: "tabletop_social", description: "بازی نقش‌محور مافیا در جمع.", defaults: { minParticipants: 8, maxParticipants: 20, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 100000, priceCourse: 0 } },
  { id: "pantomime", label: "پانتومیم", categoryId: "tabletop_social", description: "پانتومیم گروهی بدون نیاز به ابزار خاص.", defaults: { minParticipants: 6, maxParticipants: 30, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 0, priceCourse: 0 } },
  { id: "trivia_quiz_night", label: "کوئیز و اطلاعات عمومی", categoryId: "tabletop_social", description: "شب کوئیز گروهی؛ حتی یک میز کافه کافی است.", defaults: { minParticipants: 4, maxParticipants: 24, quorumDeadlineHoursBeforeStart: 12, minimumLeadTimeHoursBeforeStart: 24, price: 100000, priceCourse: 0 } },

  // digital_games
  { id: "gaming_center", label: "گیم‌نت", categoryId: "digital_games", description: "بازی گروهی در گیم‌نت.", defaults: { minParticipants: 2, maxParticipants: 20, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 100000, priceCourse: 0 } },
  { id: "virtual_reality", label: "واقعیت مجازی", categoryId: "digital_games", description: "تجربه VR گروهی در مرکز مخصوص.", defaults: { minParticipants: 2, maxParticipants: 12, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 150000, priceCourse: 0 } },

  // business
  { id: "business_exhibition", label: "نمایشگاه تجاری", categoryId: "business_events", description: "حضور در نمایشگاه تجاری.", defaults: { minParticipants: 10, maxParticipants: 200, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 0, priceCourse: 0 } },
  { id: "conference", label: "همایش", categoryId: "business_events", description: "همایش یا نشست عمومی کسب‌وکار.", defaults: { minParticipants: 10, maxParticipants: 200, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 0, priceCourse: 0 } },
  { id: "business_launch", label: "افتتاحیه و رونمایی کسب‌وکار", categoryId: "business_events", description: "افتتاحیه یا رونمایی محصول/کسب‌وکار.", defaults: { minParticipants: 10, maxParticipants: 150, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 0, priceCourse: 0 } },
  { id: "idea_product_pitch", label: "ارائه ایده یا محصول", categoryId: "pitch_investment", description: "ارائه کوتاه ایده یا محصول به جمع.", defaults: { minParticipants: 5, maxParticipants: 80, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 0, priceCourse: 0 } },
  { id: "investment_meeting", label: "جلسه سرمایه‌گذاری", categoryId: "pitch_investment", description: "نشست معرفی برای جذب سرمایه.", defaults: { minParticipants: 3, maxParticipants: 30, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 0, priceCourse: 0 } },
  { id: "startup_event", label: "رویداد استارتاپی", categoryId: "startup_career", description: "برنامه استارتاپی؛ معرفی، پنل یا ورکشاپ.", defaults: { minParticipants: 10, maxParticipants: 150, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 0, priceCourse: 0 } },
  { id: "job_opportunity_introduction", label: "معرفی فرصت شغلی", categoryId: "startup_career", description: "معرفی موقعیت شغلی به جمع علاقه‌مند.", defaults: { minParticipants: 5, maxParticipants: 80, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 0, priceCourse: 0 } },
  { id: "product_testing", label: "تست محصول", categoryId: "startup_career", description: "آزمایش گروهی محصول و گرفتن بازخورد.", defaults: { minParticipants: 5, maxParticipants: 50, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 0, priceCourse: 0 } },
  { id: "networking", label: "شبکه‌سازی", categoryId: "professional_networking", description: "آشنایی حرفه‌ای و تبادل ارتباط.", defaults: { minParticipants: 5, maxParticipants: 80, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 0, priceCourse: 0 } },
  { id: "specialist_gathering", label: "دورهمی تخصصی", categoryId: "professional_networking", description: "جمع متخصصان یک حوزه مشخص.", defaults: { minParticipants: 5, maxParticipants: 60, quorumDeadlineHoursBeforeStart: 4, minimumLeadTimeHoursBeforeStart: 48, price: 0, priceCourse: 0 } },
];

function write(name, data) {
  const file = path.join(root, name);
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log(`wrote ${file} (${data.items.length} items)`);
}

write("roots.json", { version: "1.0.0", items: roots });
write("categories.json", { version: "1.0.0", items: categories });
write("types.json", { version: "1.0.0", items: types });

const readme = `# Event Taxonomy (Planro)

سلسله‌مراتب رویداد برای میزبان/برنامه — از dump کپی‌شده پاکسازی و با قرارداد Taxonomy پلن‌رو و لحن \`dataset/brand_voice.md\` بازنویسی شده است.

## فایل‌ها

| File | نقش |
|---|---|
| \`roots.json\` | ریشهٔ سطح بالا (۶ حوزه) |
| \`categories.json\` | دسته‌های سطح ۱ (\`rootId\`) |
| \`types.json\` | نوع رویداد برگ (\`categoryId\` + \`defaults\` عملیاتی) |

## قرارداد آیتم

- \`id\`: انگلیسی \`snake_case\`
- \`label\`: فارسی کوتاه و طبیعی
- \`description\`: نوشتاری/مشاهده‌محور؛ می‌گوید کاربر واقعاً چه می‌کند (نه «رویداد X برای علاقه‌مندان»)
- \`defaults\`: پیشنهاد ظرفیت/قیمت/مهلت — قابل override در محصول؛ بخشی از هویت taxonomy نیستند

## بهبود نسبت به منبع کپی‌شده

- اسکواش از «تناسب» به \`racket\` منتقل شد
- «تناسب و ذهن‌وبدن» به \`fitness\` و \`mind_body\` شکسته شد
- شهربازی از ورزش تفریحی به \`entertainment_venues\` منتقل شد
- \`group_psychology\` زیر \`discussion\` آمد (نه دورهمی عمومی)
- نام‌های فارسی در \`name\` اصلاح شد: \`squash\`, \`clay_play\`, \`name_surname_game\`, \`mobilegraphy\`
- UUIDها، SVG خام و مسیر تصویر حذف شدند
- دستهٔ \`content_creation\` برای موبایل‌گرافی اضافه شد

این کاتالوگ جدا از Global Taxonomy مکان‌ها (\`taxonomy/*.json\`) است و فعلاً وارد enumهای \`place.schema\` نمی‌شود مگر promote جداگانه.
`;

fs.writeFileSync(path.join(root, "README.md"), readme, "utf8");
console.log("wrote README.md");
console.log(`totals: ${roots.length} roots, ${categories.length} categories, ${types.length} types`);
