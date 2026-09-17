import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const inputDir = path.join(root, "input");

const key = (s) =>
  String(s || "")
    .replace(/[\u200c\u200d\u200e\u200f\ufeff]/g, "")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/آ/g, "ا")
    .replace(/أ/g, "ا")
    .replace(/إ/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ی")
    .replace(/[\s\-_/،,._]+/g, "")
    .replace(/^(شهر|بندر)+/g, "")
    .trim();

/** County name aliases: ref-key -> our preferred key fragments that should match */
const COUNTY_ALIASES = new Map([
  [key("نایین"), key("نائین")],
  [key("بویین و میاندشت"), key("بوئین میاندشت")],
  [key("قاینات"), key("قائنات")],
  [key("چاه بهار"), key("چابهار")],
  [key("بویین زهرا"), key("بوئین‌زهرا")],
  [key("ارزوییه"), key("ارزوئیه")],
  [key("بهمیی"), key("بهمئی")],
  [key("علی آباد کتول"), key("علی‌آباد")],
  [key("طوالش"), key("تالش")],
  [key("قایم شهر"), key("قائم‌شهر")],
]);

/** City aliases: alternate keys that mean the same city */
const CITY_ALIAS_GROUPS = [
  ["خداجو", "خداجوخراجو"],
  ["نوشین‌شهر", "نوشین"],
  ["شهر زهرا", "زهرا"],
  ["ایردموسی", "اردیموسی"],
  ["تازه کندانگوت", "انگوت", "تازهکندانگوت"],
  ["خارگ", "خارک"],
  ["بندر عسلویه", "عسلویه"],
  ["فرادنبه", "فرادبنه"],
  ["شهرکیان", "کیان"],
  ["بایگ", "بایک"],
  ["اسحاق‌آباد", "اسحق آباد"],
  ["چوئبده", "چویبده"],
  ["صدرا", "شهرصدرا"],
  ["ضیاءآباد", "ضیاآباد"],
  ["شریفیه", "شریف آباد"],
  ["کشکوئیه", "کشکوییه"],
  ["صفائیه", "صفاییه"],
  ["ریحان‌شهر", "ریحان"],
  ["بانه‌وره", "بانوره"],
  ["ریژآو", "ریجاب"],
  ["کرند غرب", "کرند"],
  ["قلعه رئیسی", "قلعه رییسی"],
  ["گمیشان", "گمیش تپه"],
  ["شاپور آباد", "شاهپوراباد"],
  ["شول‌آباد سفلی", "تیتکان بزنوید", "تیتکان"],
  ["شهرگراب", "گراب"],
  ["انزلی", "بندرانزلی"],
  ["لشت نشا", "لشت نشاء"],
  ["لولمان رشت", "لولمان"],
  ["تولم‌شهر", "مرجقل"],
  ["شاندرمن", "بازار جمعه"],
  ["شهر امامزاده عبدالله", "امامزاده عبدالله"],
  ["داوودآباد", "داودآباد"],
  ["بندر چارک", "چارک"],
  ["بندر کنگ", "کنگ"],
  ["بندر لافت", "لافت"],
  ["بیکاه", "بیکاء"],
  ["دهبارز", "رودان"],
  ["سرگز احمدی", "سرگز"],
  ["هنگویه", "هنگوییه"],
  ["کوهیج", "کوهیچ"],
  ["بندر خمیر", "خمیر"],
  ["بندر پل", "پل"],
  ["بندر سیریک", "سیریک"],
  ["بندر کوهستک", "کوهستک"],
  ["گروگ", "گروک"],
  ["بفروئیه", "بفروییه"],
  ["ده رئیس", "ده رییس"],
  ["چگردک", "چگرد"],
  ["کتیج", "گتیج"],
  ["بندر بریس", "بریس"],
  ["آبیز جدید", "آبیز"],
  ["مبارک‌آباد", "مبارک آباددیز"],
  ["کارزین", "کارزین فتح آباد"],
  ["قائمیه", "قایمیه"],
  ["هور پاسفید", "پاسفید"],
  ["اورامان تخت", "هورامان تخت"],
  ["سده", "سده لنجان"],
  ["حر ریاحی", "حر"],
  ["کوت عبدالله", "کوت عبداله"],
  ["هفتکل", "هفتگل"],
  ["سربندر", "بندرامام خمینی"],
];

const cityCanon = new Map();
for (const group of CITY_ALIAS_GROUPS) {
  const canon = key(group[0]);
  for (const g of group) cityCanon.set(key(g), canon);
}
const cityKey = (s) => cityCanon.get(key(s)) || key(s);

const isDistrictCity = (name) => {
  const n = String(name || "").trim();
  if (/منطقه|ثامن|_/.test(n)) return true;
  const compact = n.replace(/[\u200c\s]/g, "");
  return /\d+$/.test(compact);
};

const JUNK_CITIES = new Set(
  [
    "گاه‌شماری طالقانی",
    "مسجد جامع سلطانیه",
    "قرمزخلیفه سفلی",
    "شهر بلقیس",
    "ده عباسقلی",
    "آبلش",
  ].map(cityKey)
);

const provinces = JSON.parse(fs.readFileSync(path.join(__dirname, "provinces.json"), "utf8"));
const counties = JSON.parse(fs.readFileSync(path.join(__dirname, "counties.json"), "utf8"));
const cities = JSON.parse(fs.readFileSync(path.join(__dirname, "cities.json"), "utf8"));

const ref = {};
const provById = {};
for (const p of provinces) {
  const n = key(p.name);
  ref[n] = { name: p.name, counties: {} };
  provById[p.id] = n;
}
const countyById = {};
for (const c of counties) {
  const pn = provById[c.province_id];
  if (!pn) continue;
  let cn = key(c.name);
  if (COUNTY_ALIASES.has(cn)) cn = COUNTY_ALIASES.get(cn);
  if (!ref[pn].counties[cn]) {
    ref[pn].counties[cn] = { name: c.name, cities: [] };
  }
  countyById[c.id] = { pn, cn };
}
for (const city of cities) {
  const m = countyById[city.county_id];
  if (!m || isDistrictCity(city.name)) continue;
  ref[m.pn].counties[m.cn].cities.push(city.name);
}

/** Prefer nicer display form */
function preferName(a, b) {
  const score = (s) => {
    let sc = 0;
    if (s.includes("\u200c")) sc += 2;
    if (!/\s/.test(s) && s.length < 20) sc += 1;
    if (s.startsWith("بندر ") || s.startsWith("شهر ")) sc -= 1;
    return sc;
  };
  return score(a) >= score(b) ? a : b;
}

const STRUCTURAL_ADDS = {
  "30.json": {
    // missing county entirely
    addCounties: [
      { name: "تویسرکان", cities: ["تویسرکان", "سرکان", "فرسفج"] },
    ],
  },
};

const REMOVE_FROM = {
  "5.json": { "طالقان": ["گاه‌شماری طالقانی"] },
  "14.json": { "سلطانیه": ["مسجد جامع سلطانیه"] },
  "1.json": { "ملکان": ["قرمزخلیفه سفلی"] },
  "12.json": { "اسفراین": ["شهر بلقیس"] },
  "13.json": { "بهبهان": ["آبلش", "ده عباسقلی"] },
  "8.json": {
    // replace combined tourist string with proper city names via merge
    "شمیرانات": ["اوشان، فشم، میگون"],
  },
};

const FORCE_ADD = {
  "8.json": {
    "شمیرانات": ["اوشان", "فشم", "میگون", "تجریش"],
    "ری": ["ری", "حسن‌آباد", "کهریزک"],
    "رباط‌کریم": ["پرند"],
    "پاکدشت": ["فرون‌آباد"],
  },
  "18.json": {
    "قزوین": ["اقبالیه", "محمودآباد نمونه", "معلم‌کلایه", "رازمیان", "سیردان", "کوهین"],
    "البرز": ["الوند", "محمدیه", "بیدستان", "شریفیه", "مهرگان"],
    "بوئین‌زهرا": ["بویین‌زهرا", "دانسفهان", "ارداق", "سگزآباد", "شال", "عصمت‌آباد"],
    "آوج": ["آبگرم"],
    "آبیک": ["خاکعلی"],
    "تاکستان": ["ضیاءآباد"],
  },
};

let added = 0;
let removed = 0;
const perFile = [];

for (const file of fs.readdirSync(inputDir).filter((f) => /^\d+\.json$/.test(f)).sort((a, b) => +a.split(".")[0] - +b.split(".")[0])) {
  const full = path.join(inputDir, file);
  const data = JSON.parse(fs.readFileSync(full, "utf8"));
  const pn = key(data.name);
  const rp = ref[pn];
  let fileAdded = 0;
  let fileRemoved = 0;

  // structural county adds
  if (STRUCTURAL_ADDS[file]?.addCounties) {
    for (const c of STRUCTURAL_ADDS[file].addCounties) {
      if (!data.counties.some((x) => key(x.name) === key(c.name))) {
        data.counties.push({ name: c.name, cities: [...c.cities] });
        fileAdded += c.cities.length;
      }
    }
  }

  // explicit removals
  if (REMOVE_FROM[file]) {
    for (const county of data.counties) {
      const rem = REMOVE_FROM[file][county.name];
      if (!rem) continue;
      const before = county.cities.length;
      county.cities = county.cities.filter((c) => !rem.includes(c) && !JUNK_CITIES.has(cityKey(c)));
      fileRemoved += before - county.cities.length;
    }
  }

  // merge from ref by county
  if (rp) {
    const ourByKey = new Map();
    for (const c of data.counties) ourByKey.set(key(c.name), c);

    for (const [cn, refCounty] of Object.entries(rp.counties)) {
      let ours = ourByKey.get(cn);
      if (!ours) {
        // try reverse alias: our name might be preferred form
        for (const [refK, ourK] of COUNTY_ALIASES) {
          if (refK === cn && ourByKey.has(ourK)) {
            ours = ourByKey.get(ourK);
            break;
          }
        }
      }
      if (!ours) continue;

      const have = new Map(); // canon -> display
      for (const c of ours.cities) {
        if (JUNK_CITIES.has(cityKey(c))) continue;
        const ck = cityKey(c);
        if (!have.has(ck)) have.set(ck, c);
        else have.set(ck, preferName(have.get(ck), c));
      }

      for (const rc of refCounty.cities) {
        if (isDistrictCity(rc) || JUNK_CITIES.has(cityKey(rc))) continue;
        const ck = cityKey(rc);
        if (!have.has(ck)) {
          have.set(ck, rc);
          fileAdded++;
        } else {
          have.set(ck, preferName(have.get(ck), rc));
        }
      }

      // rebuild sorted unique
      ours.cities = [...have.values()].sort((a, b) => a.localeCompare(b, "fa"));
    }
  }

  // force adds with preferred names
  if (FORCE_ADD[file]) {
    for (const county of data.counties) {
      const adds = FORCE_ADD[file][county.name];
      if (!adds) continue;
      const have = new Set(county.cities.map(cityKey));
      for (const a of adds) {
        if (!have.has(cityKey(a))) {
          county.cities.push(a);
          have.add(cityKey(a));
          fileAdded++;
        }
      }
      county.cities.sort((a, b) => a.localeCompare(b, "fa"));
    }
  }

  // global junk scrub
  for (const county of data.counties) {
    const before = county.cities.length;
    county.cities = county.cities.filter((c) => !JUNK_CITIES.has(cityKey(c)));
    fileRemoved += before - county.cities.length;
  }

  // sort counties by name
  data.counties.sort((a, b) => a.name.localeCompare(b.name, "fa"));

  fs.writeFileSync(full, JSON.stringify(data, null, 2) + "\n", "utf8");
  added += fileAdded;
  removed += fileRemoved;
  if (fileAdded || fileRemoved) perFile.push({ file, name: data.name, added: fileAdded, removed: fileRemoved });
}

// recount
let countiesN = 0;
let citiesN = 0;
let empty = [];
for (const file of fs.readdirSync(inputDir).filter((f) => /^\d+\.json$/.test(f))) {
  const data = JSON.parse(fs.readFileSync(path.join(inputDir, file), "utf8"));
  countiesN += data.counties.length;
  for (const c of data.counties) {
    citiesN += (c.cities || []).length;
    if (!c.cities || !c.cities.length) empty.push(`${data.name}/${c.name}`);
  }
}

console.log(JSON.stringify({ added, removed, perFile, totals: { counties: countiesN, cities: citiesN, empty } }, null, 2));
