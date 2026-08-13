/* disputes.js — post-contract payment disputes. The employer's truth state
   and assets are generated ONCE at trigger time, persisted, and hidden.
   Reloading rerolls nothing. Nobody can be frightened into producing money
   that does not exist. */

import { G, save, logMsg, rand, ri, bus } from "./core.js";
import { DATA } from "./data.js";
import { DISPUTE_TRUTHS, DISPUTE_WITNESS } from "./data-jobs.js";
import { applyEffects } from "./effects.js";

const span = ([lo,hi]) => lo + rand()*(hi-lo);

/* Trigger roll. High Fear/Respect deter cheating; a rep for tolerating
   non-payment (NPC memory) invites it. Returns disputeId or null. */
export function maybeCreateDispute(contract, promised, rid){
  let chance = contract.paymentDispute.chance;
  chance *= Math.max(0.4, 1 - (G.rep.fear||0)*0.04);
  chance *= Math.max(0.5, 1 - (G.rep.respect||0)*0.03);
  const mem = G.npcs[contract.employerNpcId];
  if(mem && mem.memoryFlags.exploitable) chance *= 2;
  if((G.history["tolerated_"+contract.employerFaction]||0) >= 2) chance *= 1.5;
  if(rand() >= Math.min(0.9, chance)) return null;

  // generate + persist the hidden truth
  const total = DISPUTE_TRUTHS.reduce((a,t)=>a+t.weight,0);
  let roll = rand()*total, truth = DISPUTE_TRUTHS[0];
  for(const t of DISPUTE_TRUTHS){ roll -= t.weight; if(roll<=0){ truth = t; break; } }
  const id = "d."+rid;
  G.disputes[id] = {
    id, contractId:contract.id, employerNpcId:contract.employerNpcId,
    employerFaction:contract.employerFaction,
    promisedPayment:promised,
    truthState:truth.id,
    cashOnHand:Math.round(promised*span(truth.cash)),
    hiddenAssets:Math.round(promised*span(truth.hidden)),
    futurePaymentCapacity:Math.round(promised*span(truth.future)),
    witnessRisk:DISPUTE_WITNESS[contract.employerFaction]||"medium",
    resolved:false, resolution:null, recovered:0, day:G.world.day,
  };
  save();
  return id;
}
export function openDispute(){
  return Object.values(G.disputes).find(d=>!d.resolved) || null;
}
/* Lethal gating (§30): only witness-free contexts, and never while the game
   cannot honestly deliver the consequences. No current employer qualifies. */
export function canKill(d){
  return (d.witnessRisk==="none") && !!G.history.unlock_lethalDisputes;
}

export function resolveDispute(id, choice){
  const d = G.disputes[id];
  if(!d || d.resolved) return null;
  const npc = DATA.npcs[d.employerNpcId] || {name:d.employerNpcId};
  const mem = G.npcs[d.employerNpcId];
  let recovered = 0, fx = {}, text = "";

  if(choice==="lenient"){
    recovered = Math.min(d.cashOnHand, Math.round(d.promisedPayment*span([0.4,0.6])));
    const owed = d.promisedPayment - recovered;
    if(owed>0) G.debts.push({ id:"debt."+id, npcId:d.employerNpcId, amount:owed,
      capacity:d.futurePaymentCapacity, dayCreated:G.world.day, open:true });
    fx = { scrap:recovered, rep:{ popularity:1 },
      npcRelationships:{ [d.employerNpcId]: 2 },
      historyFlags:{ increment:{ ["tolerated_"+d.employerFaction]:1 } },
      journal:{ type:"dispute", data:{ employer:npc.name, choice:"worked with them",
        recovered, promised:d.promisedPayment, owed } } };
    if(mem) mem.memoryFlags.exploitable = true;
    text = `${npc.name} pays what's actually in the till — ${recovered} scrap — and owes the rest.`;
  }
  else if(choice==="threaten"){
    const reveal = Math.min(1, 0.6 + (G.rep.fear||0)*0.05);
    const pool = d.cashOnHand + Math.round(d.hiddenAssets*reveal);
    recovered = Math.min(pool, Math.round(d.promisedPayment*span([0.6,1.0])));
    fx = { scrap:recovered, rep:{ fear:1, popularity:-1 },
      npcRelationships:{ [d.employerNpcId]: -2 },
      historyFlags: d.witnessRisk==="high" ? { set:["witnessed_"+id] } : undefined,
      journal:{ type:"dispute", data:{ employer:npc.name, choice:"threatened",
        recovered, promised:d.promisedPayment } } };
    text = recovered < d.promisedPayment*0.4
      ? `You put ${npc.name} against a wall and shake loose ${recovered} scrap. There genuinely isn't more.`
      : `${npc.name} suddenly remembers where the money is. ${recovered} scrap.`;
  }
  else if(choice==="kill"){
    if(!canKill(d)) return null;
    recovered = d.cashOnHand + d.hiddenAssets;    // only what physically exists
    if(mem) mem.alive = false;
    G.debts.filter(x=>x.npcId===d.employerNpcId).forEach(x=>{ x.open=false; x.destroyed=true; });
    fx = { scrap:recovered, rep:{ fear:2, popularity:-2 },
      factions:{ [d.employerFaction]:-3 },
      career:{ killed:1 },
      historyFlags:{ set:["killed_"+d.employerNpcId, "retaliation_"+d.employerFaction,
                          "forcedDepartureFromSettlement"] },
      journal:{ type:"dispute", data:{ employer:npc.name, choice:"killed",
        recovered, promised:d.promisedPayment } } };
    text = `${npc.name} dies over ${recovered} scrap. The debt dies too — along with every scrap they might ever have paid.`;
  }
  else { // "defer" — walk away, collect later
    const owed = d.promisedPayment;
    G.debts.push({ id:"debt."+id, npcId:d.employerNpcId, amount:owed,
      capacity:d.futurePaymentCapacity, dayCreated:G.world.day, open:true });
    fx = { rep:{ respect: (G.rep.fear>=5 ? 0 : -1) },
      historyFlags:{ increment:{ ["tolerated_"+d.employerFaction]:1 } },
      journal:{ type:"dispute", data:{ employer:npc.name, choice:"deferred",
        recovered:0, promised:d.promisedPayment, owed } } };
    if(mem && rand()<0.5) mem.memoryFlags.exploitable = true;
    text = `You walk. ${npc.name} owes you ${owed} scrap, and everyone standing nearby knows it.`;
  }

  d.resolved = true; d.resolution = choice; d.recovered = recovered;
  applyEffects(fx, { npcId:d.employerNpcId, sourceId:id });
  logMsg(text);
  save();
  return { recovered, text };
}

/* ---- deferred debts: one small follow-up roll per open debt per day ---- */
bus.on("dayAdvanced", ()=>{
  for(const debt of G.debts){
    if(!debt.open || debt.lastRollDay===G.world.day) continue;
    debt.lastRollDay = G.world.day;
    const mem = G.npcs[debt.npcId];
    if(mem && mem.alive===false){ debt.open=false; debt.destroyed=true; continue; }
    const r = rand();
    const npcName = (DATA.npcs[debt.npcId]||{}).name || "The debtor";
    if(r < 0.10 && debt.capacity>0){
      const n = Math.min(debt.amount, debt.capacity);
      debt.amount -= n; if(debt.amount<=0) debt.open=false;
      applyEffects({ scrap:n, npcRelationships:{ [debt.npcId]:1 },
        journal:{ type:"debt", data:{ npc:npcName, event:"repaid", amount:n } } },
        { npcId:debt.npcId, sourceId:debt.id });
      logMsg(`${npcName} settles up: ${n} scrap against the old debt.`);
    } else if(r < 0.30 && debt.capacity>0){
      const n = Math.min(debt.amount, Math.max(1, Math.round(debt.capacity*0.3)));
      debt.amount -= n; if(debt.amount<=0) debt.open=false;
      applyEffects({ scrap:n,
        journal:{ type:"debt", data:{ npc:npcName, event:"partial", amount:n } } },
        { npcId:debt.npcId, sourceId:debt.id });
      logMsg(`${npcName} scrapes together ${n} scrap toward the debt.`);
    } else if(r < 0.38){
      debt.open = false; debt.vanished = true;
      applyEffects({ journal:{ type:"debt", data:{ npc:npcName, event:"vanished", amount:debt.amount } } },
        { npcId:debt.npcId, sourceId:debt.id });
      logMsg(`${npcName} hasn't been seen in days. Neither has your ${debt.amount} scrap.`);
    }
  }
  save();
});

/* ---- Bubba BigRig future-encounter resolver (fixture; tests only) ------ */
export function resolveFutureEncounter(enc, optionId, {learnedRumorIds=[], recallUsed=false}={}){
  const sp = enc.special;
  if(optionId===sp.id){
    if(!learnedRumorIds.includes(sp.requiresRumor)) return { valid:false };
    const bonus = recallUsed ? sp.recallBonus : 0;
    const rid = "enc."+enc.id;
    if(G.history["encResolved_"+enc.id]) return { valid:true, alreadyResolved:true };
    G.history["encResolved_"+enc.id] = true;
    applyEffects({ scrap:bonus,
      historyFlags:{ set:["combatAvoided_"+enc.id] },
      journal:{ type:"contractNote", data:{ text:"Talked flamingos with Bubba BigRig instead of trading fire. Cheapest toll ever paid." } } },
      { sourceId:rid });
    return { valid:true, combatAvoided:true, bonus, narrative:sp.narrative,
      recallLine: recallUsed ? sp.recallLine : null };
  }
  return { valid:true, combatAvoided:false };
}
