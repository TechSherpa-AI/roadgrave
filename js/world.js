/* world.js — the living-world layer. Owns writes to career counters,
   structured history flags, reputation, NPC memory, the journal, world
   resources/day, and scrap movement (earn/spend tracking). */

import { G, save, logMsg, ri, rand } from "./core.js";
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

/* ---- vehicle history hooks (vehicles own their object; we increment) -- */
export function vhist(v){ return v.history; }

/* ---- day-advancing town work ------------------------------------------ */
export function workShift(id){
  const job = byId(DATA.shifts, id);
  if(!job) return null;
  const bonus = G.player.skills[job.skill]*5;
  let payout = job.base + bonus + ri(-job.var, job.var);
  G.world.day++;
  let extra = "";
  if(rand() < 0.1){
    const found = ri(8,20);
    payout += found;
    extra = ` A loose panel hides ${found} scrap someone never came back for.`;
  }
  earn(payout, "shift");
  logMsg(`Day ${G.world.day-1}: ${job.name}. Paid ${payout} scrap.${extra}`);
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

/* ---- ambient town events ---------------------------------------------- */
export function maybeTownEvent(chance=0.35, ctx="townEvent"){
  if(rand() > chance) return null;
  const line = say(ctx);
  if(line){
    logMsg(line);
    if(ctx==="townEvent" && /shake my hand|one of OURS|autograph/i.test(line)) bumpRep("popularity", 1);
    // the bar admirer two-parter: seeing part 1 unlocks part 2
    if(line.includes("keeps looking at you")) setFlag("barAdmirerSeen");
  }
  return line;
}

export function buyRumor(){
  if(!spend(5)) return null;
  const r = say("barRumor") || "The bar is loud and nobody's talking.";
  logMsg("Slag Bar: " + r);
  save();
  return r;
}
