/* legacy.js — career evaluation. Pure: reads G, mutates nothing.
   Performance (1-100, "how well did you play") and archetype ("what was
   this career") are separate concepts by design. */

import { ARCHETYPES } from "./data-legacy.js";

/* Performance: effectiveness only. Morality plays no part. */
export function performanceScore(g){
  const c = g.career, r = g.rep;
  let p = 1;
  p += Math.min(30, c.crucibleWins*4);              // fighting record
  p += Math.min(15, c.championships*8);
  p += Math.min(10, c.bestStreak*2);
  p += Math.min(15, Math.floor(c.scrapEarned/150)); // economic engine
  p += Math.min(10, c.contractsDone*2);
  p += Math.min(10, Math.floor((r.fame + r.respect + r.fear + r.popularity)/4));
  p += Math.min(9,  c.discoveries.length*2 + Math.max(0,c.settlementsVisited.length-1)*2);
  p -= Math.min(20, c.crucibleLosses*3);            // getting wrecked is ineffective
  return Math.max(1, Math.min(100, Math.round(p)));
}

export function classify(g){
  const perf = performanceScore(g);
  const band = perf>=70 ? ARCHETYPES.high : perf>=35 ? ARCHETYPES.mid : ARCHETYPES.fail;
  let arch = band[band.length-1];
  for(const a of band){
    try{ if(a.test(g.career, g.rep, g.history)){ arch = a; break; } }
    catch(e){ console.warn("legacy predicate failed:", a.id, e); }
  }
  return { performance:perf, archetype:arch };
}

/* Full evaluation for the legacy screen / tests. */
export function evaluate(g){
  const { performance, archetype } = classify(g);
  return {
    performance,
    id: archetype.id,
    name: archetype.name,
    text: archetype.text,
    career: {
      bouts: g.career.crucibleWins + g.career.crucibleLosses,
      wins: g.career.crucibleWins,
      losses: g.career.crucibleLosses,
      championships: g.career.championships,
      bestStreak: g.career.bestStreak,
      scrapEarned: g.career.scrapEarned,
      daysOnTheRoad: g.world.day,
      journalEntries: g.journal.length,
    },
  };
}
