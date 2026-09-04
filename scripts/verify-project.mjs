import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const fail = (m) => { console.error(`FAIL: ${m}`); process.exitCode = 1; };

const taxonomyDomains = ['types','subtypes','categories','activities','features','facilities','risks'];
for (const d of taxonomyDomains) {
  const x = read(`taxonomy/${d}.json`);
  if (!Array.isArray(x.items) || x.items.length === 0) fail(`taxonomy/${d}.json has no items`);
  const ids = x.items.map(i => i.id);
  if (ids.some(id => !/^[a-z][a-z0-9_-]*$/.test(id))) fail(`taxonomy/${d}.json contains invalid ids`);
  if (ids.length !== new Set(ids).size) fail(`taxonomy/${d}.json contains duplicate ids`);
}
const types = new Set(read('taxonomy/types.json').items.map(i => i.id));
for (const st of read('taxonomy/subtypes.json').items) {
  if (!Array.isArray(st.appliesTo) || st.appliesTo.length === 0) fail(`subtype ${st.id} has no appliesTo`);
  for (const t of st.appliesTo) if (!types.has(t)) fail(`subtype ${st.id} references unknown type ${t}`);
}
const schema = read('dataset/place.schema.json');
if ('tags' in schema.properties) fail('place.schema.json still permits tags');
if ('emergencyNumbers' in schema.properties?.safety?.properties) fail('place.schema.json still permits safety.emergencyNumbers');
for (const d of ['categories','activities','features','facilities']) {
  if (!schema.properties[d]) fail(`place.schema.json missing ${d}`);
}
if (!schema.properties?.safety?.properties?.risks) fail('place.schema.json missing safety.risks');
const policy = read('dataset/source_policy.json');
const primary = policy.primaryFactSources ?? policy.primary ?? [];
const required = ['kojaro.com','jabama.com','alibaba.ir','lastsecond.ir','flytoday.ir'];
if (primary.length !== 5) fail(`source policy must have exactly 5 primary sources, found ${primary.length}`);
for (const d of required) if (!primary.some(x => x.domain === d)) fail(`missing primary source ${d}`);
for (let i = 1; i <= 31; i++) if (!fs.existsSync(path.join(root,'input',`${i}.json`))) fail(`missing input/${i}.json`);
for (const f of ['01-start-province.txt','02-run-scope.txt','03-resume.txt','04-repair-entity.txt','05-final-audit-minify.txt']) {
  if (!fs.existsSync(path.join(root,'prompts',f))) fail(`missing prompts/${f}`);
}
const proposals = read('taxonomy/agent-taxonomy/proposals.json');
if (!Array.isArray(proposals)) fail('taxonomy/agent-taxonomy/proposals.json must be an array');
if (process.exitCode) process.exit(process.exitCode);
console.log('Planro project verification passed.');
console.log(JSON.stringify({ taxonomy: Object.fromEntries(taxonomyDomains.map(d => [d, read(`taxonomy/${d}.json`).items.length])), primarySources: primary.map(x => x.domain), provinces: 31 }, null, 2));
