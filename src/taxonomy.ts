import fs from "node:fs";
import path from "node:path";
import { config, assertSafeSegment } from "./config.js";

export const TAXONOMY_DOMAINS = ["types","subtypes","categories","activities","features","facilities","risks"] as const;
export type TaxonomyDomain = typeof TAXONOMY_DOMAINS[number];
export interface TaxonomyItem { id:string; label:string; description?:string; aliases?:string[]; }
export interface TaxonomySubtypeItem extends TaxonomyItem { appliesTo:string[]; }
export interface TaxonomyBundle { version:string; types:TaxonomyItem[]; subtypes:TaxonomySubtypeItem[]; categories:TaxonomyItem[]; activities:TaxonomyItem[]; features:TaxonomyItem[]; facilities:TaxonomyItem[]; risks:TaxonomyItem[]; }
export interface TaxonomyProposal { proposalId:string; domain:TaxonomyDomain; id:string; label:string; description:string; rationale:string; appliesTo?:string[]; aliases?:string[]; examples?:string[]; proposedBy:string; createdAt:string; status:"pending"|"accepted"|"rejected"; }
let cached:TaxonomyBundle|null=null;
function readFile<T>(name:string):T { return JSON.parse(fs.readFileSync(path.join(config.taxonomyDir,name),"utf8")) as T; }
function validate(list:TaxonomyItem[], domain:string){ const ids=new Set<string>(); for(const x of list){ if(!/^[a-z][a-z0-9_-]*$/.test(x.id)||ids.has(x.id)||!x.label?.trim()) throw new Error(`Invalid taxonomy item in ${domain}: ${x.id}`); ids.add(x.id); } }
export function getTaxonomy():TaxonomyBundle { if(cached)return cached; const types=readFile<{version:string;items:TaxonomyItem[]}>("types.json"), sub=readFile<{items:TaxonomySubtypeItem[]}>("subtypes.json"), cats=readFile<{items:TaxonomyItem[]}>("categories.json"), acts=readFile<{items:TaxonomyItem[]}>("activities.json"), feats=readFile<{items:TaxonomyItem[]}>("features.json"), facs=readFile<{items:TaxonomyItem[]}>("facilities.json"), risks=readFile<{items:TaxonomyItem[]}>("risks.json"); const t={version:types.version,types:types.items,subtypes:sub.items,categories:cats.items,activities:acts.items,features:feats.items,facilities:facs.items,risks:risks.items}; for(const d of ["types","categories","activities","features","facilities","risks"] as const)validate(t[d],d); for(const x of t.subtypes){ if(!x.appliesTo?.length||x.appliesTo.some(id=>!t.types.some(y=>y.id===id))) throw new Error(`Invalid subtype ${x.id}`); } cached=t; return t; }
export function getTaxonomyDomain(domain?:string){ const t=getTaxonomy(); if(!domain)return t; assertSafeSegment(domain,"domain"); if(!(TAXONOMY_DOMAINS as readonly string[]).includes(domain)) throw new Error(`Unknown taxonomy domain '${domain}'.`); return t[domain as TaxonomyDomain]; }
export function hasTaxonomyItem(domain:TaxonomyDomain,id:string){ return (getTaxonomy()[domain] as TaxonomyItem[]).some(x=>x.id===id); }
export function getSubtype(id:string){ return getTaxonomy().subtypes.find(x=>x.id===id); }
function proposalPath(){return path.join(config.taxonomyDir,"agent-taxonomy","proposals.json");}
export function readTaxonomyProposals():TaxonomyProposal[]{const f=proposalPath();return fs.existsSync(f)?JSON.parse(fs.readFileSync(f,"utf8")):[];}
export function proposeTaxonomyItem(input:Omit<TaxonomyProposal,"proposalId"|"createdAt"|"status">){ if(hasTaxonomyItem(input.domain,input.id)) throw new Error(`Taxonomy item '${input.id}' already exists.`); if(!/^[a-z][a-z0-9_-]*$/.test(input.id)) throw new Error("Invalid taxonomy proposal id."); const old=readTaxonomyProposals(); const dup=old.find(x=>x.domain===input.domain&&x.id===input.id&&x.status==="pending"); if(dup)return dup; const x={...input,proposalId:`taxprop-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,createdAt:new Date().toISOString(),status:"pending" as const}; fs.mkdirSync(path.dirname(proposalPath()),{recursive:true}); fs.writeFileSync(proposalPath(),JSON.stringify([...old,x],null,2)+"\n"); return x;}
