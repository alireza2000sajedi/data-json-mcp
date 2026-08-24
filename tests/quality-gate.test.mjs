import test from "node:test";
import assert from "node:assert/strict";
import { setupEnv, cleanup, clearOutput, makeValidPlace, makeVillage, makeCity, seedProvinceHierarchy, mediaItem } from "./helpers.mjs";

const outputDir = setupEnv();

test.beforeEach(() => {
  clearOutput(outputDir);
});

test.after(() => {
  cleanup(outputDir);
});

async function validate(entity, provinceId = "province-30", expectedNodeId) {
  const { validateEntity } = await import("../dist/quality-gate.js");
  await seedProvinceHierarchy(provinceId);
  return validateEntity(entity, { provinceId, expectedNodeId: expectedNodeId ?? entity.id });
}

function codes(result) {
  return result.errors.map((e) => e.code);
}

test("rejects markdown URL in sources", async () => {
  const entity = makeValidPlace({ sources: [{ title: "X", url: "https://example.com/page](https://other.com)", type: "official", accessedAt: "2026-08-24" }] });
  const r = await validate(entity);
  assert.equal(r.accepted, false);
  assert.ok(codes(r).some((c) => c === "URL_NOT_RAW_HTTPS" || c === "SCHEMA_VIOLATION"), `unexpected codes: ${codes(r)}`);
});

test("rejects full markdown link format [url](url) in media and sources", async () => {
  const entity = makeValidPlace({
    sources: [{ title: "X", url: "[https://fa.wikipedia.org/wiki/A](https://fa.wikipedia.org/wiki/A)", type: "wiki", accessedAt: "2026-08-24" }],
    media: {
      thumbnail: {
        url: "[https://commons.wikimedia.org/wiki/File:T.jpg](https://commons.wikimedia.org/wiki/File:T.jpg)",
        alt: "x", caption: "x", credit: "c", license: "CC-BY-SA-4.0", source: "Wikimedia Commons",
        sourceUrl: "[https://commons.wikimedia.org/wiki/File:T.jpg](https://commons.wikimedia.org/wiki/File:T.jpg)",
      },
      images: Array.from({ length: 10 }, (_, i) => mediaItem(i)),
    },
  });
  const r = await validate(entity);
  assert.equal(r.accepted, false);
  assert.ok(codes(r).includes("URL_NOT_RAW_HTTPS"), `codes: ${codes(r)}`);
});

test("rejects evidence.sourceUrl outside sources", async () => {
  const entity = makeValidPlace({ evidence: [{ field: "content.summary", claim: "x", sourceUrl: "https://not-a-source.example.com" }] });
  const r = await validate(entity);
  assert.equal(r.accepted, false);
  assert.ok(codes(r).includes("EVIDENCE_SOURCE_NOT_IN_SOURCES"), `codes: ${codes(r)}`);
});

test("rejects duplicate id and slug", async () => {
  // Save a first entity, then validate a second with the same id/slug.
  const { toolSaveActiveEntity } = await import("../dist/tools.js");
  await seedProvinceHierarchy();
  const first = makeValidPlace();
  const r1 = toolSaveActiveEntity({ provinceId: "province-30", entity: first, expectedNodeId: first.id });
  assert.equal(r1.accepted, true);

  const second = makeValidPlace({ id: "place-30-1", slug: "famnin-mosque" });
  const { validateEntity } = await import("../dist/quality-gate.js");
  const r2 = validateEntity(second, { provinceId: "province-30", expectedNodeId: second.id });
  assert.equal(r2.accepted, false);
  assert.ok(codes(r2).includes("DUPLICATE_ID"), `codes: ${codes(r2)}`);
  assert.ok(codes(r2).includes("DUPLICATE_SLUG"), `codes: ${codes(r2)}`);
});

test("rejects relation to a non-existent entity", async () => {
  const entity = makeValidPlace({ relations: [{ placeId: "place-9999", relationType: "nearby" }] });
  const r = await validate(entity);
  assert.equal(r.accepted, false);
  assert.ok(codes(r).includes("RELATION_TARGET_NOT_FOUND"), `codes: ${codes(r)}`);
});

test("rejects a nearby entity promoted to parent (parent must be an ancestor)", async () => {
  // The place is under county-30-1; a 'parent' relation to an unrelated county must be rejected.
  const entity = makeValidPlace({ relations: [{ placeId: "county-30-9", relationType: "parent" }] });
  // Make county-30-9 exist as a real entity so it passes the existence check.
  const { listEntities } = await import("../dist/dataset.js");
  // Simulate: write a real file for county-30-9
  const notes = await seedProvinceHierarchy();
  // The target must exist in the dataset; add via save of a county entity instead is heavy,
  // so we register it through notes registry + a real file is not required for existence
  // (existence is based on stored entities). Write a minimal file directly.
  const { writeEntityFile } = await import("../dist/dataset.js");
  const path = (await import("../dist/config.js")).safeJoin(outputDir, ["province-30", "county-30-9", "county.json"]);
  writeEntityFile(path, { id: "county-30-9", slug: "other-county", type: "other", subType: "county", status: "active", name: { fa: "دیگر" } });

  const r = await validate(entity);
  assert.equal(r.accepted, false);
  assert.ok(codes(r).includes("RELATION_PARENT_MISMATCH"), `codes: ${codes(r)}`);
});

test("rejects duplicate media image URLs", async () => {
  const imgs = Array.from({ length: 10 }, (_, i) => ({ ...mediaItem(i) }));
  imgs[1] = { ...imgs[0] }; // duplicate
  const entity = makeValidPlace({ media: { thumbnail: mediaItem(99, { url: "https://upload.wikimedia.org/x.jpg" }), images: imgs } });
  const r = await validate(entity);
  assert.equal(r.accepted, false);
  assert.ok(codes(r).includes("MEDIA_DUPLICATE_IMAGE"), `codes: ${codes(r)}`);
});

test("rejects thumbnail duplicated inside images", async () => {
  const images = Array.from({ length: 10 }, (_, i) => mediaItem(i));
  const thumbUrl = images[0].url;
  const entity = makeValidPlace({ media: { thumbnail: mediaItem(99, { url: thumbUrl }), images } });
  const r = await validate(entity);
  assert.equal(r.accepted, false);
  assert.ok(codes(r).includes("MEDIA_THUMBNAIL_DUPLICATED"), `codes: ${codes(r)}`);
});

test("rejects 9 images for active entity", async () => {
  const entity = makeValidPlace({ media: { thumbnail: mediaItem(99, { url: "https://upload.wikimedia.org/x.jpg" }), images: Array.from({ length: 9 }, (_, i) => mediaItem(i)) } });
  const r = await validate(entity);
  assert.equal(r.accepted, false);
  assert.ok(codes(r).includes("MEDIA_TOO_FEW_IMAGES"), `codes: ${codes(r)}`);
});

test("rejects 21 images for active entity", async () => {
  const entity = makeValidPlace({ media: { thumbnail: mediaItem(99, { url: "https://upload.wikimedia.org/x.jpg" }), images: Array.from({ length: 21 }, (_, i) => mediaItem(i)) } });
  const r = await validate(entity);
  assert.equal(r.accepted, false);
  assert.ok(codes(r).includes("MEDIA_TOO_MANY_IMAGES"), `codes: ${codes(r)}`);
});

test("rejects a Hamedan image used for Famnin (ownership mismatch)", async () => {
  // Register one of the image sourceUrls against the PROVINCE (Hamadan) as belongs_to_node.
  const notes = await import("../dist/notes.js");
  const { readNotes, writeNotes, addSourceMatrixEntry } = notes;
  let state = readNotes("province-30");
  addSourceMatrixEntry(state, {
    id: "src-img",
    nodeId: "province-30",
    query: "hamadan images",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:example-0.jpg",
    sourceTitle: "Hamadan Commons",
    resultSummary: "image",
    ownershipStatus: "belongs_to_node",
  });
  writeNotes(state);

  const entity = makeValidPlace();
  const r = await validate(entity);
  assert.equal(r.accepted, false);
  assert.ok(codes(r).includes("MEDIA_OWNERSHIP_MISMATCH"), `codes: ${codes(r)}`);
});

test("rejects cost with min greater than max", async () => {
  const entity = makeValidPlace({
    costs: {
      currency: "IRT", priceAsOf: "2026-08-24", forTravelers: 1,
      items: [{ category: "entry", name: "ورودی", required: false, unit: "per_person", budget: { economy: { min: 50000, max: 20000 }, standard: { min: 20000, max: 40000 }, comfortable: { min: 40000, max: 80000 } }, inflationCategory: "recreation_and_culture", sourceUrl: "https://example.com/famnin" }],
      estimatedVisitTotal: { economy: { min: 10000, max: 20000 }, standard: { min: 20000, max: 40000 }, comfortable: { min: 40000, max: 80000 } },
    },
  });
  const r = await validate(entity);
  assert.equal(r.accepted, false);
  assert.ok(codes(r).includes("COST_MIN_GT_MAX"), `codes: ${codes(r)}`);
});

test("rejects cost without a CPI-covered inflationCategory", async () => {
  const entity = makeValidPlace({
    costs: {
      currency: "IRT", priceAsOf: "2026-08-24", forTravelers: 1,
      items: [{ category: "entry", name: "ورودی", required: false, unit: "per_person", budget: { economy: { min: 10000, max: 20000 }, standard: { min: 20000, max: 40000 }, comfortable: { min: 40000, max: 80000 } }, inflationCategory: "not_a_cpi_category", sourceUrl: "https://example.com/famnin" }],
      estimatedVisitTotal: { economy: { min: 10000, max: 20000 }, standard: { min: 20000, max: 40000 }, comfortable: { min: 40000, max: 80000 } },
    },
  });
  const r = await validate(entity);
  assert.equal(r.accepted, false);
  assert.ok(codes(r).includes("COST_CPI_NOT_COVERED"), `codes: ${codes(r)}`);
});

test("rejects village without ruralDistrict", async () => {
  const entity = makeVillage({ location: { country: "Iran", province: "همدان", county: "فامنین", village: "فامنین", coordinates: { latitude: 35.1, longitude: 48.9 }, address: { full: "x" } } });
  const r = await validate(entity);
  assert.equal(r.accepted, false);
  assert.ok(codes(r).includes("HIERARCHY_RURAL_DISTRICT"), `codes: ${codes(r)}`);
});

test("rejects city without county", async () => {
  const entity = makeCity({ location: { country: "Iran", province: "همدان", city: "فامنین", coordinates: { latitude: 35.1, longitude: 48.9 }, address: { full: "x" } } });
  const r = await validate(entity);
  assert.equal(r.accepted, false);
  assert.ok(codes(r).includes("HIERARCHY_COUNTY"), `codes: ${codes(r)}`);
});

test("brand voice: unevidenced superlative/tech/cliché wording is rejected (blocking)", async () => {
  const entity = makeValidPlace({
    content: {
      summary: { fa: "مسجد تاریخی فامنین" },
      description: { fa: "فامنین یکی از زیباترین و بهترین روستاهای ایران است که با هوش مصنوعی پیشرفته در مدیریت گردشگری، تجربه‌ای شگفت‌انگیز برای گردشگران فراهم می‌کند." },
    },
  });
  const r = await validate(entity);
  const ecodes = r.errors.map((e) => e.code);
  assert.ok(ecodes.includes("BRAND_VOICE_SUPERLATIVE"), `errors: ${ecodes}`);
  assert.ok(ecodes.includes("BRAND_VOICE_TECH_NOISE"), `errors: ${ecodes}`);
  assert.ok(ecodes.includes("BRAND_VOICE_CLICHE"), `errors: ${ecodes}`);
  assert.equal(r.accepted, false);
});

test("brand voice: evidence-backed superlative is downgraded to a warning (not blocking)", async () => {
  const entity = makeValidPlace({
    content: {
      summary: { fa: "مسجد تاریخی فامنین" },
      description: { fa: "قدیمی‌ترین مسجد فامنین با معماری خشتی" },
    },
    // Dedicated evidence for the description field.
    evidence: [
      { field: "content.description", claim: "قدیمی‌ترین مسجد فامنین", sourceUrl: "https://example.com/famnin" },
    ],
  });
  const r = await validate(entity);
  const ecodes = r.errors.map((e) => e.code);
  const wcodes = r.warnings.map((w) => w.code);
  assert.ok(!ecodes.includes("BRAND_VOICE_SUPERLATIVE"), `should not error: ${ecodes}`);
  assert.ok(wcodes.includes("BRAND_VOICE_SUPERLATIVE"), `should warn: ${wcodes}`);
  assert.equal(r.accepted, true);
});

test("brand voice: full blacklist terms and AI-like markers are flagged", async () => {
  const entity = makeValidPlace({
    content: {
      summary: { fa: "مسجد تاریخی فامنین" },
      description: { fa: "در دنیای پرشتاب امروز، پلنرو با پلتفرم جامع و الگوریتم هوشمند، سفری رؤیایی و بی‌نظیر فراهم می‌کند. همین حالا شروع کنید!" },
    },
  });
  const r = await validate(entity);
  const ecodes = r.errors.map((e) => e.code);
  assert.ok(ecodes.includes("BRAND_VOICE_SUPERLATIVE"), `errors: ${ecodes}`); // بی‌نظیر
  assert.ok(ecodes.includes("BRAND_VOICE_TECH_NOISE"), `errors: ${ecodes}`); // پلتفرم جامع / الگوریتم هوشمند
  assert.ok(ecodes.includes("BRAND_VOICE_CLICHE"), `errors: ${ecodes}`); // سفر رؤیایی / فراهم می‌کند / در دنیای پرشتاب امروز / همین حالا شروع کنید
  assert.equal(r.accepted, false);
});

test("brand voice: clean factual copy produces no brand-voice flags", async () => {
  const entity = makeValidPlace({
    content: {
      summary: { fa: "مسجد تاریخی فامنین" },
      description: { fa: "مسجد فامنین در مرکز شهر فامنین قرار دارد. اگر پیاده در بافت قدیمی می‌گردید، درِ ورودی آن را از بازارچه پیدا می‌کنید." },
    },
  });
  const r = await validate(entity);
  const ecodes = r.errors.map((e) => e.code);
  const wcodes = r.warnings.map((w) => w.code);
  assert.ok(!ecodes.includes("BRAND_VOICE_SUPERLATIVE"), `errors: ${ecodes}`);
  assert.ok(!ecodes.includes("BRAND_VOICE_TECH_NOISE"), `errors: ${ecodes}`);
  assert.ok(!ecodes.includes("BRAND_VOICE_CLICHE"), `errors: ${ecodes}`);
  assert.ok(!wcodes.includes("BRAND_VOICE_SUPERLATIVE"), `warnings: ${wcodes}`);
  assert.ok(!wcodes.includes("BRAND_VOICE_TECH_NOISE"), `warnings: ${wcodes}`);
  assert.ok(!wcodes.includes("BRAND_VOICE_CLICHE"), `warnings: ${wcodes}`);
});
