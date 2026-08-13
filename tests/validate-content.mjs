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
import { CONTRACTS, RUMORS, DISPUTE_TRUTHS, DISPUTE_WITNESS, FUTURE_ENCOUNTERS } from "../js/data-jobs.js";
import { JOURNAL_TYPES } from "../js/world.js";

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

/* ---- shared effects shape (jobs, rumors, disputes, dialogue) ----------- */
const FX_FIELDS = new Set(["scrap","rep","factions","npcRelationship","npcRelationships",
  "career","historyFlags","setFlags","incFlags","journal","unlocks"]);
const FACTIONS = new Set(["militia","merchants","mechanics","scavengers","crucible",
  "civilians","gangs","raiders","zealots"]);
const SKILLS = new Set(["driving","gunnery","mechanics","scrounge"]);
function checkFx(fx, tag){
  if(!fx) return;
  for(const k of Object.keys(fx)) if(!FX_FIELDS.has(k)) err(`${tag}: unknown effect field '${k}'`);
  if(fx.rep) for(const k of Object.keys(fx.rep)) if(!REP_KEYS.has(k)) err(`${tag}: unknown rep '${k}'`);
  if(fx.factions) for(const k of Object.keys(fx.factions)) if(!FACTIONS.has(k)) err(`${tag}: unknown faction '${k}'`);
  if(fx.npcRelationships) for(const k of Object.keys(fx.npcRelationships)) if(!NPC_IDS.has(k)) err(`${tag}: unknown npc '${k}'`);
  if(fx.journal && !JOURNAL_TYPES.includes(fx.journal.type)) err(`${tag}: unknown journal type '${fx.journal.type}'`);
}

/* ---- contracts --------------------------------------------------------- */
{
  const RISKS = new Set(["low","medium","high"]);
  const FAMILIES = new Set(["decision","knowledge","reflex"]);
  const ids = new Set();
  const rumorIds = new Set(RUMORS.map(r=>r.id));
  for(const c of CONTRACTS){
    const tag = "contract "+(c.id||"(no id)");
    if(!c.id) err("contract missing id");
    else if(ids.has(c.id)) err("duplicate contract id "+c.id); else ids.add(c.id);
    for(const f of ["title","family","employerNpcId","employerFaction","description",
                    "paymentRange","timeCost","risk","tags","journalType"])
      if(c[f]===undefined) err(`${tag}: missing ${f}`);
    if(!FAMILIES.has(c.family)) err(`${tag}: unknown family '${c.family}'`);
    if(!NPC_IDS.has(c.employerNpcId)) err(`${tag}: unknown employer npc '${c.employerNpcId}'`);
    if(!FACTIONS.has(c.employerFaction)) err(`${tag}: unknown employer faction '${c.employerFaction}'`);
    if(!Array.isArray(c.paymentRange) || c.paymentRange.length!==2
       || c.paymentRange[0]>c.paymentRange[1] || c.paymentRange[0]<0)
      err(`${tag}: impossible payment range`);
    if(!RISKS.has(c.risk)) err(`${tag}: unknown risk '${c.risk}'`);
    if(![0,1].includes(c.timeCost)) err(`${tag}: timeCost must be 0 or 1`);
    if(!JOURNAL_TYPES.includes(c.journalType)) err(`${tag}: unknown journalType '${c.journalType}'`);
    if(c.paymentDispute && !(c.paymentDispute.chance>0 && c.paymentDispute.chance<=1))
      err(`${tag}: paymentDispute.chance must be in (0,1]`);
    checkFx(c.successEffects, tag+".success"); checkFx(c.partialEffects, tag+".partial");
    checkFx(c.failureEffects, tag+".failure");
    if(c.family==="decision"){
      if(!Array.isArray(c.approaches) || !c.approaches.length) err(`${tag}: decision contract needs approaches`);
      const aids = new Set();
      for(const a of c.approaches||[]){
        const at = tag+"."+(a.id||"?");
        if(!a.id || aids.has(a.id)) err(`${at}: missing/duplicate approach id`); else aids.add(a.id);
        if(!a.label || !a.description) err(`${at}: missing label/description`);
        if(a.skill && !SKILLS.has(a.skill)) err(`${at}: unknown skill '${a.skill}'`);
        if(a.repStat && !REP_KEYS.has(a.repStat)) err(`${at}: unknown repStat '${a.repStat}'`);
        if(!a.skill && !a.repStat && !a.noCheck) err(`${at}: needs skill, repStat, or noCheck`);
        if(a.requiredRep) for(const k of Object.keys(a.requiredRep)) if(!REP_KEYS.has(k)) err(`${at}: bad requiredRep '${k}'`);
        if(a.requiredFactionRep) for(const k of Object.keys(a.requiredFactionRep)) if(!FACTIONS.has(k)) err(`${at}: bad requiredFactionRep '${k}'`);
        checkFx(a.successEffects, at+".success"); checkFx(a.partialEffects, at+".partial");
        checkFx(a.failureEffects, at+".failure");
      }
    }
    if(c.family==="knowledge"){
      if(!Array.isArray(c.questions) || c.questions.length!==3) err(`${tag}: knowledge contract needs exactly 3 questions`);
      for(const q of c.questions||[]){
        if(!q.id || !q.text || !Array.isArray(q.options)) err(`${tag}: malformed question`);
        else if(q.correct===undefined || q.correct<0 || q.correct>=q.options.length)
          err(`${tag}.${q.id}: correct index out of range`);
        if(q.rumorHint && !rumorIds.has(q.rumorHint)) err(`${tag}.${q.id}: unknown rumorHint '${q.rumorHint}'`);
      }
    }
    if(c.family==="reflex"){
      const r = c.reflex||{};
      if(!r.targets || !Array.isArray(r.zones) || r.zones.length<2 || !r.payPerHit || !r.windowMs)
        err(`${tag}: malformed reflex definition`);
      else if(r.targets*r.payPerHit < c.paymentRange[1])
        err(`${tag}: max payout unreachable (targets*payPerHit < paymentRange max)`);
    }
    if(c.requirements){
      const reqs = c.requirements.any || [c.requirements];
      for(const r of reqs){
        if(r.skills) for(const k of Object.keys(r.skills)) if(!SKILLS.has(k)) err(`${tag}: bad requirement skill '${k}'`);
        if(r.rep) for(const k of Object.keys(r.rep)) if(!REP_KEYS.has(k)) err(`${tag}: bad requirement rep '${k}'`);
        if(r.factionRep) for(const k of Object.keys(r.factionRep)) if(!FACTIONS.has(k)) err(`${tag}: bad requirement faction '${k}'`);
      }
    }
  }
  if(!CONTRACTS.some(c=>c.family==="knowledge" && (c.questions||[]).some(q=>q.rumorHint)))
    err("contracts: no knowledge contract carries a Slag Bar rumor hint");
}

/* ---- rumors ------------------------------------------------------------ */
{
  const RELIABILITY = new Set(["accurate","incomplete","exaggerated","outdated","mistaken","planted"]);
  const ids = new Set();
  for(const r of RUMORS){
    const tag = "rumor "+(r.id||"(no id)");
    if(!r.id || ids.has(r.id)) err(tag+": missing/duplicate id"); else ids.add(r.id);
    for(const f of ["text","sourceDisplayName","location","relatedJobTags","reliability","hintText"])
      if(r[f]===undefined) err(`${tag}: missing ${f}`);
    if(r.sourceNpcId && !NPC_IDS.has(r.sourceNpcId)) err(`${tag}: unknown source npc`);
    if(r.relatedNpcIds) r.relatedNpcIds.forEach(n=>{ if(!NPC_IDS.has(n)) err(`${tag}: unknown related npc '${n}'`); });
    if(r.relatedFaction && !FACTIONS.has(r.relatedFaction)) err(`${tag}: unknown faction`);
    if(!RELIABILITY.has(r.reliability)) err(`${tag}: unknown reliability '${r.reliability}'`);
    checkFx(r.effects, tag);
  }
  // every non-bubba rumor's job tags reach at least one contract
  for(const r of RUMORS){
    if(r.relatedEncounterTags) continue;
    if(!CONTRACTS.some(c=>c.tags.some(t=>r.relatedJobTags.includes(t))))
      err("rumor "+r.id+": relatedJobTags match no contract");
  }
}

/* ---- payment disputes -------------------------------------------------- */
{
  for(const t of DISPUTE_TRUTHS){
    const tag = "disputeTruth "+t.id;
    for(const f of ["cash","hidden","future"]){
      const rng = t[f];
      if(!Array.isArray(rng) || rng.length!==2 || rng[0]>rng[1] || rng[0]<0 || rng[1]>1)
        err(`${tag}: ${f} percentage range invalid`);
    }
    if(!(t.weight>0)) err(tag+": weight must be > 0");
  }
  for(const k of Object.keys(DISPUTE_WITNESS))
    if(!FACTIONS.has(k)) err("disputeWitness: unknown faction "+k);
}

/* ---- future encounter fixtures ----------------------------------------- */
{
  const rumorIds = new Set(RUMORS.map(r=>r.id));
  for(const e of FUTURE_ENCOUNTERS){
    const tag = "encounter "+e.id;
    if(e.enabled) err(tag+": future encounters must remain disabled before Slice 3");
    if(!e.special || !rumorIds.has(e.special.requiresRumor)) err(tag+": special option needs a real rumor");
    if(!NPC_IDS.has(e.npc)) err(tag+": unknown npc");
    if(!(e.options||[]).length) err(tag+": needs baseline options");
  }
}

/* ---- player-facing currency audit: scrap, never caps ------------------- */
{
  const ALLOWLIST = [];   // strings verified as unrelated lore may be listed here
  const offenders = [];
  const scan = (text, where)=>{
    if(typeof text!=="string") return;
    if(/\bcaps?\b/i.test(text) && !ALLOWLIST.includes(text)) offenders.push(where+": "+text.slice(0,60));
  };
  LINES.forEach(e=>e&&scan(e.text, "dialogue "+e.id));
  RUMORS.forEach(r=>{ scan(r.text,"rumor "+r.id); scan(r.hintText,"rumor "+r.id+".hint"); scan(r.signal,"rumor "+r.id+".signal"); });
  CONTRACTS.forEach(c=>{
    scan(c.title,"contract "+c.id); scan(c.description,"contract "+c.id);
    (c.approaches||[]).forEach(a=>{ scan(a.label,c.id+"."+a.id); scan(a.description,c.id+"."+a.id); });
    (c.questions||[]).forEach(q=>{ scan(q.text,c.id+"."+q.id); (q.options||[]).forEach(o=>scan(o,c.id+"."+q.id)); });
  });
  Object.values(ARCHETYPES).flat().forEach(a=>{ scan(a.name,"legacy "+a.id); scan(a.text,"legacy "+a.id); });
  DATA.arena.forEach(t=>{ scan(t.pitch,"arena "+t.id); (t.intro||[]).forEach(x=>scan(x,"arena "+t.id));
    scan(t.winText,"arena "+t.id); scan(t.loseText,"arena "+t.id); });
  FUTURE_ENCOUNTERS.forEach(e=>{ (e.special.narrative||[]).forEach(x=>scan(x,"encounter "+e.id)); scan(e.special.recallLine,"encounter "+e.id); });
  offenders.forEach(o=>err("currency: player-facing 'caps' — "+o));
}

if(errors.length){
  console.error("CONTENT VALIDATION FAILED:");
  errors.forEach(e=>console.error("  ✗", e));
  process.exit(1);
}
console.log(`content validation passed (${LINES.length} dialogue entries, ${Object.values(ARCHETYPES).flat().length} archetypes, ${CONTRACTS.length} contracts, ${RUMORS.length} rumors)`);
