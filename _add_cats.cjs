const fs = require("fs");

const doc = JSON.parse(fs.readFileSync("taxonomy/categories.json", "utf8"));

function find(nodes, id) {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = find(n.children || [], id);
    if (hit) return hit;
  }
  return null;
}

function allIds(nodes, set = new Set()) {
  for (const n of nodes) {
    set.add(n.id);
    allIds(n.children || [], set);
  }
  return set;
}

function node(id, label, description, context, children = []) {
  return { id, label, description, context: [...context], children };
}

const PLACE = ["trip", "location"];
const EVENT = ["event"];

const additions = [
  // --- nature (place) ---
  ["nature", node("wildlife", "حیات وحش", "زیستگاه، مشاهده حیوانات و پرنده‌نگری.", PLACE)],
  ["nature", node("cave", "غار", "غار و فضای زیرزمینی قابل‌بازدید.", PLACE)],
  ["nature", node("canyon", "دره و تنگه", "دره، تنگه و مسیر دره‌نوردی.", PLACE)],
  ["nature", node("island", "جزیره", "جزیره و فضای محصور آبی.", PLACE)],
  ["nature", node("wetland", "تالاب", "تالاب، مرداب و زیست‌بوم آبی کم‌عمق.", PLACE)],
  ["nature", node("thermal_spring", "آبگرم", "چشمه آبگرم و حمام معدنی طبیعی.", PLACE)],
  ["nature", node("viewpoint", "دیدگاه و منظر", "نقطه دید، طلوع و غروب.", PLACE)],
  ["nature", node("waterfall", "آبشار", "آبشار و مسیر دسترسی مرتبط.", PLACE)],
  ["nature", node("lake", "دریاچه", "دریاچه طبیعی یا مصنوعی.", PLACE)],
  ["nature", node("river", "رودخانه", "رود، مسیل و کناره‌رود.", PLACE)],
  ["nature", node("glacier", "یخچال و برف‌چال", "یخچال، برف‌چال و فضای مرتفع یخی.", PLACE)],
  ["nature", node("plateau", "فلات و دشت مرتفع", "فلات، دشت مرتفع و فضای باز کوهپایه‌ای.", PLACE)],

  // --- heritage (place) ---
  ["heritage", node("memorial", "یادمان", "یادبود، مقبره و بنای یادمان.", PLACE)],
  ["heritage", node("historic_garden", "باغ تاریخی", "باغ ایرانی و محوطه تاریخی.", PLACE)],
  ["heritage", node("caravanserai", "کاروانسرا و راه", "کاروانسرا، رباط و مسیر تاریخی تجارت.", PLACE)],
  ["heritage", node("folklore", "فرهنگ بومی", "آیین، موسیقی و روایت محلی زنده.", PLACE)],
  ["heritage", node("bridge_heritage", "پل تاریخی", "پل و سازهٔ عبور تاریخی.", PLACE)],
  ["heritage", node("qanat_cistern", "قنات و آب‌انبار", "قنات، آب‌انبار و میراث آبی.", PLACE)],

  // --- lifestyle (place) ---
  ["lifestyle", node("parks_gardens", "پارک و باغ", "پارک شهری، باغ گیاه‌شناسی و فضای سبز.", PLACE)],
  ["lifestyle", node("hospitality", "اقامت و میزبانی", "اقامتگاه، بوم‌گردی و تجربه میزبانی.", PLACE)],
  ["lifestyle", node("cafe_culture", "کافه و چایخانه", "کافه، چایخانه و فضای نوشیدنی محلی.", PLACE)],
  ["lifestyle", node("romantic", "رمانتیک", "مناسب زوج و فضای آرام دونفره.", PLACE)],
  ["lifestyle", node("eco_tourism", "بوم‌گردی", "سفر کم‌اثر و تجربه پایدار در مقصد.", PLACE)],
  ["lifestyle", node("road_trip", "جاده‌ای", "مسیر جاده‌ای و ایستگاه‌های منظره‌دار.", PLACE)],
  ["lifestyle", node("accessible", "دسترس‌پذیر", "دسترسی آسان‌تر برای سالمند یا ویلچر.", PLACE)],
  ["lifestyle", node("seasonal", "فصلی و مناسبتی", "تم سفر وابسته به فصل یا مناسبت محلی.", PLACE)],
  ["lifestyle", node("zoo_aquarium", "باغ‌وحش و آکواریوم", "باغ‌وحش، آکواریوم و نمایش گونه.", PLACE)],
  ["lifestyle", node("kids", "کودک و نوجوان", "مناسب کودک و برنامه خانوادگی با تمرکز کودک.", PLACE)],

  ["food", node("street_food", "خیابانی", "غذای خیابانی و دکه‌های محلی.", PLACE)],
  ["food", node("traditional_cuisine", "آشپزی سنتی", "غذای سنتی و سفره محلی.", PLACE)],
  ["shopping", node("bazaar", "بازار سنتی", "بازار، گذر و فضای خرید سنتی.", PLACE)],
  ["shopping", node("handicrafts_market", "صنایع‌دستی", "خرید صنایع‌دستی و کارگاه فروش.", PLACE)],
  ["recreation", node("theme_recreation", "تفریح موضوعی", "شهربازی، پارک موضوعی و تفریح ساختگی.", PLACE)],
  ["wellness", node("spa", "اسپا و ماساژ", "اسپا، ماساژ و مراقبت بدن.", PLACE)],
  ["wellness", node("hydrotherapy", "آب‌درمانی", "استفاده درمانی از آب و چشمه.", PLACE)],

  // --- sports (event) ---
  [
    "sports",
    node("water_sports", "ورزش‌های آبی", "شنای آزاد، قایق، رفتینگ و غواصی گروهی.", EVENT, [
      node("open_water_swim", "شنای فضای باز", "شنا در دریاچه، دریا یا استخر روباز گروهی.", EVENT),
      node("kayaking_meetup", "کایاک", "کایاک‌سواری گروهی.", EVENT),
      node("rafting_meetup", "رفتینگ", "رفتینگ گروهی روی رود.", EVENT),
      node("diving_meetup", "غواصی", "غواصی یا اسنورکل گروهی.", EVENT),
    ]),
  ],
  [
    "sports",
    node("equestrian", "اسب‌سواری", "اسب‌سواری و فعالیت سوارکاری گروهی.", EVENT, [
      node("horse_riding_meetup", "سواری تفریحی", "اسب‌سواری تفریحی گروهی.", EVENT),
    ]),
  ],
  [
    "sports",
    node("winter_events", "زمستانی", "اسکی، اسنوبرد و برف‌نوردی گروهی.", EVENT, [
      node("ski_meetup", "اسکی", "اسکی گروهی.", EVENT),
      node("snowboard_meetup", "اسنوبرد", "اسنوبرد گروهی.", EVENT),
      node("snowshoe_meetup", "برف‌کوبی", "پیاده‌روی با کفش برفی.", EVENT),
    ]),
  ],
  ["team_ball", node("handball", "هندبال", "تمرین یا مسابقه هندبال.", EVENT)],
  ["racket", node("pickleball", "پیکل‌بال", "بازی پیکل‌بال گروهی.", EVENT)],
  ["fitness", node("trx_functional", "تی‌آر‌ایکس و فانکشنال", "تمرین تی‌آر‌ایکس یا فانکشنال.", EVENT)],
  ["fitness", node("aerobics_dance_fit", "ایروبیک", "ایروبیک و تناسب با ریتم.", EVENT)],
  ["endurance", node("trail_running", "تریل‌رانینگ", "دویدن در مسیر طبیعت.", EVENT)],
  ["outdoor_adventure", node("canyoning_meetup", "دره‌نوردی", "دره‌نوردی گروهی.", EVENT)],
  ["outdoor_adventure", node("via_ferrata", "ویافرراتا", "مسیر ویافرراتا گروهی.", EVENT)],
  ["recreational_games", node("airsoft", "ایرسافت", "ایرسافت گروهی.", EVENT)],

  // --- arts_culture ---
  ["performing_music", node("traditional_music", "موسیقی سنتی", "اجرا یا آموزش موسیقی سنتی.", EVENT)],
  ["performing_music", node("choir_singing", "آواز گروهی", "کر و آواز جمعی.", EVENT)],
  ["visual_arts_crafts", node("printmaking", "چاپ دستی", "کارگاه چاپ و گراور.", EVENT)],
  ["visual_arts_crafts", node("sculpture", "مجسمه‌سازی", "کارگاه مجسمه‌سازی.", EVENT)],
  ["cinema", node("film_festival", "جشنواره فیلم", "جشنواره یا هفته فیلم.", EVENT)],
  ["literature", node("writing_workshop", "کارگاه نویسندگی", "تمرین نوشتن داستان یا شعر.", EVENT)],
  ["dance", node("traditional_dance", "رقص سنتی", "رقص محلی یا سنتی گروهی.", EVENT)],

  // --- social ---
  ["social", node("volunteer", "داوطلبی", "کار داوطلبانه و خدمت جمعی.", EVENT, [
    node("community_volunteer", "خدمت محلی", "کمک داوطلبانه در محله یا پروژه محلی.", EVENT),
    node("cleanup_volunteer", "پاکسازی محیط", "پاکسازی طبیعت یا شهر.", EVENT),
  ])],
  ["social_gatherings", node("brunch_meetup", "برانچ", "دورهمی برانچ.", EVENT)],
  ["social_gatherings", node("birthday_group", "تولد گروهی", "جشن تولد جمعی.", EVENT)],
  ["food_experiences", node("wine_tasting", "چشیدن نوشیدنی", "چشیدن نوشیدنی یا عصاره میوه به‌صورت گروهی.", EVENT)],
  ["food_experiences", node("farm_to_table", "مزرعه تا سفره", "بازدید مزرعه و پخت تازه.", EVENT)],
  ["outdoor_social", node("beach_day", "روز ساحل", "دورهمی ساحلی.", EVENT)],
  ["discussion", node("book_club_talk", "گفت‌وگوی کتاب", "بحث گروهی درباره کتاب.", EVENT)],

  // --- learning ---
  ["learning", node("design_skills", "طراحی", "مهارت طراحی و کارگاه بصری.", EVENT, [
    node("ui_ux_workshop", "UI/UX", "کارگاه رابط و تجربه کاربری.", EVENT),
    node("graphic_design_workshop", "گرافیک", "کارگاه طراحی گرافیک.", EVENT),
  ])],
  ["learning", node("soft_skills", "مهارت نرم", "ارتباط، ارائه و کار تیمی.", EVENT, [
    node("public_speaking", "سخنرانی", "تمرین سخنرانی عمومی.", EVENT),
    node("negotiation_skills", "مذاکره", "کارگاه مذاکره.", EVENT),
  ])],
  ["languages", node("german_language", "زبان آلمانی", "تمرین زبان آلمانی.", EVENT)],
  ["languages", node("french_language", "زبان فرانسوی", "تمرین زبان فرانسوی.", EVENT)],
  ["languages", node("turkish_language", "زبان ترکی", "تمرین زبان ترکی.", EVENT)],
  ["languages", node("arabic_language", "زبان عربی", "تمرین زبان عربی.", EVENT)],
  ["content_creation", node("video_editing", "تدوین ویدیو", "کارگاه تدوین.", EVENT)],
  ["content_creation", node("copywriting", "کپی‌رایتینگ", "کارگاه نوشتن تبلیغاتی.", EVENT)],
  ["technology", node("data_ai_meetup", "داده و هوش مصنوعی", "دورهمی داده یا هوش مصنوعی.", EVENT)],
  ["technology", node("no_code_workshop", "نوکد", "کارگاه ساخت بدون کدنویسی.", EVENT)],

  // --- entertainment ---
  ["entertainment", node("live_shows", "نمایش زنده", "استندآپ، شعبده و اجرای زنده.", EVENT, [
    node("stand_up_comedy", "استندآپ", "کمدی استندآپ.", EVENT),
    node("magic_show", "شعبده‌بازی", "نمایش شعبده.", EVENT),
    node("improv_show", "بداهه", "تئاتر بداهه.", EVENT),
  ])],
  ["adventure_games", node("scavenger_hunt", "شکار سرنخ", "بازی جست‌وجو و سرنخ در شهر.", EVENT)],
  ["tabletop_social", node("role_playing_game", "نقش‌آفرینی", "بازی نقش‌آفرینی رومیزی.", EVENT)],
  ["digital_games", node("esports_meetup", "ورزش الکترونیکی", "مسابقه یا دورهمی بازی رقابتی.", EVENT)],

  // --- business ---
  ["business_events", node("workshop_masterclass", "ورکشاپ تخصصی", "کارگاه کوتاه حرفه‌ای.", EVENT)],
  ["professional_networking", node("mentorship_circle", "منتورشیپ", "حلقه منتور و مشاوره شغلی.", EVENT)],
  ["startup_career", node("hackathon", "هکاتون", "رقابت ساخت محصول در زمان محدود.", EVENT)],
];

const existing = allIds(doc.categories);
let added = 0;
const skipped = [];

for (const [parentId, child] of additions) {
  const parent = find(doc.categories, parentId);
  if (!parent) {
    skipped.push("missing parent " + parentId + " for " + child.id);
    continue;
  }
  const newIds = allIds([child]);
  let collision = null;
  for (const id of newIds) {
    if (existing.has(id)) {
      collision = id;
      break;
    }
  }
  if (collision) {
    skipped.push("collision " + collision);
    continue;
  }
  // child context ⊆ parent
  for (const c of child.context) {
    if (!parent.context.includes(c)) {
      skipped.push("context parent " + parentId + " missing " + c + " for " + child.id);
      collision = true;
      break;
    }
  }
  if (collision === true) continue;

  // also check nested children against their parent chain contexts
  function checkTree(n, pCtx) {
    for (const c of n.context) if (!pCtx.includes(c)) return "bad ctx " + n.id;
    for (const ch of n.children || []) {
      const err = checkTree(ch, n.context);
      if (err) return err;
    }
    return null;
  }
  const terr = checkTree(child, parent.context);
  if (terr) {
    skipped.push(terr);
    continue;
  }

  parent.children.push(child);
  for (const id of newIds) existing.add(id);
  added += newIds.size;
}

function enforce(node) {
  for (const ch of node.children || []) enforce(ch);
  const order = ["trip", "event", "location"];
  let needed = [...(node.context || [])];
  for (const ch of node.children || []) {
    for (const c of ch.context || []) if (!needed.includes(c)) needed.push(c);
  }
  node.context = order.filter((x) => needed.includes(x));
}

for (const r of doc.categories) enforce(r);

doc.version = "3.1.0";
doc.description =
  "Nested category tree. Child context ⊆ parent context. context: trip | event | location. No defaults.";

fs.writeFileSync("taxonomy/categories.json", JSON.stringify(doc, null, 2) + "\n", "utf8");

function count(ns) {
  let n = 0;
  for (const x of ns) n += 1 + count(x.children || []);
  return n;
}
console.log("added nodes:", added);
console.log("total:", count(doc.categories));
if (skipped.length) console.log("skipped:\n" + skipped.join("\n"));
for (const r of doc.categories) {
  console.log(r.id, "children", r.children.length, "ctx", r.context.join("+"));
}
