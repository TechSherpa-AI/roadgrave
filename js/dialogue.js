/* dialogue.js — data-driven line selection. Filters data-dialogue.js
   entries by context + conditions against current state, applies weights,
   avoids recent repeats, and returns text (or null). Malformed entries are
   skipped, never fatal. */

import { G, rand } from "./core.js";
import { DATA } from "./data.js";
import { LINES } from "./data-dialogue.js";

const RECENT_MAX = 24;

function fameTierIdx(){
  const f = G.rep.fame;
  return f>=14?4 : f>=9?3 : f>=5?2 : f>=2?1 : 0;
}

function eligible(e, ctx, opts){
  if(e.ctx !== ctx) return false;
  const speaker = opts.speaker || null;
  if(e.speaker && e.speaker !== speaker) return false;
  if(e.personality){
    if(!speaker) return false;
    const tags = (DATA.npcs[speaker] && DATA.npcs[speaker].personalityTags) || [];
    if(!e.personality.some(t=>tags.includes(t))) return false;
  }
  if(e.minLosses!==undefined || e.maxLosses!==undefined){
    if(!speaker) return false;
    const mem = G.npcs[speaker];
    const losses = mem ? mem.lossesToPlayer : 0;
    if(e.minLosses!==undefined && losses < e.minLosses) return false;
    if(e.maxLosses!==undefined && losses > e.maxLosses) return false;
  }
  if(e.minStreak!==undefined && G.career.streak < e.minStreak) return false;
  const tier = fameTierIdx();
  if(e.minTier!==undefined && tier < e.minTier) return false;
  if(e.maxTier!==undefined && tier > e.maxTier) return false;
  if(e.minFear!==undefined && G.rep.fear < e.minFear) return false;
  if(e.minPopularity!==undefined && G.rep.popularity < e.minPopularity) return false;
  if(e.minRespect!==undefined && G.rep.respect < e.minRespect) return false;
  if(e.appearance){
    for(const k of Object.keys(e.appearance))
      if(G.player.appearance[k] !== e.appearance[k]) return false;
  }
  if(e.requiredFlags && !e.requiredFlags.every(f=>G.history[f])) return false;
  if(e.excludedFlags && e.excludedFlags.some(f=>G.history[f])) return false;
  if(e.once){
    if(speaker){
      const mem = G.npcs[speaker];
      if(mem && mem.memoryFlags[e.once]) return false;
    } else if(G.history["once_"+e.once]) return false;
  }
  return true;
}

/* Declared consequences: entries carry an `effects` object instead of the
   engine inferring anything from wording.
     effects: { rep:{fame:1,...}, factions:{militia:1,...},
                setFlags:["key"], incFlags:{key:1},
                npcRelationship: 1 }        // applies to opts.speaker
   Unknown effect keys are ignored with a warning — bad content never throws. */
function applyEffects(e, opts){
  const fx = e.effects;
  if(!fx) return;
  try{
    if(fx.rep) for(const k of Object.keys(fx.rep)){
      if(G.rep[k]!==undefined && typeof fx.rep[k]==="number") G.rep[k] = Math.max(0, G.rep[k]+fx.rep[k]);
      else console.warn("dialogue effect: unknown rep key", k, "in", e.id);
    }
    if(fx.factions) for(const k of Object.keys(fx.factions)){
      G.rep.factions[k] = (G.rep.factions[k]||0) + fx.factions[k];
    }
    if(fx.setFlags) fx.setFlags.forEach(f=>{ G.history[f] = true; });
    if(fx.incFlags) for(const k of Object.keys(fx.incFlags)){
      G.history[k] = (G.history[k]||0) + fx.incFlags[k];
    }
    if(fx.npcRelationship && opts.speaker && G.npcs[opts.speaker]){
      G.npcs[opts.speaker].relationship += fx.npcRelationship;
    }
  }catch(err){ console.warn("dialogue effects failed for", e.id, err); }
}

/* Pick a line for a context. opts: {speaker} */
export function say(ctx, opts={}){
  let pool = [];
  for(const e of LINES){
    try{
      if(!e || !e.id || !e.text) continue;         // malformed: skip
      if(eligible(e, ctx, opts)) pool.push(e);
    }catch(err){ console.warn("bad dialogue entry skipped:", e && e.id, err); }
  }
  if(!pool.length) return null;
  // anti-repeat: drop recently used unless that would empty the pool
  const recent = G.narrative.recent;
  const freshPool = pool.filter(e=>!recent.includes(e.id));
  if(freshPool.length) pool = freshPool;
  // weighted pick
  const total = pool.reduce((a,e)=>a+(e.weight||1),0);
  let roll = rand()*total;
  let chosen = pool[pool.length-1];
  for(const e of pool){ roll -= (e.weight||1); if(roll<=0){ chosen = e; break; } }
  // record use
  recent.push(chosen.id);
  if(recent.length>RECENT_MAX) recent.shift();
  if(chosen.once){
    if(opts.speaker && G.npcs[opts.speaker]) G.npcs[opts.speaker].memoryFlags[chosen.once] = true;
    else if(!opts.speaker) G.history["once_"+chosen.once] = true;
  }
  applyEffects(chosen, opts);
  return chosen.text;
}
