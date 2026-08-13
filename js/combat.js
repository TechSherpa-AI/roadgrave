/* combat.js — the Crucible engine. DOM-free: screen changes go through the
   event bus; UI renders from G.combat. Results report to world.js hooks. */

import { G, save, logMsg, rand, ri, pick, bus } from "./core.js";
import { DATA, byId } from "./data.js";
import { vehicle, vStats, roadworthy } from "./vehicles.js";
import { earn, forfeit, addJournal, bumpRep, bumpFaction, npcMem, npcDef, incFlag, setFlag, fameTier } from "./world.js";
import { say } from "./dialogue.js";

export const TRACK = 12, LANES = 3;
const d6 = ()=>ri(1,6);
function rollDmg(spec){
  const m = spec.match(/(\d+)d6(?:\+(\d+))?/);
  let n = 0; for(let i=0;i<+m[1];i++) n += d6();
  return n + (+(m[2]||0));
}
export function bearing(a,b){
  const fwd = (b.pos - a.pos + TRACK) % TRACK;
  if(fwd===0 && a.lane!==b.lane)
    return { dist:Math.abs(a.lane-b.lane), arc:b.lane<a.lane?"L":"R", hitFacing:b.lane<a.lane?"R":"L" };
  if(fwd>=1 && fwd<=6) return { dist:fwd, arc:"F", hitFacing:"B" };
  if(fwd===0) return { dist:0, arc:"F", hitFacing:"B" };
  return { dist:TRACK-fwd, arc:"B", hitFacing:"F" };
}
export function cLog(t){ if(!t) return; const c=G.combat; c.log.push(t); if(c.log.length>40) c.log.shift(); }

function fighterFor(side){
  const c = G.combat;
  return side==="p"
    ? { st:c.p, v:vehicle(), skills:G.player.skills, label:vehicle().name }
    : { st:c.e, v:c.foeV, skills:c.foe.skills, label:c.foe.name };
}
function skillOf(f, which){ return Math.max(0,(f.skills[which]||0) - f.st.drvPen); }

export function canFire(f, w, brg){
  const d = byId(DATA.weapons, w.id);
  if(w.dmgd || w.ammo<=0) return {ok:false, why:w.dmgd?"damaged":"no ammo"};
  const arcOk = w.facing==="T" || w.facing===brg.arc;
  if(!arcOk) return {ok:false, why:"out of arc"};
  if(brg.dist > DATA.rngMax[d.rng]) return {ok:false, why:"out of range"};
  if(f.st.heat < d.heat) return {ok:false, why:"no heat"};
  return {ok:true};
}
export function toHit(f, w, brg, targetSt, called){
  let n = 55 + skillOf(f,"gunnery")*7
        + (brg.dist<=1?15 : brg.dist<=2?5 : brg.dist<=4?0 : -15)
        - targetSt.speed*5 - (called?25:0);
  return Math.max(5, Math.min(95, n));
}
export function applyDamage(tv, facing, raw, called){
  const a = tv.armor[facing]||0;
  const pen = raw - a;
  if(a>0) tv.armor[facing] = a-1;
  if(pen<=0) return {msg:`${facing} armor shrugs it off (${raw} dmg vs ${a} armor, plate chipped)`, pen:false};
  let comp = called;
  if(!comp){ const r=d6(); comp = r<=2?"hull" : r===3?"tires" : r===4?"weapon" : r===5?"plant" : "driver"; }
  if(comp==="weapon"){
    const live = tv.weapons.filter(w=>!w.dmgd);
    if(!live.length) comp = "hull"; else { pick(live).dmgd = true; return {msg:`${pen} through the ${facing} — a weapon is smashed!`, pen:true}; }
  }
  if(comp==="hull"){ tv.dmg.hull += pen; return {msg:`${pen} through the ${facing} into the hull!`, pen:true}; }
  if(comp==="tires"){ tv.dmg.tires += 1; return {msg:`${pen} through the ${facing} — a tire is shredded!`, pen:true}; }
  if(comp==="plant"){ tv.dmg.plant += 1; return {msg:`${pen} through the ${facing} into the power plant!`, pen:true}; }
  return {msg:`${pen} through the ${facing} — the driver is hit!`, pen:true, driver:true};
}
export function isOut(v){
  const s = vStats(v);
  return s.hull<=0 || v.dmg.plant>=2 || v.dmg.tires>=4;
}

/* ---- bout lifecycle --------------------------------------------------- */
export function startBout(tierId){
  const v = vehicle();
  if(!v || !roadworthy(v)) return false;
  const tier = byId(DATA.arena, tierId);
  if(!tier) return false;
  if(tier.req && !((G.history["defeated"+cap(byId(DATA.arena,tier.req).npc)]||0))) return false;
  const foeV = JSON.parse(JSON.stringify(tier.foe.v));
  const ps = vStats(v), es = vStats(foeV);
  const mem = npcMem(tier.npc);
  mem.encounterCount++;
  G.combat = {
    tier:tierId, npc:tier.npc, round:1, phase:"move", done:false, result:null, applied:false,
    called:null, enemyFirst:false, rams:0,
    p:{ pos:0, lane:1, speed:1, heat:ps.heatCap, drvPen:0 },
    e:{ pos:5, lane:1, speed:1, heat:es.heatCap, drvPen:0 },
    foe:{ id:tier.npc, name:npcDef(tier.npc).name, skills:tier.foe.skills },
    foeV, log:[],
  };
  (tier.intro||[]).forEach(cLog);
  cLog(say("crowdEntrance") || "");
  startRound(true);
  bus.emit("screen","fight");
  save();
  return true;
}
const cap = s => s ? s.charAt(0).toUpperCase()+s.slice(1) : s;

export function startRound(first){
  const c = G.combat;
  if(!first) c.round++;
  const ps = vStats(vehicle()), es = vStats(c.foeV);
  c.p.heat = ps.heatCap; c.e.heat = es.heatCap;
  c.phase = "move"; c.called = null;
  if(c.round>1 && c.round%3===0 && !c.done) cLog(say("crowdAmbient"));
  const pInit = skillOf(fighterFor("p"),"driving") + ps.handling + d6();
  const eInit = skillOf(fighterFor("e"),"driving") + es.handling + d6();
  c.enemyFirst = eInit > pInit;
  if(c.enemyFirst && !c.done){ cLog(`Round ${c.round}: ${c.foe.name} has the jump.`); enemyTurn(); }
  else if(!c.done) cLog(`Round ${c.round}: you have the initiative.`);
}
function moveFighter(f, spd){
  f.st.speed = spd;
  f.st.pos = (f.st.pos + spd) % TRACK;
  if(f.v.history) f.v.history.mileage += spd;
}
function resolveRam(attSide){
  const att = fighterFor(attSide), def = fighterFor(attSide==="p"?"e":"p");
  const attPlate = att.v.gear.some(g=>g.id==="ram");
  const defPlate = def.v.gear.some(g=>g.id==="ram");
  let dealt = rollDmg("2d6") + att.st.speed;
  if(attPlate) dealt *= 2;
  if(defPlate) dealt = Math.ceil(dealt/2);
  let taken = d6();
  if(attPlate) taken = Math.ceil(taken/2);
  const brg = bearing(att.st, def.st);
  const r1 = applyDamage(def.v, brg.hitFacing, dealt, null);
  const r2 = applyDamage(att.v, "F", taken, null);
  if(r1.driver) def.st.drvPen++;
  if(r2.driver) att.st.drvPen++;
  cLog(`${att.label} RAMS ${def.label}: ${r1.msg}`);
  cLog(`Recoil: ${r2.msg}`);
  if(attSide==="p") G.combat.rams++;
  if(rand()<0.5) cLog("The crowd comes UP off the bleachers — nothing sells tickets like steel on steel.");
  att.st.speed = Math.max(0, att.st.speed-1);
  def.st.speed = Math.max(0, def.st.speed-1);
}
export function fireWeapon(attSide, wi, called){
  const c = G.combat;
  const att = fighterFor(attSide), def = fighterFor(attSide==="p"?"e":"p");
  const w = att.v.weapons[wi];
  if(!w) return;
  const d = byId(DATA.weapons, w.id);
  const brg = bearing(att.st, def.st);
  const chk = canFire(att, w, brg);
  if(!chk.ok) return;
  w.ammo--; att.st.heat -= d.heat;
  const need = toHit(att, w, brg, def.st, called);
  const roll = ri(1,100);
  if(roll <= need){
    const res = applyDamage(def.v, brg.hitFacing, rollDmg(d.dmg), called);
    if(res.driver) def.st.drvPen++;
    cLog(`${att.label}'s ${d.name}${called?" (called: "+called+")":""} hits — ${res.msg}`);
    if(attSide==="e" && rand()<0.35) cLog(say("crucibleTaunt", {speaker:c.npc}));
    if(attSide==="p" && res.pen && rand()<0.4) cLog(say("cruciblePain", {speaker:c.npc}));
  } else {
    cLog(`${att.label}'s ${d.name} misses (${roll} vs ${need}%).`);
  }
  checkEnd();
}
export function checkEnd(){
  const c = G.combat;
  if(c.done) return;
  const pOut = isOut(vehicle()), eOut = isOut(c.foeV);
  if(!pOut && !eOut) return;
  c.done = true;
  c.result = pOut ? "lose" : "win";
  finishBout();
}

/* ---- result: ALL world consequences flow through here ----------------- */
export function finishBout(){
  const c = G.combat;
  if(c.applied) return;
  c.applied = true;
  const tier = byId(DATA.arena, c.tier);
  const mem = npcMem(c.npc);
  const v = vehicle();
  if(c.result==="win"){
    const firstWin = mem.lossesToPlayer===0;
    const purse = firstWin ? tier.purse : tier.repeat;
    const salvage = ri(5, 10 + G.player.skills.scrounge*10);
    // npc memory + history flags
    mem.lossesToPlayer++;
    incFlag("defeated"+cap(c.npc));
    mem.disposition = mem.lossesToPlayer>=3 ? (npcDef(c.npc).personalityTags.includes("honorable")?"respect":"grudge")
                    : mem.lossesToPlayer>=2 ? "personal" : "irritated";
    // career + reputation
    G.career.wins++; G.career.crucibleWins++;
    G.career.streak++; G.career.bestStreak = Math.max(G.career.bestStreak, G.career.streak);
    G.career.salvageRecovered += salvage;
    bumpRep("fame", tier.id==="t"?2:1);
    bumpRep("respect", 1);
    bumpRep("popularity", fameTier()>=1 ? 1 : 0);
    if(c.rams>=2 || c.e.drvPen>0) bumpRep("fear", 1);
    bumpFaction("militia", 1); bumpFaction("crucible", 1);
    earn(purse, "purse"); earn(salvage, "salvage");
    G.player.xp += tier.xp;
    // vehicle history
    v.history.wins++; v.history.kills++;
    if(tier.id==="t" && (G.history.defeatedBruna||0)===1){
      G.career.championships++; v.history.championships++;
      addJournal("championship", { foe:c.foe.name });
    } else {
      addJournal("boutWin", { foe:c.foe.name, tierName:tier.name, purse, streak:G.career.streak });
    }
    c.summary = { purse, salvage, text: firstWin ? tier.winText : DATA.repeatWinText,
      crowd: say("crowdWin") };
    cLog(say("crucibleBeaten", {speaker:c.npc}));
    logMsg(`Crucible: beat ${c.foe.name}. Purse ${purse} + ${salvage} salvage scrap.`);
  } else {
    mem.winsVsPlayer++;
    G.career.losses++; G.career.crucibleLosses++; G.career.streak = 0;
    setFlag("lostAnyBout");
    v.history.losses++;
    bumpFaction("crucible", 1);           // the house always wins
    if(G.meta.ironman){
      c.summary = { ironman:true, text: tier.loseText, crowd: say("crowdLoss") };
      addJournal("died", { foe:c.foe.name });
      cLog("Your rig dies around you. Ironman: this is where the story ends.");
    } else {
      const lost = forfeit(Math.max(10, Math.floor(G.scrap*0.2)));
      c.summary = { lost, text: tier.loseText, crowd: say("crowdLoss") };
      addJournal("boutLoss", { foe:c.foe.name, tierName:tier.name, lost });
      cLog(say("crucibleVictor", {speaker:c.npc}));
      logMsg(`Crucible: lost to ${c.foe.name}. Towed out ${lost} scrap lighter.`);
    }
  }
  save();
}

function enemyTurn(){
  const c = G.combat;
  if(c.done) return;
  const e = fighterFor("e"), p = fighterFor("p");
  const es = vStats(c.foeV);
  const brg = bearing(e.st, p.st);
  const live = c.foeV.weapons.filter(w=>!w.dmgd && w.ammo>0);
  if(!live.length && !c.foeV.gear.some(g=>g.id==="ram")){
    cLog(`${c.foe.name} throws up a hand — nothing left to fight with. The pit master calls it.`);
    c.done = true; c.result = "win"; finishBout(); return;
  }
  const want = live.length ? Math.max(...live.map(w=>DATA.rngMax[byId(DATA.weapons,w.id).rng]))-1 : 1;
  let spd = e.st.speed;
  if(brg.dist > want) spd = Math.min(es.maxSpeed, spd+1);
  else if(brg.dist < Math.max(1,want-1)) spd = Math.max(0, spd-1);
  if(e.st.lane !== p.st.lane && live.length && !live.some(w=>canFire(e,w,brg).ok))
    e.st.lane += (p.st.lane > e.st.lane ? 1 : -1);
  moveFighter(e, spd);
  const brg2 = bearing(e.st, p.st);
  live.forEach(w=>{
    const wi = c.foeV.weapons.indexOf(w);
    if(c.done) return;
    if(canFire(e, w, brg2).ok){
      const called = (vehicle().armor[brg2.hitFacing]===0 && rand()<0.35) ? "plant" : null;
      fireWeapon("e", wi, called);
    }
  });
}

/* ---- player-facing commands (UI wraps; tests call directly) ----------- */
export function playerManeuver(m){
  const c = G.combat;
  if(!c || c.done || c.phase!=="move") return false;
  const p = fighterFor("p");
  const ps = vStats(p.v);
  let spd = p.st.speed;
  if(m==="accel") spd = Math.min(ps.maxSpeed, spd+1);
  if(m==="brake") spd = Math.max(0, spd-2);
  if(m==="boost"){ if(p.st.heat<2) return false; p.st.heat-=2; spd = Math.min(ps.maxSpeed+1, spd+2); }
  if(m==="swerveL"||m==="swerveR"){
    const nl = p.st.lane + (m==="swerveL"?-1:1);
    if(nl<0||nl>=LANES) return false;
    p.st.lane = nl;
    if(ps.handling<0) spd = Math.max(0, spd-1);
  }
  if(m==="ram"){
    const brg = bearing(p.st, c.e);
    if(!(p.st.lane===c.e.lane && brg.arc==="F" && brg.dist<=Math.max(1,spd))) return false;
    p.st.pos = c.e.pos; p.st.speed = spd;
    resolveRam("p");
    checkEnd();
    c.phase = "fire";
    save();
    return true;
  }
  moveFighter(p, spd);
  c.phase = "fire";
  save();
  return true;
}
export function playerFire(i){
  const c = G.combat;
  if(!c || c.done || c.phase!=="fire") return false;
  fireWeapon("p", i, c.called);
  save();
  return true;
}
export function toggleCalled(){
  const c = G.combat;
  const order = [null,"tires","plant","weapon"];
  c.called = order[(order.indexOf(c.called)+1)%order.length];
}
export function endTurn(){
  const c = G.combat;
  if(!c || c.done) return;
  if(!c.enemyFirst) enemyTurn();
  if(!c.done) startRound(false);
  save();
}
export function concede(){
  const c = G.combat;
  if(!c || c.done) return;
  cLog("You raise a hand. The pit master waves it dead.");
  c.done = true; c.result = "lose"; finishBout();
}
export function fightDone(){
  const c = G.combat;
  if(c.summary && c.summary.ironman){
    // ironman death is a legacy trigger: judge the career, then the save
    // is erased from the legacy screen's "Begin a new legend" button.
    G.campaign.flags.dead = true;
    G.combat = null;
    bus.emit("screen","legacy");
    return;
  }
  G.combat = null;
  bus.emit("screen","arena");
}
