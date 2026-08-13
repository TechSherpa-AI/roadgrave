/* jobs.js — Job Board engine: persistent daily offers, one active contract,
   atomic idempotent resolution, expiry/abandonment, knowledge quizzes,
   reflex tasks, and REMEMBER integration. Consequences flow through
   js/effects.js; payments may be intercepted by js/disputes.js. */

import { G, save, logMsg, rand, ri, pick, bus } from "./core.js";
import { DATA } from "./data.js";
import { CONTRACTS, RUMORS } from "./data-jobs.js";
import { applyEffects, applyOnce } from "./effects.js";
import { advanceDay, spend } from "./world.js";
import { say } from "./dialogue.js";
import { vehicle, roadworthy } from "./vehicles.js";
import { maybeCreateDispute } from "./disputes.js";

export const contractById = id => CONTRACTS.find(c=>c.id===id);
const EXPIRY_DAYS_DEFAULT = 3;

/* ---- requirements ------------------------------------------------------ */
function meetsOne(req){
  if(req.skills) for(const k of Object.keys(req.skills))
    if((G.player.skills[k]||0) < req.skills[k]) return false;
  if(req.rep) for(const k of Object.keys(req.rep))
    if((G.rep[k]||0) < req.rep[k]) return false;
  if(req.factionRep) for(const k of Object.keys(req.factionRep))
    if((G.rep.factions[k]||0) < req.factionRep[k]) return false;
  if(req.flags && !req.flags.every(f=>G.history[f])) return false;
  return true;
}
export function meetsRequirements(c){
  const r = c.requirements;
  if(!r) return true;
  if(r.any) return r.any.some(meetsOne);
  return meetsOne(r);
}
export function onCooldown(c){
  const until = G.jobs.cooldowns[c.id];
  return until !== undefined && G.world.day < until;
}
export function exhausted(c){
  return c.repeatable===false && G.jobs.history.some(h=>h.cid===c.id);
}

/* ---- rumors ------------------------------------------------------------ */
export function rumorById(id){ return RUMORS.find(r=>r.id===id); }
export function learnedRumor(id){ return G.rumors.some(r=>r.id===id); }
export function learnRumor(id){
  if(learnedRumor(id)) return null;
  const def = rumorById(id);
  if(!def) return null;
  const rec = { id:def.id, text:def.text, sourceNpcId:def.sourceNpcId||null,
    sourceDisplayName:def.sourceDisplayName||"Someone", location:def.location||"The Slag Bar",
    dayHeard:G.world.day, expired:false, recallUsed:false };
  G.rumors.push(rec);
  applyEffects(def.effects, {sourceId:def.id});
  bus.emit("journal", "rumor", { source:rec.sourceDisplayName, text:def.text });
  return rec;
}
/* learned rumors whose tags intersect the given tags */
export function rumorsMatching(tags){
  if(!tags || !tags.length) return [];
  return G.rumors.filter(r=>{
    const def = rumorById(r.id);
    return def && def.relatedJobTags && def.relatedJobTags.some(t=>tags.includes(t));
  }).map(r=>rumorById(r.id));
}
/* Buying a round at the Slag Bar: unheard structured rumors surface first
   (with the NPC's worth-remembering signal), then atmosphere lines. */
export function buySlagRound(){
  if(!spend(5)) return null;
  const unheard = RUMORS.filter(r=>!learnedRumor(r.id));
  if(unheard.length){
    const def = unheard[Math.floor(rand()*unheard.length)];
    learnRumor(def.id);
    logMsg(`Slag Bar: ${def.sourceDisplayName} — ${def.text}`);
    if(def.signal) logMsg(`Slag Bar: ${def.signal}`);
    save();
    return def.text;
  }
  const line = say("barRumor") || "The bar is loud and nobody's talking.";
  logMsg("Slag Bar: " + line);
  save();
  return line;
}

export function pressRemember(rumorId){
  const rec = G.rumors.find(r=>r.id===rumorId);
  if(!rec) return null;
  rec.recallUsed = true;
  G.history["recallUsed_"+rumorId] = true;
  save();
  return rumorById(rumorId).hintText;
}

/* ---- daily offers ------------------------------------------------------ */
export function offersForToday(){
  if(G.jobs.offersDay !== G.world.day){
    const pool = CONTRACTS.filter(c=>c.family==="decision"
      && meetsRequirements(c) && !onCooldown(c) && !exhausted(c)
      && !(G.jobs.active && G.jobs.active.cid===c.id));
    const offers = [];
    const bag = pool.slice();
    while(offers.length<3 && bag.length){
      const i = Math.floor(rand()*bag.length);
      offers.push(bag.splice(i,1)[0].id);
    }
    G.jobs.offersDay = G.world.day;
    G.jobs.offers = offers;
    save();
  }
  return G.jobs.offers.map(contractById).filter(Boolean);
}
export function offerFamiliar(c){ return rumorsMatching(c.tags).length > 0; }

/* standing (timeCost 0) jobs shown beside the daily offers */
export function standingJobs(){
  return CONTRACTS.filter(c=>(c.family==="knowledge"||c.family==="reflex")
    && meetsRequirements(c) && !onCooldown(c) && !exhausted(c));
}

/* ---- accept / abandon / expiry ---------------------------------------- */
export function acceptContract(cid){
  const c = contractById(cid);
  if(!c || c.family!=="decision" || G.jobs.active) return false;
  if(!G.jobs.offers.includes(cid) || G.jobs.offersDay!==G.world.day) return false;
  G.jobs.active = { cid, dayAccepted:G.world.day };
  save();
  return true;
}
let ridCounter = 0;
function newRid(cid){ return `r.${cid}.${G.world.day}.${(ridCounter++).toString(36)}${Math.floor(rand()*1e6).toString(36)}`; }

/* expiry/abandon: standing damage, NOT the contract's failureEffects */
function resolveWalkaway(kind){          // kind: "expired" | "abandoned"
  const act = G.jobs.active;
  if(!act) return false;
  const c = contractById(act.cid);
  const rid = newRid(c.id+"."+kind);
  const fx = {
    rep:{ respect:-1 },
    factions:{ [c.employerFaction]:-1 },
    npcRelationships:{ [c.employerNpcId]:-1 },
    career:{ contractsExpired:1 },
    historyFlags:{ set:["contractExpired_"+c.id] },
    journal:{ type:"contractExpired", data:{ title:c.title, employer:(DATA.npcs[c.employerNpcId]||{}).name, kind } },
  };
  G.jobs.resolutions[rid] = { rid, cid:c.id, outcome:kind, applied:false, day:G.world.day };
  applyOnce(rid, fx, {npcId:c.employerNpcId, sourceId:rid});
  G.jobs.history.push({ cid:c.id, outcome:kind, day:G.world.day, rid });
  if(c.cooldown) G.jobs.cooldowns[c.id] = G.world.day + c.cooldown;
  G.jobs.active = null;
  logMsg(kind==="abandoned" ? `You walk away from "${c.title}". Kettle Rock notices.` :
    `"${c.title}" expires unfinished. Kettle Rock notices.`);
  save();
  return true;
}
export function abandonContract(){ return resolveWalkaway("abandoned"); }

bus.on("dayAdvanced", ()=>{
  const act = G.jobs.active;
  if(!act) return;
  const c = contractById(act.cid);
  const days = (c && c.expiryDays) || EXPIRY_DAYS_DEFAULT;
  if(G.world.day - act.dayAccepted > days) resolveWalkaway("expired");
});

/* ---- decision resolution ---------------------------------------------- */
const RISK_BASE = { low:80, medium:65, high:50 };
export function approachChance(c, a){
  let p = RISK_BASE[c.risk] + (a.mod||0);
  if(a.skill) p += (G.player.skills[a.skill]||0)*7;
  if(a.repStat) p += Math.min(20, (G.rep[a.repStat]||0)*3);
  return Math.max(5, Math.min(95, p));
}
export function riskWord(p){ return p>=75?"Favorable" : p>=55?"Even" : p>=35?"Risky" : "Desperate"; }
export function approachAvailable(c, a){
  if(a.requiredRep) for(const k of Object.keys(a.requiredRep))
    if((G.rep[k]||0) < a.requiredRep[k]) return {ok:false, why:`needs ${k} ${a.requiredRep[k]}`};
  if(a.requiredFactionRep) for(const k of Object.keys(a.requiredFactionRep))
    if((G.rep.factions[k]||0) < a.requiredFactionRep[k]) return {ok:false, why:`needs ${k} standing`};
  if(a.vehicleRequirement && a.vehicleRequirement.roadworthy)
    if(!vehicle() || !roadworthy(vehicle())) return {ok:false, why:"needs a road-worthy rig"};
  if(a.resourceCost && a.resourceCost.scrap && G.scrap < a.resourceCost.scrap)
    return {ok:false, why:`costs ${a.resourceCost.scrap} scrap`};
  return {ok:true};
}

export function resolveApproach(approachId){
  const act = G.jobs.active;
  if(!act) return null;
  const c = contractById(act.cid);
  const a = (c.approaches||[]).find(x=>x.id===approachId);
  if(!a || !approachAvailable(c,a).ok) return null;

  const rid = newRid(c.id);
  // commit: costs first, then a single stored roll decides everything
  if(a.resourceCost && a.resourceCost.scrap)
    applyEffects({scrap:-a.resourceCost.scrap}, {sourceId:rid+".cost"});
  let outcome, roll = null, payment = 0;
  if(a.noCheck){
    outcome = a.noCheck;                     // e.g. "betray": no payment, no check
  } else {
    const p = approachChance(c,a);
    roll = ri(1,100);
    outcome = roll<=p ? "success" : (roll<=p+15 ? "partial" : "failure");
    if(outcome==="success") payment = ri(c.paymentRange[0], c.paymentRange[1]);
    if(outcome==="partial") payment = Math.ceil(ri(c.paymentRange[0], c.paymentRange[1])/2);
  }
  // dispute may intercept a successful payment
  let disputeId = null;
  if(outcome==="success" && c.paymentDispute){
    disputeId = maybeCreateDispute(c, payment, rid);
    if(disputeId) payment = 0;               // withheld pending the dispute
  }
  // persist the committed result BEFORE applying
  G.jobs.resolutions[rid] = { rid, cid:c.id, aid:a.id, roll, outcome, payment,
    disputeId, applied:false, day:G.world.day };
  // assemble declared effects: family-level + approach-level + payment + journal
  const tierFx = outcome==="betray" ? null
    : outcome==="success" ? c.successEffects
    : outcome==="partial" ? (c.partialEffects||null)
    : c.failureEffects;
  const aFx = outcome==="betray" ? a.successEffects
    : outcome==="success" ? a.successEffects
    : outcome==="partial" ? a.partialEffects
    : a.failureEffects;
  const merged = mergeFx([
    { scrap: payment, career:{ [outcome==="failure"?"contractsFailed":"contractsDone"]:1 } },
    tierFx, aFx,
    { journal:{ type: outcome==="failure"?"contractFailed":"contractDone",
      data:{ title:c.title, employer:(DATA.npcs[c.employerNpcId]||{}).name,
             outcome, payment, disputed:!!disputeId } } },
  ]);
  applyOnce(rid, merged, {npcId:c.employerNpcId, sourceId:rid});
  G.jobs.resolutions[rid].summary = fxSummary(merged);
  finishContract(c, rid, outcome, payment, disputeId);
  return G.jobs.resolutions[rid];
}
/* human-readable consequence lines for the outcome panel */
function fxSummary(fx){
  const out = [];
  if(fx.rep) for(const k of Object.keys(fx.rep)) if(fx.rep[k])
    out.push(`${k} ${fx.rep[k]>0?"+":""}${fx.rep[k]}`);
  if(fx.factions) for(const k of Object.keys(fx.factions)) if(fx.factions[k])
    out.push(`${k} standing ${fx.factions[k]>0?"+":""}${fx.factions[k]}`);
  if(fx.npcRelationships) for(const k of Object.keys(fx.npcRelationships)) if(fx.npcRelationships[k])
    out.push(`${(DATA.npcs[k]||{name:k}).name} ${fx.npcRelationships[k]>0?"warms to you":"cools toward you"}`);
  if(fx.historyFlags && fx.historyFlags.set && fx.historyFlags.set.length)
    out.push("this will matter later");
  return out;
}
/* merge effect chunks so a committed resolution applies exactly once */
function mergeFx(list){
  const out = {};
  for(const f of list){
    if(!f) continue;
    for(const k of Object.keys(f)){
      if(k==="scrap") out.scrap = (out.scrap||0)+f[k];
      else if(k==="journal") out.journal = f[k];
      else if(Array.isArray(f[k])) out[k] = [...(out[k]||[]), ...f[k]];
      else if(typeof f[k]==="object"){
        out[k] = out[k]||{};
        for(const kk of Object.keys(f[k])){
          if(Array.isArray(f[k][kk])) out[k][kk] = [...(out[k][kk]||[]), ...f[k][kk]];
          else if(typeof f[k][kk]==="object") out[k][kk] = {...(out[k][kk]||{}), ...f[k][kk]};
          else out[k][kk] = (out[k][kk]||0)+f[k][kk];
        }
      } else out[k] = f[k];
    }
  }
  return out;
}
function finishContract(c, rid, outcome, payment, disputeId){
  G.jobs.history.push({ cid:c.id, outcome, day:G.world.day, rid, payment, disputeId });
  if(c.cooldown) G.jobs.cooldowns[c.id] = G.world.day + c.cooldown;
  G.jobs.active = null;
  if(c.timeCost>0) advanceDay();
  logMsg(outcome==="failure" ? `Contract failed: ${c.title}.` :
    disputeId ? `Contract done: ${c.title} — but the pay isn't in your hand yet.` :
    `Contract ${outcome}: ${c.title}${payment?` — ${payment} scrap`:""}.`);
  save();
}

/* ---- knowledge quizzes ------------------------------------------------- */
export function quizState(cid){ return G.jobs.knowledge[cid] || null; }
export function quizAvailable(c){
  const st = G.jobs.knowledge[c.id];
  if(st && !st.done) return true;            // resume in-progress
  return !onCooldown(c);
}
export function startQuiz(cid){
  const c = contractById(cid);
  if(!c || c.family!=="knowledge" || !quizAvailable(c)) return null;
  if(!G.jobs.knowledge[cid] || G.jobs.knowledge[cid].done)
    G.jobs.knowledge[cid] = { qi:0, correct:0, answers:[], done:false, day:G.world.day };
  save();
  return G.jobs.knowledge[cid];
}
export function answerQuiz(cid, optIdx){
  const c = contractById(cid);
  const st = G.jobs.knowledge[cid];
  if(!c || !st || st.done) return null;
  const q = c.questions[st.qi];
  const right = optIdx === q.correct;
  st.answers.push({ q:q.id, picked:optIdx, right });
  if(right) st.correct++;
  st.qi++;
  if(st.qi >= c.questions.length){
    st.done = true;
    const payout = st.correct*10 + (st.correct===c.questions.length ? 10 : 0);
    const rid = newRid(c.id);
    G.jobs.resolutions[rid] = { rid, cid:c.id, outcome:"quiz", payment:payout, applied:false, day:G.world.day };
    applyOnce(rid, mergeFx([
      { scrap:payout, career:{contractsDone:1} },
      st.correct===c.questions.length ? c.successEffects : null,
      { journal:{ type:"knowledge", data:{ title:c.title, correct:st.correct,
        total:c.questions.length, payout } } },
    ]), {npcId:c.employerNpcId, sourceId:rid});
    G.jobs.history.push({ cid:c.id, outcome:"quiz", day:G.world.day, rid, payment:payout });
    G.jobs.cooldowns[c.id] = G.world.day + (c.cooldown||1);
    logMsg(`${c.title}: ${st.correct}/${c.questions.length} right — ${payout} scrap.`);
  }
  save();
  return st;
}

/* ---- reflex tasks ------------------------------------------------------ */
export function reflexAvailable(c){
  if(G.jobs.reflex.run && !G.jobs.reflex.run.done && G.jobs.reflex.run.cid===c.id) return true;
  return !onCooldown(c);
}
export function startReflex(cid){
  const c = contractById(cid);
  if(!c || c.family!=="reflex" || !reflexAvailable(c)) return null;
  const run = G.jobs.reflex.run;
  if(run && run.cid===cid && !run.done) return run;   // resume
  G.jobs.reflex.run = { cid, shown:0, hits:0, zone:null, done:false, day:G.world.day };
  save();
  return G.jobs.reflex.run;
}
export function reflexSpawn(){
  const run = G.jobs.reflex.run;
  if(!run || run.done) return null;
  const c = contractById(run.cid);
  if(run.shown >= c.reflex.targets){ reflexFinish(); return null; }
  run.zone = pick(c.reflex.zones);
  run.shown++;
  save();
  return run.zone;
}
export function reflexTap(zone){
  const run = G.jobs.reflex.run;
  if(!run || run.done || !run.zone) return false;
  const hit = zone === run.zone;
  if(hit) run.hits++;
  run.zone = null;
  save();
  return hit;
}
export function reflexTimeout(){
  const run = G.jobs.reflex.run;
  if(!run || run.done) return;
  run.zone = null;
  save();
}
export function reflexFinish(){
  const run = G.jobs.reflex.run;
  if(!run || run.done) return null;
  const c = contractById(run.cid);
  run.done = true;
  const payout = Math.min(run.hits * c.reflex.payPerHit, c.paymentRange[1]);
  const rid = newRid(c.id);
  G.jobs.resolutions[rid] = { rid, cid:c.id, outcome:"reflex", payment:payout, applied:false, day:G.world.day };
  applyOnce(rid, mergeFx([
    { scrap:payout, career:{contractsDone:1} },
    run.hits>=c.reflex.targets ? c.successEffects : null,
    { journal:{ type:"reflex", data:{ title:c.title, hits:run.hits,
      targets:c.reflex.targets, payout } } },
  ]), {npcId:c.employerNpcId, sourceId:rid});
  G.jobs.history.push({ cid:c.id, outcome:"reflex", day:G.world.day, rid, payment:payout });
  G.jobs.cooldowns[c.id] = G.world.day + (c.cooldown||1);
  G.jobs.reflex.dayDone = G.world.day;
  logMsg(`${c.title}: ${run.hits}/${c.reflex.targets} — ${payout} scrap.`);
  save();
  return payout;
}
