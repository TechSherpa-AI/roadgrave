/* Content schema validation — `node tests/validate-content.mjs`
   Validates data files (dialogue, legacy archetypes, core tables, golden
   fixtures) so malformed content fails CI instead of failing players. */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { LINES } from "../js/data-dialogue.js";
import { ARCHETYPES } from "../js/data-legacy.js";
import { DATA } from "../js/data.js";
import { newGame } from "../js/core.js";

let errors = [];
const err = (m)=>errors.push(m);

/* ---- dialogue entries -------------------------------------------------- */
const KNOWN_CTX = new Set(["crucibleTaunt","cruciblePain","crucibleBeaten","crucibleVictor",
  "crowdEntrance","crowdAmbient","crowdWin","crowdLoss","townEvent","barEvent","barRumor"]);
const KNOWN_PERSONALITY = new Set(["bloodthirsty","greedy","desperate","honorable","frightened",
  "ambitious","loyal","sadistic","ideological","opportunistic"]);
const NPC_IDS = new Set(Object.keys(DATA.npcs));
const REP_KEYS = new Set(["fame","respect","fear","popularity"]);
const APPEAR = Object.fromEntries(DATA.appearance.map(c=>[c.id, new Set(c.opts.map(o=>o.id))]));
const ENTRY_FIELDS = new Set(["id","ctx","speaker","personality","minLosses","maxLosses",
  "minStreak","minTier","maxTier","minFear","minPopularity","minRespect","appearance",
  "requiredFlags","excludedFlags","once","weight","effects","text"]);
const EFFECT_FIELDS = new Set(["rep","factions","setFlags","incFlags","npcRelationship"]);

const seen = new Set();
for(const e of LINES){
  if(!e || typeof e!=="object"){ err("dialogue: non-object entry"); continue; }
  const tag = e.id || "(no id)";
  if(!e.id) err("dialogue: entry missing id");
  else if(seen.has(e.id)) err("dialogue: duplicate id "+e.id);
  else seen.add(e.id);
  if(!e.ctx || !KNOWN_CTX.has(e.ctx)) err(`dialogue ${tag}: unknown ctx '${e.ctx}'`);
  if(!e.text || typeof e.text!=="string" || !e.text.trim()) err(`dialogue ${tag}: missing text`);
  for(const k of Object.keys(e)) if(!ENTRY_FIELDS.has(k)) err(`dialogue ${tag}: unknown field '${k}'`);
  if(e.speaker && !NPC_IDS.has(e.speaker)) err(`dialogue ${tag}: unknown speaker '${e.speaker}'`);
  if(e.personality){
    if(!Array.isArray(e.personality)) err(`dialogue ${tag}: personality must be array`);
    else e.personality.forEach(t=>{ if(!KNOWN_PERSONALITY.has(t)) err(`dialogue ${tag}: unknown personality tag '${t}'`); });
  }
  for(const k of ["minLosses","maxLosses","minStreak","minFear","minPopularity","minRespect"])
    if(e[k]!==undefined && (typeof e[k]!=="number" || e[k]<0)) err(`dialogue ${tag}: ${k} must be a non-negative number`);
  for(const k of ["minTier","maxTier"])
    if(e[k]!==undefined && (typeof e[k]!=="number" || e[k]<0 || e[k]>4)) err(`dialogue ${tag}: ${k} out of tier range 0-4`);
  if(e.minTier!==undefined && e.maxTier!==undefined && e.minTier>e.maxTier) err(`dialogue ${tag}: minTier > maxTier`);
  if(e.minLosses!==undefined && e.maxLosses!==undefined && e.minLosses>e.maxLosses) err(`dialogue ${tag}: minLosses > maxLosses`);
  if(e.weight!==undefined && (typeof e.weight!=="number" || e.weight<=0)) err(`dialogue ${tag}: weight must be > 0`);
  if(e.appearance){
    for(const [cat,opt] of Object.entries(e.appearance)){
      if(!APPEAR[cat]) err(`dialogue ${tag}: unknown appearance category '${cat}'`);
      else if(!APPEAR[cat].has(opt)) err(`dialogue ${tag}: unknown option '${opt}' for '${cat}'`);
    }
  }
  for(const k of ["requiredFlags","excludedFlags"])
    if(e[k]!==undefined && !Array.isArray(e[k])) err(`dialogue ${tag}: ${k} must be an array`);
  if(e.effects){
    for(const k of Object.keys(e.effects)) if(!EFFECT_FIELDS.has(k)) err(`dialogue ${tag}: unknown effect '${k}'`);
    if(e.effects.rep) for(const k of Object.keys(e.effects.rep)){
      if(!REP_KEYS.has(k)) err(`dialogue ${tag}: unknown rep key '${k}'`);
      if(typeof e.effects.rep[k]!=="number") err(`dialogue ${tag}: rep.${k} must be a number`);
    }
    if(e.effects.setFlags && !Array.isArray(e.effects.setFlags)) err(`dialogue ${tag}: setFlags must be an array`);
    if(e.effects.incFlags) for(const k of Object.keys(e.effects.incFlags))
      if(typeof e.effects.incFlags[k]!=="number") err(`dialogue ${tag}: incFlags.${k} must be a number`);
    if(e.effects.npcRelationship!==undefined && typeof e.effects.npcRelationship!=="number")
      err(`dialogue ${tag}: npcRelationship must be a number`);
  }
}
// every context the engine is asked for at runtime has at least one entry
for(const ctx of KNOWN_CTX)
  if(!LINES.some(e=>e && e.ctx===ctx)) err("dialogue: no entries for ctx "+ctx);

/* ---- legacy archetypes -------------------------------------------------- */
{
  const g = newGame();
  const ids = new Set();
  for(const [band, list] of Object.entries(ARCHETYPES)){
    if(!Array.isArray(list) || !list.length){ err("legacy: band "+band+" empty"); continue; }
    for(const a of list){
      if(!a.id || !a.name || !a.text) err("legacy: archetype missing id/name/text in band "+band);
      if(ids.has(a.id)) err("legacy: duplicate archetype id "+a.id); else ids.add(a.id);
      if(typeof a.test!=="function") err("legacy "+a.id+": test must be a function");
      else { try{ a.test(g.career, g.rep, g.history); }catch(e){ err("legacy "+a.id+": test throws on fresh state: "+e.message); } }
    }
    const last = list[list.length-1];
    try{ if(!last.test(g.career, g.rep, g.history)) err("legacy: band "+band+" has no catch-all final archetype"); }
    catch(e){ err("legacy: band "+band+" catch-all throws"); }
  }
}

/* ---- core data cross-references ---------------------------------------- */
{
  for(const t of DATA.arena){
    if(!DATA.npcs[t.npc]) err("arena "+t.id+": unknown npc "+t.npc);
    if(t.req && !DATA.arena.some(x=>x.id===t.req)) err("arena "+t.id+": unknown req "+t.req);
    if(!DATA.chassis.some(c=>c.id===t.foe.v.chassis)) err("arena "+t.id+": unknown foe chassis");
    if(!DATA.plants.some(p=>p.id===t.foe.v.plant)) err("arena "+t.id+": unknown foe plant");
    t.foe.v.weapons.forEach(w=>{ if(!DATA.weapons.some(x=>x.id===w.id)) err("arena "+t.id+": unknown foe weapon "+w.id); });
    t.foe.v.gear.forEach(g2=>{ if(!DATA.gear.some(x=>x.id===g2.id)) err("arena "+t.id+": unknown foe gear "+g2.id); });
    if(!t.winText || !t.loseText || !t.intro) err("arena "+t.id+": missing narrative fields");
  }
  const SCREENS_KNOWN = new Set(["garage","market","jobs","bar","arena"]);
  DATA.mapHotspots.forEach(h=>{
    if(!SCREENS_KNOWN.has(h.screen)) err("mapHotspot: unknown screen "+h.screen);
    for(const k of ["x","y","w","h"]) if(typeof h[k]!=="number" || h[k]<0 || h[k]>100) err("mapHotspot "+h.screen+": bad "+k);
  });
  if(DATA.appearance.length!==6) err("appearance: expected 6 categories, got "+DATA.appearance.length);
  DATA.appearance.forEach(c=>{ if(c.opts.length!==3) err("appearance "+c.id+": expected 3 options"); });
}

/* ---- fixtures parse ------------------------------------------------------ */
{
  const dir = join(dirname(fileURLToPath(import.meta.url)), "golden");
  if(existsSync(dir)){
    for(const f of readdirSync(dir).filter(f=>f.endsWith(".json"))){
      try{ JSON.parse(readFileSync(join(dir,f),"utf8")); }
      catch(e){ err("golden fixture "+f+" is not valid JSON"); }
    }
  } else err("tests/golden missing");
  const ldir = join(dirname(fileURLToPath(import.meta.url)), "legacy-saves");
  if(existsSync(ldir)){
    for(const f of readdirSync(ldir).filter(f=>f.endsWith(".json"))){
      try{ JSON.parse(readFileSync(join(ldir,f),"utf8")); }
      catch(e){ err("legacy save "+f+" is not valid JSON"); }
    }
  }
}

if(errors.length){
  console.error("CONTENT VALIDATION FAILED:");
  errors.forEach(e=>console.error("  ✗", e));
  process.exit(1);
}
console.log(`content validation passed (${LINES.length} dialogue entries, ${Object.values(ARCHETYPES).flat().length} archetypes)`);
