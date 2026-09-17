import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const refDir = __dirname;

/** Matching key: collapse ZWNJ/spaces and unify Arabic variants */
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
    .replace(/[\s\-_/،,]+/g, "")
    .trim();

const provinces = JSON.parse(fs.readFileSync(path.join(refDir, "provinces.json"), "utf8"));
const counties = JSON.parse(fs.readFileSync(path.join(refDir, "counties.json"), "utf8"));
const cities = JSON.parse(fs.readFileSync(path.join(refDir, "cities.json"), "utf8"));

const ref = {};
const provById = {};
for (const p of provinces) {
  const n = key(p.name);
  ref[n] = { id: p.id, name: p.name, counties: {} };
  provById[p.id] = n;
}
const countyById = {};
for (const c of counties) {
  const pn = provById[c.province_id];
  if (!pn) continue;
  const cn = key(c.name);
  ref[pn].counties[cn] = { id: c.id, name: c.name, cities: [] };
  countyById[c.id] = { pn, cn };
}
for (const city of cities) {
  const m = countyById[city.county_id];
  if (!m) continue;
  ref[m.pn].counties[m.cn].cities.push(city.name);
}

const ours = fs
  .readdirSync(path.join(root, "input"))
  .filter((x) => /^\d+\.json$/.test(x))
  .sort((a, b) => Number(a.split(".")[0]) - Number(b.split(".")[0]))
  .map((f) => ({
    file: f,
    data: JSON.parse(fs.readFileSync(path.join(root, "input", f), "utf8")),
  }));

const missingCountyList = [];
const extraCountyList = [];
const missingCityList = [];
const extraCityList = [];
const byProvince = [];

for (const { file, data: op } of ours) {
  const pn = key(op.name);
  const rp = ref[pn];
  if (!rp) {
    byProvince.push({ file, name: op.name, status: "NO_REF" });
    continue;
  }

  const ourCounties = {};
  for (const c of op.counties) {
    ourCounties[key(c.name)] = {
      name: c.name,
      cities: (c.cities || []).map((x) => ({ raw: x, k: key(x) })),
    };
  }

  const missC = [];
  const extraC = [];
  const missCity = [];
  const extraCity = [];

  for (const cn of Object.keys(rp.counties)) {
    if (!ourCounties[cn]) {
      missC.push(rp.counties[cn].name);
      continue;
    }
    const ourCitySet = new Set(ourCounties[cn].cities.map((x) => x.k));
    for (const rc of rp.counties[cn].cities) {
      if (!ourCitySet.has(key(rc))) {
        missCity.push({ county: ourCounties[cn].name, city: rc });
      }
    }
    const refCitySet = new Set(rp.counties[cn].cities.map(key));
    for (const oc of ourCounties[cn].cities) {
      if (!refCitySet.has(oc.k)) {
        extraCity.push({ county: ourCounties[cn].name, city: oc.raw });
      }
    }
  }
  for (const cn of Object.keys(ourCounties)) {
    if (!rp.counties[cn]) extraC.push(ourCounties[cn].name);
  }

  missC.forEach((x) => missingCountyList.push({ province: op.name, file, county: x }));
  extraC.forEach((x) => extraCountyList.push({ province: op.name, file, county: x }));
  missCity.forEach((x) => missingCityList.push({ province: op.name, file, ...x }));
  extraCity.forEach((x) => extraCityList.push({ province: op.name, file, ...x }));

  byProvince.push({
    file,
    name: op.name,
    ourCounties: op.counties.length,
    refCounties: Object.keys(rp.counties).length,
    ourCities: op.counties.reduce((a, c) => a + (c.cities || []).length, 0),
    refCities: Object.values(rp.counties).reduce((a, c) => a + c.cities.length, 0),
    missingCounties: missC,
    extraCounties: extraC,
    missingCitiesCount: missCity.length,
    extraCitiesCount: extraCity.length,
  });
}

const summary = {
  totals: {
    ref: { provinces: provinces.length, counties: counties.length, cities: cities.length },
    ours: {
      provinces: ours.length,
      counties: ours.reduce((a, p) => a + p.data.counties.length, 0),
      cities: ours.reduce(
        (a, p) => a + p.data.counties.reduce((b, c) => b + (c.cities || []).length, 0),
        0
      ),
    },
    missingCounties: missingCountyList.length,
    extraCounties: extraCountyList.length,
    missingCities: missingCityList.length,
    extraCities: extraCityList.length,
  },
  missingCounties: missingCountyList,
  extraCounties: extraCountyList,
  byProvince,
};

fs.writeFileSync(
  path.join(__dirname, "diff-report.json"),
  JSON.stringify({ ...summary, missingCityList, extraCityList }, null, 2)
);

console.log(JSON.stringify(summary, null, 2));
