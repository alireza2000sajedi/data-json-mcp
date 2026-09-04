import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>fs.readFileSync(path.join(ROOT,p),"utf8");
const required=["README.md","START_HERE.md","package.json","package-lock.json","tsconfig.json","mcp-client.mjs","dataset/place.schema.json","dataset/entity-field-policy.json","dataset/source_policy.json","dataset/brand_voice.md","dataset/iran-cpi.schema.json","prompts/01-start-province.txt","prompts/02-run-scope.txt","prompts/03-resume.txt","prompts/04-repair-entity.txt","prompts/05-final-audit-minify.txt","prompts/README.md","taxonomy/types.json","taxonomy/subtypes.json","taxonomy/categories.json","taxonomy/activities.json","taxonomy/features.json","taxonomy/facilities.json","taxonomy/risks.json","taxonomy/README.md","taxonomy/agent-taxonomy/proposals.json"];
for(const f of required) if(!fs.existsSync(path.join(ROOT,f))) throw new Error(`Missing ${f}`);
if(fs.existsSync(path.join(ROOT,"prompt.txt"))) throw new Error("Root prompt.txt must not exist");
for(const d of ["tests","node_modules","dist","output"]) if(fs.existsSync(path.join(ROOT,d))) throw new Error(`Unwanted ${d}`);
for(let i=1;i<=31;i++) JSON.parse(read(`input/${i}.json`));
for(const d of ["types","subtypes","categories","activities","features","facilities","risks"]){const x=JSON.parse(read(`taxonomy/${d}.json`)); if(!Array.isArray(x.items)) throw new Error(`${d}.items missing`); const ids=x.items.map(v=>v.id); if(new Set(ids).size!==ids.length) throw new Error(`${d} duplicate ids`);}
const sc=JSON.parse(read("dataset/place.schema.json")); if("tags" in sc.properties) throw new Error("tags still present"); if("emergencyNumbers" in sc.properties.safety.properties) throw new Error("emergencyNumbers still present"); if("distanceKm" in sc.$defs.transportNode.properties) throw new Error("distanceKm still present");
const promptFiles=["01-start-province.txt","02-run-scope.txt","03-resume.txt","04-repair-entity.txt","05-final-audit-minify.txt"]; const prompts=promptFiles.map(f=>read(`prompts/${f}`)); const concrete=/\b(?:province|county|city|village|place)-\d+(?:-[A-Za-z0-9_-]+)*\b/; prompts.forEach((t,i)=>{if(concrete.test(t)) throw new Error(`Concrete ID in ${promptFiles[i]}`);});
if(!/province_id=<PROVINCE_ID>/.test(prompts[0])) throw new Error("Prompt01 input missing"); if(!/scope_id=<SCOPE_ID>/.test(prompts[1])) throw new Error("Prompt02 input missing"); if(!/previous_id=<PREVIOUS_ID>/.test(prompts[2])) throw new Error("Prompt03 input missing"); if(!/entity_id=<ENTITY_ID>/.test(prompts[3])) throw new Error("Prompt04 input missing"); if(!/final_audit=true/.test(prompts[4])) throw new Error("Prompt05 input missing");
if(read("src/server.ts").includes('"resolve_scope_name"')) throw new Error("legacy resolve_scope_name registered");
console.log("Planro verification PASS");
