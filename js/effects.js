/* effects.js — THE shared structured-effects processor. Dialogue, town
   events, jobs, knowledge questions, rumors, reflex tasks, and payment
   disputes all declare consequences in this shape and apply them here.
   Never infer consequences from prose. Never build a second effects system.

   Supported shape (all fields optional):
     effects: {
       scrap: 0,                        // + earned (tracked), - spent (tracked)
       rep: { fame,respect,fear,popularity },
       factions: { militia,merchants,mechanics,scavengers,crucible,
                   civilians,gangs,raiders,... },
       npcRelationship: 1,              // applies to ctx.npcId (legacy single)
       npcRelationships: { npcId: delta },
       career: { counter: delta },      // numeric career counters only
       historyFlags: { set:["flag"], increment:{flag:1} },
       setFlags:[...], incFlags:{...},  // legacy aliases, still honored
       journal: { type, data },         // routed via bus -> world.addJournal
       unlocks: ["key"],                // sets history.unlock_<key> = true
     }
   Unknown keys warn and are skipped — bad content never throws. */

import { G, bus } from "./core.js";

const KNOWN = new Set(["scrap","rep","factions","npcRelationship","npcRelationships",
  "career","historyFlags","setFlags","incFlags","journal","unlocks"]);

export function applyEffects(fx, ctx={}){
  if(!fx) return;
  try{
    for(const k of Object.keys(fx)) if(!KNOWN.has(k))
      console.warn("effects: unknown field skipped:", k, ctx.sourceId||"");
    if(typeof fx.scrap==="number" && fx.scrap!==0){
      if(fx.scrap>0){ G.scrap += Math.round(fx.scrap); G.career.scrapEarned += Math.round(fx.scrap); }
      else { const n = Math.min(G.scrap, Math.round(-fx.scrap)); G.scrap -= n; G.career.scrapSpent += n; }
    }
    if(fx.rep) for(const k of Object.keys(fx.rep)){
      if(G.rep[k]!==undefined && typeof fx.rep[k]==="number")
        G.rep[k] = Math.max(0, G.rep[k]+fx.rep[k]);
      else console.warn("effects: unknown rep key", k, ctx.sourceId||"");
    }
    if(fx.factions) for(const k of Object.keys(fx.factions))
      G.rep.factions[k] = (G.rep.factions[k]||0) + fx.factions[k];
    if(typeof fx.npcRelationship==="number" && ctx.npcId && G.npcs[ctx.npcId])
      G.npcs[ctx.npcId].relationship += fx.npcRelationship;
    if(fx.npcRelationships) for(const id of Object.keys(fx.npcRelationships)){
      if(!G.npcs[id]) G.npcs[id] = { encounterCount:0, lossesToPlayer:0, winsVsPlayer:0,
        relationship:0, disposition:"neutral", alive:true, memoryFlags:{} };
      G.npcs[id].relationship += fx.npcRelationships[id];
    }
    if(fx.career) for(const k of Object.keys(fx.career)){
      if(typeof G.career[k]==="number") G.career[k] += fx.career[k];
      else console.warn("effects: unknown/non-numeric career counter", k, ctx.sourceId||"");
    }
    const hset = (fx.historyFlags && fx.historyFlags.set) || fx.setFlags;
    if(hset) hset.forEach(f=>{ G.history[f] = true; });
    const hinc = (fx.historyFlags && fx.historyFlags.increment) || fx.incFlags;
    if(hinc) for(const k of Object.keys(hinc)) G.history[k] = (G.history[k]||0) + hinc[k];
    if(fx.journal && fx.journal.type) bus.emit("journal", fx.journal.type, fx.journal.data||{});
    if(fx.unlocks) fx.unlocks.forEach(k=>{ G.history["unlock_"+k] = true; });
  }catch(err){ console.warn("effects failed for", ctx.sourceId||"(unknown)", err); }
}

/* Idempotent application: a committed resolution applies exactly once.
   Resolution records live in G.jobs.resolutions keyed by rid. */
export function applyOnce(rid, fx, ctx={}){
  const res = G.jobs.resolutions[rid];
  if(res && res.applied) return false;
  applyEffects(fx, {...ctx, sourceId: ctx.sourceId||rid});
  G.jobs.resolutions[rid] = { ...(res||{}), applied:true, day:G.world.day };
  return true;
}
