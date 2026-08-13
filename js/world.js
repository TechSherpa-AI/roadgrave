/* world.js — the living-world layer. Owns writes to career counters,
   structured history flags, reputation, NPC memory, the journal, world
   resources/day, and scrap movement (earn/spend tracking). */

import { G, save, logMsg, ri, rand, bus } from "./core.js";
import { DATA, byId } from "./data.js";
import { say } from "./dialogue.js";

/* ---- economy: ALL scrap movement goes through these ------------------- */
export function earn(n, why){
  n = Math.max(0, Math.round(n));
  G.scrap += n;
  G.career.scrapEarned += n;
  return n;
}
export function spend(n){                 // returns false if unaffordable
  n = Math.max(0, Math.round(n));
  if(G.scrap < n) return false;
  G.scrap -= n;
  G.career.scrapSpent += n;
  return true;
}
export function forfeit(n){               // losses/fees: leaves scrapSpent alone
  n = Math.min(G.scrap, Math.max(0, Math.round(n)));
  G.scrap -= n;
  return n;
}

/* ---- reputation ------------------------------------------------------- */
export function bumpRep(kind, n){
  G.rep[kind] = Math.max(0, (G.rep[kind]||0) + n);
}
export function bumpFaction(id, n){
  G.rep.factions[id] = (G.rep.factions[id]||0) + n;
}
/* crowd fame tiers: 0 unknown / 1 emerging / 2 established / 3 famous / 4 legend */
export const TIER_NAMES = ["Unknown","Emerging","Established","Famous","Legend"];
export function fameTier(){
  const f = G.rep.fame;
  return f>=14?4 : f>=9?3 : f>=5?2 : f>=2?1 : 0;
}

/* ---- structured history flags ---------------------------------------- */
export function setFlag(key, val=true){ G.history[key] = val; }
export function incFlag(key, n=1){ G.history[key] = (G.history[key]||0) + n; }
export function flag(key){ return G.history[key]; }

/* ---- NPC memory ------------------------------------------------------- */
export function npcMem(id){
  if(!DATA.npcs[id]) console.warn("unknown npc:", id);
  if(!G.npcs[id]) G.npcs[id] = { encounterCount:0, lossesToPlayer:0, winsVsPlayer:0,
    relationship:0, disposition:"neutral", alive:true, memoryFlags:{} };
  return G.npcs[id];
}
export function npcDef(id){ return DATA.npcs[id] || {id, name:id, faction:null, personalityTags:[], motivationTags:[]}; }

/* ---- journal: structured data is authoritative, prose is rendered ----- */
const JOURNAL_PROSE = {
  created:    d=>`${d.name} signed the refinery's severance ledger and walked into Kettle Rock with 100 scrap and a driver's nerve.`,
  firstVehicle:d=>`Bought a ${d.chassisName} off the yard and named her ${d.vname}. Broke, armed with a shrug — but rolling.`,
  boutWin:    d=>`Beat ${d.foe} in the Crucible (${d.tierName}). Purse: ${d.purse} scrap. Streak: ${d.streak}.`,
  boutLoss:   d=>`Wrecked by ${d.foe} in the Crucible (${d.tierName}). Towed out ${d.lost} scrap lighter.`,
  championship:d=>`TOOK THE TITLE from ${d.foe}. Kettle Rock burned a new name into the Crucible gate.`,
  vehicleSold:d=>`Sold ${d.vname} back to the yard for ${d.value} scrap.`,
  majorRepair:d=>`${d.vname} rebuilt at the garage — ${d.cost} scrap of hammered steel and new welds.`,
  retired:    d=>`Hung up the wheel. Final legacy: ${d.legacy}.`,
  died:       d=>`The Gravel Sea kept what it took. Ironman career ended by ${d.foe||"the road"}.`,
};
export function addJournal(type, data={}){
  try{
    const prose = JOURNAL_PROSE[type];
    G.journal.push({ day:G.world.day, type, data,
      text: prose ? prose(data) : (data.text||type) });
    if(G.journal.length>500) G.journal.shift();
  }catch(e){ console.error("journal entry failed:", type, e); }
}
bus.on("journal", (type, data)=>addJournal(type, data));   // effects.js routes here

/* ---- the day: ONE place advances it ----------------------------------- */
export function advanceDay(){
  G.world.day++;
  bus.emit("dayAdvanced", G.world.day);
}

/* ---- vehicle history hooks (vehicles own their object; we increment) -- */
export function vhist(v){ return v.history; }

/* ---- emergency labor ---------------------------------------------------
   The floor under the economy: always available, once per day, modest pay,
   guaranteed to advance the day (which refreshes Job Board offers).
   Deliberately inferior to successful contracts. */
export const EMERGENCY_LABOR = {
  id:"wrench", name:"Emergency wrench shift", base:20, var:10,
  flavor:"Elbow-deep in someone else's bad decisions. The garage always needs hands.",
};
export function emergencyAvailable(){ return G.jobs.emergencyDay !== G.world.day; }
export function workShift(){
  if(!emergencyAvailable()) return null;
  const bonus = G.player.skills.mechanics*2;
  const payout = EMERGENCY_LABOR.base + bonus + ri(0, EMERGENCY_LABOR.var);
  G.jobs.emergencyDay = G.world.day;
  earn(payout, "labor");
  logMsg(`Day ${G.world.day}: ${EMERGENCY_LABOR.name}. Paid ${payout} scrap.`);
  advanceDay();
  maybeTownEvent();
  save();
  return payout;
}

/* ---- market resources ------------------------------------------------- */
export const RESOURCE_PRICES = { fuel:{cost:15, qty:10}, water:{cost:8, qty:5}, food:{cost:10, qty:5} };
export function buyResource(kind){
  const p = RESOURCE_PRICES[kind];
  if(!p || !spend(p.cost)) return false;
  G.world[kind] += p.qty;
  save();
  return true;
}

/* ---- ambient town events ----------------------------------------------
   Consequences are declared on the dialogue entries themselves (`effects`)
   and applied by the dialogue engine — never inferred from wording here. */
export function maybeTownEvent(chance=0.35, ctx="townEvent"){
  if(rand() > chance) return null;
  const line = say(ctx);
  if(line) logMsg(line);
  return line;
}

export function buyRumor(){
  if(!spend(5)) return null;
  const r = say("barRumor") || "The bar is loud and nobody's talking.";
  logMsg("Slag Bar: " + r);
  save();
  return r;
}
