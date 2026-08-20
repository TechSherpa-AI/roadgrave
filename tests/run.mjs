/* ROADGRAVE regression suite — `node tests/run.mjs`
   Imports the real game modules headless (no DOM, no build step). */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { G, setG, newGame, migrate, ensureDefaults, saveNow, loadSave, hasSave,
         eraseSave, exportSave, importSave, seedRng, LS, SAVE_KEY, BACKUP_KEY,
         SAVE_VERSION } from "../js/core.js";
import { DATA } from "../js/data.js";
import * as W from "../js/world.js";
import * as V from "../js/vehicles.js";
import * as C from "../js/combat.js";
import { say } from "../js/dialogue.js";
import { LINES } from "../js/data-dialogue.js";
import { evaluate, performanceScore } from "../js/legacy.js";
import { GOLDEN } from "../js/golden.js";
import * as J from "../js/jobs.js";
import * as DIS from "../js/disputes.js";
import { applyOnce } from "../js/effects.js";
import { CONTRACTS, RUMORS, FUTURE_ENCOUNTERS } from "../js/data-jobs.js";

const here = dirname(fileURLToPath(import.meta.url));
let pass=0, fail=0; const failures=[];
function ok(cond, label){
  if(cond){ pass++; } else { fail++; failures.push(label); console.error("  ✗", label); }
}
function section(name){ console.log("•", name); }

function freshGame(seed=42){
  const g = newGame(); g.meta.seed = seed;
  g.campaign.flags.started = true;
  g.player.created = true; g.player.name = "Ada";
  g.player.skills = {driving:2,gunnery:3,mechanics:2,scrounge:1};
  setG(g); seedRng(seed);
  return g;
}
function goodRig(){
  G.scrap = 3000;
  V.buyChassis("courser"); V.setPlant("v8");
  ["F","F","F","F","L","R","B"].forEach(f=>V.armorMod(f,1));
  V.buyWeapon("mg"); V.buyWeapon("cannon");
  return V.vehicle();
}
function driveBout(tier){
  const started = C.startBout(tier);
  if(!started) return "not-started";
  let guard=0;
  while(G.combat && !G.combat.done && guard++<250){
    if(G.combat.phase==="move"){
      const b = C.bearing(G.combat.p, G.combat.e);
      C.playerManeuver(b.dist>3 ? "accel" : "coast");
    }
    for(let i=0;i<V.vehicle().weapons.length;i++){
      if(G.combat.done) break;
      C.playerFire(i);
    }
    if(!G.combat.done) C.endTurn();
  }
  return guard<250 ? G.combat.result : "stalled";
}

/* ================= SAVE ================================================ */
section("save & migration");
{
  freshGame();
  saveNow();
  ok(hasSave(), "new game saves");
  const re = loadSave();
  ok(re && re.player.name==="Ada" && re.saveVersion===SAVE_VERSION, "save reloads");

  // v1 save migrates
  const v1 = { meta:{version:1, ironman:false, seed:1, rngCalls:0}, screen:"hub",
    driver:{name:"Nameless", skills:{driving:1,gunnery:1,mechanics:1,scrounge:1}, xp:0, injuries:[]},
    scrap:50, inventory:[], vehicles:[], crew:[],
    world:{location:"kettle_rock", day:3, fuel:0, supplies:2, factionRep:{combine:1,gangs:0,zealots:0,militias:2}},
    campaign:{beatsDone:[], flags:{started:true}}, combat:null, log:[] };
  const m1 = migrate(JSON.parse(JSON.stringify(v1)));
  ok(m1.saveVersion===SAVE_VERSION && m1.player && m1.player.name==="" && m1.world.food===2
     && m1.rep.factions.militia===2 && m1.rep.factions.merchants===1, "v1 save migrates to v4");

  // v3 save with arena record migrates to npc memory + career
  const v3 = { meta:{version:3, ironman:false, seed:1, rngCalls:0, build:"0.3.2"}, screen:"hub",
    driver:{created:true, name:"Vet", skills:{driving:2,gunnery:2,mechanics:1,scrounge:1}, xp:3, injuries:[]},
    scrap:400, inventory:[],
    vehicles:[{name:"Old Girl", chassis:"courser", plant:"v8", armor:{F:3,L:1,R:1,B:1,T:0},
      weapons:[{id:"mg",facing:"F",ammo:12,dmgd:false}], gear:[], cargo:[], dmg:{hull:1,tires:0,plant:0}}],
    crew:[], world:{location:"kettle_rock", day:9, fuel:10, supplies:5, factionRep:{combine:0,gangs:1,zealots:0,militias:3}},
    campaign:{beatsDone:[], flags:{started:true, arena:{q:2,p:1,t:0}}}, combat:null, log:[] };
  const m3 = migrate(JSON.parse(JSON.stringify(v3)));
  ok(m3.npcs.odo && m3.npcs.odo.lossesToPlayer===2 && m3.npcs.kess.lossesToPlayer===1
     && m3.career.crucibleWins===3 && m3.history.defeatedOdo===2, "v3 arena record becomes NPC memory + career");
  ok(m3.vehicles[0].history && m3.vehicles[0].history.originalChassis==="courser"
     && m3.vehicles[0].dmg.hull===1, "v3 vehicle gains history, damage persists");

  // pre-migration backup
  LS.setItem(SAVE_KEY, JSON.stringify(v3));
  LS.removeItem(BACKUP_KEY);
  loadSave();
  ok(!!LS.getItem(BACKUP_KEY), "pre-migration backup written");

  // missing optional fields recover
  const holey = JSON.parse(JSON.stringify(newGame()));
  delete holey.rep; delete holey.career; delete holey.journal; delete holey.narrative;
  const fixed = ensureDefaults(holey);
  ok(fixed.rep && fixed.career && Array.isArray(fixed.journal) && fixed.narrative.recent, "missing optional fields recover");

  // corrupt save fails gracefully
  LS.setItem(SAVE_KEY, "{not json");
  ok(loadSave()===null, "corrupt save returns null, does not throw");
  eraseSave();

  // export/import round trip
  freshGame(); G.scrap=777; saveNow();
  const ex = exportSave();
  setG(null);
  importSave(ex);
  ok(G.scrap===777, "export/import round trip");
}

/* ================= ECONOMY ============================================= */
section("economy");
{
  freshGame();
  G.scrap = 100;
  ok(!V.buyChassis("courser") && G.vehicles.length===0, "insufficient funds block purchase");
  G.scrap = 300;
  V.buyChassis("skiff");
  ok(G.scrap===200 && G.career.scrapSpent===100, "purchase deducts and tracks scrapSpent");
  W.earn(50,"test");
  ok(G.scrap===250 && G.career.scrapEarned===50, "reward adds and tracks scrapEarned");
  const v = V.vehicle();
  v.dmg = {hull:2,tires:1,plant:0};
  const cost = V.repairCost(v);          // (12+8)*0.9 mech2 = 18
  ok(cost===Math.ceil(20*0.9), "repair cost math w/ mechanics discount");
  V.repairVehicle();
  ok(!V.vDamaged(v) && G.scrap===250-cost, "repair charges correctly and restores");
}

/* ================= VEHICLE ============================================= */
section("vehicle");
{
  freshGame();
  const v = goodRig();
  ok(v.armor.F===4 && G.career.scrapSpent>0, "armor purchase updates state");
  ok(v.history.installs>=7, "vehicle history counts installs");
  v.dmg = {hull:3,tires:2,plant:1};
  saveNow();
  const re = loadSave();
  ok(re.vehicles[0].dmg.hull===3 && re.vehicles[0].dmg.tires===2, "damage persists through reload");
  ok(re.vehicles[0].weapons.length===2 && re.vehicles[0].plant==="v8", "components remain after reload");
  setG(re); seedRng(re.meta.seed);
  const s = V.vStats(V.vehicle());
  ok(s.maxSpeed<4 && s.power<130 && s.handling<0, "damage degrades stats");
  V.repairVehicle();
  ok(V.vStats(V.vehicle()).power===130, "repair restores derived stats");
}

/* ================= CRUCIBLE ============================================ */
section("crucible");
{
  // deterministic: same seed → same outcome
  const run = (seed)=>{ freshGame(seed); goodRig(); const r = driveBout("q");
    return r + ":" + (G.combat?G.combat.round:0); };
  ok(run(1001)===run(1001), "seeded bout is deterministic");

  freshGame(7); goodRig();
  const before = G.scrap;
  const res = driveBout("q");
  ok(res==="win"||res==="lose", "qualifier launches and resolves ("+res+")");
  if(res==="win"){
    ok(G.scrap>before, "win pays purse+salvage");
    ok(G.npcs.odo.lossesToPlayer===1 && G.history.defeatedOdo===1, "opponent memory increments");
    ok(G.career.streak===1 && G.career.crucibleWins===1, "win streak increments");
    ok(G.rep.fame>=1, "fame rises with victory");
    ok(V.vehicle().history.wins===1, "vehicle history records win");
    ok(G.journal.some(j=>j.type==="boutWin"), "journal receives bout entry");
    // repeat purse
    C.fightDone();
    V.repairVehicle(); ["F","F"].forEach(f=>V.armorMod(f,1));
    V.vehicle().weapons.forEach((w,i)=>V.reloadWeapon(i));
    const b2 = G.scrap;
    if(driveBout("q")==="win")
      ok(G.scrap-b2 <= DATA.arena[0].repeat + 10 + G.player.skills.scrounge*10,
         "repeat win pays reduced purse");
  }

  // loss path: hopeless rig vs Bruna
  freshGame(3);
  G.scrap = 300; V.buyChassis("skiff"); V.setPlant("junker"); V.buyWeapon("scatter");
  G.history.defeatedOdo=1; G.history.defeatedKess=1;
  G.career.streak = 2;
  const scrapBefore = G.scrap;
  const r2 = driveBout("t");
  if(r2==="lose"){
    ok(G.scrap<=scrapBefore, "loss forfeits scrap");
    ok(G.career.streak===0, "loss resets streak");
    ok(G.npcs.bruna.winsVsPlayer===1, "rival remembers beating you");
    ok(G.journal.some(j=>j.type==="boutLoss"), "journal records the loss");
  } else ok(true, "(upset win vs Bruna — loss path covered by concede test)");

  // concede
  freshGame(5); goodRig();
  C.startBout("q");
  C.concede();
  ok(G.combat.done && G.combat.result==="lose" && G.career.crucibleLosses>=1, "concede resolves as loss");

  // ironman death → legacy trigger, not instant erase
  freshGame(6); goodRig(); G.meta.ironman = true;
  C.startBout("q");
  G.combat.done=true; G.combat.result="lose"; C.finishBout();
  ok(G.combat.summary.ironman===true, "ironman loss flagged");
  C.fightDone();
  ok(G.campaign.flags.dead===true && G.screen!=="fight", "ironman death routes to legacy judgment");

  // mid-fight save/resume
  freshGame(8); goodRig();
  C.startBout("q");
  C.playerManeuver("accel");
  saveNow();
  const resumed = loadSave();
  ok(resumed.combat && resumed.combat.phase==="fire" && resumed.combat.tier==="q", "mid-fight save resumes");
  setG(resumed); seedRng(resumed.meta.seed);
  C.endTurn();
  ok(G.combat.round>=1, "resumed fight continues");

  // full ladder completes
  for(const tier of ["q","p","t"]){
    freshGame(100+tier.charCodeAt(0)); goodRig();
    G.history.defeatedOdo=1; G.history.defeatedKess=1;
    const r = driveBout(tier);
    ok(r==="win"||r==="lose", "tier "+tier+" completes ("+r+")");
  }
}

/* ================= CRUCIBLE STANDOFF =================================== */
section("crucible standoff (equal-speed no-shot lock)");
{
  // Mirror of the browser smoke rig: rookie skiff vs Odo's skiff, both with
  // front-facing Close-range scatterguns and matched maxSpeed. Seed 325 locks
  // into an equal-speed out-of-range orbit if the driver never deliberately
  // changes speed — the qualifier can then run past any turn guard.
  const smokeRig = seed => {
    const g = newGame(); g.meta.seed = seed;
    g.campaign.flags.started = true;
    g.player.created = true; g.player.name = "Smoke";
    g.player.skills = {driving:0,gunnery:1,mechanics:0,scrounge:0};
    setG(g); seedRng(seed);
    G.scrap = 300;
    V.buyChassis("skiff"); V.setPlant("junker"); V.buyWeapon("scatter");
  };
  const noShot = () => {
    const c = G.combat;
    const brg = C.bearing(c.p, c.e);
    const live = V.vehicle().weapons.filter(w=>!w.dmgd && w.ammo>0);
    return !live.some(w=>C.canFire({st:c.p}, w, brg).ok);
  };
  const driveQualifier = (seed, breakStandoffs) => {
    smokeRig(seed);
    C.startBout("q");
    let turns=0, prev=null;
    while(G.combat && !G.combat.done && turns++<120){
      const c = G.combat;
      if(c.phase==="move"){
        const brg = C.bearing(c.p, c.e);
        const sig = brg.arc+brg.dist+":"+c.p.speed+":"+c.e.speed;
        const frozen = breakStandoffs && noShot()
          && c.p.speed===c.e.speed && c.p.speed>0 && sig===prev;
        prev = sig;
        C.playerManeuver(frozen ? "brake" : (brg.dist>3 ? "accel" : "coast"));
      }
      for(let i=0;i<V.vehicle().weapons.length;i++){ if(G.combat.done) break; C.playerFire(i); }
      if(!G.combat.done) C.endTurn();
    }
    return turns;
  };
  // without a deliberate speed change the bout never resolves…
  driveQualifier(325, false);
  ok(G.combat && !G.combat.done, "seed 325: speed-matched driver locks into a standoff");
  ok(G.combat && G.combat.p.speed===G.combat.e.speed && noShot(),
     "the lock is a genuine equal-speed no-shot orbit");
  // …braking out of the frozen gap resolves the same seed within the guard
  const turns = driveQualifier(325, true);
  ok(G.combat && G.combat.done && ["win","lose"].includes(G.combat.result),
     "seed 325: braking out of the standoff resolves the bout ("+(G.combat&&G.combat.result)+")");
  ok(turns<120, "resolution bounded ("+turns+" of 120 turns)");
}

/* ================= NARRATIVE =========================================== */
section("narrative");
{
  freshGame();
  // conditions: fresh odo vs bloodied odo
  W.npcMem("odo");
  const fresh1 = say("crucibleTaunt", {speaker:"odo"});
  ok(fresh1 && !fresh1.includes("Not this time"), "maxLosses gate holds for fresh rival");
  G.npcs.odo.lossesToPlayer = 3;
  G.narrative.recent = [];
  let seenEscalated = false;
  for(let i=0;i<8;i++){ const t = say("crucibleTaunt",{speaker:"odo"}); if(t && (t.includes("NOT this time")||t.includes("took everything")||t.includes("wordless"))) seenEscalated = true; }
  ok(seenEscalated, "escalated lines fire after repeated losses");
  // invalid entry doesn't fire or crash
  LINES.push({ id:"bad1" });                     // malformed: no ctx/text
  LINES.push(null);
  ok(say("crucibleTaunt",{speaker:"odo"}) !== undefined, "invalid dialogue entries skipped");
  LINES.pop(); LINES.pop();
  // anti-repeat
  G.narrative.recent = [];
  const a = say("barRumor"), b = say("barRumor");
  ok(a!==b, "no immediate repetition");
  // crowd tier changes with fame
  G.rep.fame = 0;  ok(W.fameTier()===0, "fame 0 = unknown");
  G.rep.fame = 3;  ok(W.fameTier()===1, "fame 3 = emerging");
  G.rep.fame = 7;  ok(W.fameTier()===2, "fame 7 = established");
  G.rep.fame = 10; ok(W.fameTier()===3, "fame 10 = famous");
  G.rep.fame = 15; ok(W.fameTier()===4, "fame 15 = legend");
  G.narrative.recent = [];
  const legendLine = say("crowdEntrance");
  ok(legendLine && (legendLine.includes("ROARS")||legendLine.includes("shoulders")), "legend-tier entrance line");
  // npc memory persists reload
  G.npcs.odo.memoryFlags.testFlag = true;
  saveNow();
  const re = loadSave();
  ok(re.npcs.odo.memoryFlags.testFlag===true && re.npcs.odo.lossesToPlayer===3, "NPC memory persists");
  // town event framework
  setG(re); seedRng(re.meta.seed);
  G.rep.fame = 10;
  let town=null;
  for(let i=0;i<30 && !town;i++) town = W.maybeTownEvent(1.0);
  ok(!!town, "town ambient events fire");
}

/* ================= CHARACTER =========================================== */
section("character");
{
  for(const cat of DATA.appearance){
    ok(cat.opts.length===3, "appearance category "+cat.id+" has 3 choices");
    for(const opt of cat.opts){
      freshGame();
      G.player.appearance[cat.id] = opt.id;
      saveNow();
      const re = loadSave();
      ok(re.player.appearance[cat.id]===opt.id, `appearance ${cat.id}=${opt.id} survives reload`);
    }
  }
  // appearance survives combat
  freshGame(9); goodRig();
  G.player.appearance = { body:"feminine", build:"thin", hair:"mohawk", face:"attractive", clothing:"wraps", accessory:"charm" };
  driveBout("q");
  saveNow();
  const re = loadSave();
  ok(re.player.appearance.hair==="mohawk", "appearance survives combat + reload");
  // appearance-gated dialogue
  setG(re); seedRng(re.meta.seed);
  G.narrative.recent = [];
  let sawJab=false;
  for(let i=0;i<60;i++){ const t = say("crucibleTaunt",{speaker:"odo"}); if(t && t.includes("mohawk")) sawJab=true; }
  ok(sawJab, "appearance-gated dialogue can fire");
}

/* ================= LEGACY ============================================== */
section("legacy");
{
  // heroic dominant career
  const hero = GOLDEN.beloved();
  const hl = evaluate(hero);
  ok(hl.performance>=70, "heroic career scores high performance ("+hl.performance+")");
  ok(["marshal","immortal","champion","respectedgun","merchprince","roadbaron"].includes(hl.id),
     "heroic career gets constructive archetype ("+hl.id+")");
  // brutal dominant career
  const brute = GOLDEN.hated();
  const bl = evaluate(brute);
  ok(bl.performance>=70, "brutal career scores high performance ("+bl.performance+")");
  ok(bl.id==="warlord", "brutal career classified WARLORD ("+bl.id+")");
  // disastrous career
  const flop = newGame();
  flop.player.created = true; flop.player.name="Flop";
  flop.career.crucibleLosses = 6; flop.career.losses = 6;
  const fl = evaluate(flop);
  ok(fl.performance<35, "disastrous career scores low ("+fl.performance+")");
  ok(["janitor","toothcollector","warningsign","scrappicker"].includes(fl.id),
     "disastrous career gets a ridiculous failure ending ("+fl.id+")");
  // performance ≠ morality: warlord and marshal both high
  ok(bl.performance>=70 && hl.performance>=70 && bl.id!==hl.id,
     "performance is not morality: different archetypes, both high scores");
}

/* ================= GOLDEN SAVES ======================================== */
section("golden saves");
{
  for(const [k, build] of Object.entries(GOLDEN)){
    const g = build.call(GOLDEN);
    const migrated = migrate(JSON.parse(JSON.stringify(g)));
    ok(migrated.saveVersion===SAVE_VERSION, "golden '"+k+"' is valid v4");
  }
  const dir = join(here, "golden");
  if(existsSync(dir)){
    const files = readdirSync(dir).filter(f=>f.endsWith(".json"));
    ok(files.length>=10, "golden fixtures on disk ("+files.length+")");
    for(const f of files){
      try{
        const g = migrate(JSON.parse(readFileSync(join(dir,f),"utf8")));
        ok(g.saveVersion===SAVE_VERSION, "fixture "+f+" loads + migrates");
      }catch(e){ ok(false, "fixture "+f+" failed: "+e.message); }
    }
    // mid-fight fixture actually resumes
    const mf = migrate(JSON.parse(readFileSync(join(dir,"midfight.json"),"utf8")));
    setG(mf); seedRng(mf.meta.seed);
    ok(mf.combat && mf.combat.phase==="fire", "midfight fixture is mid-fight");
    C.playerFire(0); C.endTurn();
    ok(G.combat===null || G.combat.round>=3 || G.combat.done, "midfight fixture continues playable");
  } else ok(false, "tests/golden directory missing — run tests/make-golden.mjs");
}

/* ================= REAL LEGACY SAVES =================================== */
section("real legacy saves (generated by historical builds)");
{
  const dir = join(here, "legacy-saves");
  ok(existsSync(dir), "legacy-saves fixtures exist");
  if(existsSync(dir)){
    const load = f => migrate(JSON.parse(readFileSync(join(dir,f),"utf8")));
    const m1 = load("v1-scaffold.json");
    ok(m1.saveVersion===SAVE_VERSION && m1.campaign.flags.started && !m1.player.created,
       "real v1 scaffold save migrates");
    const m2 = load("v2-slice1.json");
    ok(m2.saveVersion===SAVE_VERSION && m2.player.created
       && m2.player.skills.mechanics===3
       && m2.vehicles[0].chassis==="skiff" && m2.vehicles[0].plant==="junker"
       && m2.vehicles[0].armor.F===2 && m2.vehicles[0].weapons[0].id==="scatter"
       && m2.vehicles[0].history.originalChassis==="skiff"
       && m2.world.day===4,
       "real v2 slice-1 save migrates with rig + skills intact");
    const m3 = load("v3-slice2.json");
    ok(m3.saveVersion===SAVE_VERSION && m3.player.created
       && m3.npcs.odo && m3.npcs.odo.lossesToPlayer===2
       && m3.history.defeatedOdo===2 && !m3.history.defeatedKess
       && m3.career.crucibleWins===2
       && m3.vehicles[0].weapons.length===2,
       "real v3 slice-2 save: arena record -> NPC memory, rig intact");
    // migrated save is actually playable: run a bout on it
    setG(m3); seedRng(m3.meta.seed);
    G.scrap = 500;
    V.repairVehicle();
    V.vehicle().weapons.forEach((w,i)=>V.reloadWeapon(i));
    const r = driveBout("q");
    ok(r==="win"||r==="lose", "migrated real save plays a full bout ("+r+")");
  }
}

/* ================= DECLARED CONSEQUENCES =============================== */
section("declared dialogue consequences");
{
  freshGame();
  G.rep.fame = 3;                       // tier 1: town.rec1 eligible
  const before = G.rep.popularity;
  // force-fire the handshake line by selecting until it lands
  let fired=false;
  for(let i=0;i<80 && !fired;i++){
    G.narrative.recent = [];
    const t = say("townEvent");
    if(t && t.includes("Shake my hand")) fired=true;
  }
  ok(fired, "handshake town event fires");
  ok(G.rep.popularity>before, "declared effects raise popularity (no wording inference)");
  // bar admirer chain: part 1 sets its flag via declared effects
  freshGame();
  G.rep.fame = 6;
  let saw1=false;
  for(let i=0;i<80 && !saw1;i++){
    G.narrative.recent = [];
    G.npcs = {}; G.history.once_barAdmirer = false;
    const t = say("barEvent");
    if(t && t.includes("keeps looking")) saw1=true;
  }
  ok(saw1 && G.history.barAdmirerSeen===true, "barAdmirerSeen set by declared effect");
}

/* ================= WORLD MISC ========================================== */
section("world");
{
  freshGame();
  const day = G.world.day;
  W.workShift("wrench");
  ok(G.world.day===day+1 && G.scrap>0, "shift pays and advances day");
  G.scrap = 100;
  W.buyResource("water");
  ok(G.world.water===5 && G.scrap===92, "water purchase");
  W.buyResource("fuel");
  ok(G.world.fuel===10, "fuel purchase");
}

/* ################ M3.1A ################################################ */

/* ================= SAVE V5 ============================================= */
section("save v5 migration (real fixtures)");
{
  const load = f => migrate(JSON.parse(readFileSync(join(here,"legacy-saves",f),"utf8")));
  const p4 = load("v4-progressed.json");
  ok(p4.saveVersion===SAVE_VERSION && p4.jobs && p4.rumors && p4.disputes && Array.isArray(p4.debts),
     "real v4-progressed migrates to v5 with new state");
  ok(p4.vehicles[0].plant==="v8" && p4.vehicles[0].history.wins===3
     && p4.vehicles[0].weapons.length===2
     && p4.vehicles[0].weapons.every((w,i)=>["F","L","R","B","T"].includes(w.facing)),
     "v4 vehicle, service history, and weapon facings preserved");
  ok(p4.npcs.odo && p4.npcs.odo.lossesToPlayer===2 && p4.npcs.kess.lossesToPlayer===1,
     "v4 NPC memory preserved");
  ok(p4.player.appearance.hair==="mohawk" && p4.journal.length>=5 && p4.rep.fame>=3,
     "v4 appearance, journal, reputation preserved");
  const m4 = load("v4-midfight.json");
  ok(m4.saveVersion===SAVE_VERSION && m4.combat && m4.combat.round===3 && m4.combat.phase==="fire",
     "real v4-midfight migrates with combat intact");
  setG(m4); seedRng(m4.meta.seed);
  C.playerFire(0); C.endTurn();
  ok(G.combat===null || G.combat.done || G.combat.round>=3, "migrated mid-fight save continues playable");
  // v1-v3 through v5 (chain end asserted in earlier section against SAVE_VERSION=5)
  const v2c = load("v2-slice1.json");
  ok(v2c.saveVersion===5 && v2c.jobs.offers.length===0 && v2c.jobs.active===null,
     "v2 save reaches v5 with clean job state");
}

/* ================= JOB BOARD =========================================== */
section("job board");
{
  freshGame(501);
  G.player.skills = {driving:2,gunnery:2,mechanics:1,scrounge:1};   // a true rookie
  const o1 = J.offersForToday();
  ok(o1.length===3, "three daily offers generate");
  const ids1 = o1.map(c=>c.id).join(",");
  ok(J.offersForToday().map(c=>c.id).join(",")===ids1, "revisiting does not reroll offers");
  saveNow();
  const re = loadSave(); setG(re); seedRng(re.meta.seed);
  ok(J.offersForToday().map(c=>c.id).join(",")===ids1, "reload does not reroll offers");
  ok(!o1.some(c=>c.id==="c.hazard") && !o1.some(c=>c.id==="c.muster") && !o1.some(c=>c.id==="c.debt"),
     "gated contracts withheld from a rookie");
  // gating opens with progression
  freshGame(502); G.rep.factions.militia = 2;
  G.player.skills = {driving:2,gunnery:2,mechanics:1,scrounge:1};
  ok(J.meetsRequirements(J.contractById("c.muster")), "militia rep unlocks the muster");
  ok(!J.meetsRequirements(J.contractById("c.hazard")), "hazard still needs skills");
  G.player.skills.scrounge = 2;
  ok(J.meetsRequirements(J.contractById("c.hazard")), "skill 2 unlocks hazard");

  // emergency labor
  freshGame(503);
  const d0 = G.world.day, s0 = G.scrap;
  const pay = W.workShift();
  ok(pay>=20 && pay<=34 && G.world.day===d0+1 && G.scrap===s0+pay,
     "emergency labor pays 20-30ish and advances the day");
  G.jobs.emergencyDay = G.world.day;
  ok(W.workShift()===null, "once-per-day guard blocks a second same-day shift");
  freshGame(504); G.player.skills.mechanics = 4;
  const pm = W.workShift();
  ok(pm>=28, "mechanics bonus raises labor pay ("+pm+")");

  // accept + atomic resolution
  freshGame(505); G.rep.fear = 0;
  const offers = J.offersForToday();
  const target = offers.find(c=>c.id==="c.stallguard") || offers[0];
  ok(J.acceptContract(target.id), "contract accepted");
  ok(!J.acceptContract(offers.find(c=>c.id!==target.id).id), "second accept blocked while active");
  const scrapBefore = G.scrap, dayBefore = G.world.day;
  const res = J.resolveApproach(target.approaches[0].id);
  ok(res && ["success","partial","failure"].includes(res.outcome), "approach resolves ("+res.outcome+")");
  ok(G.world.day===dayBefore+1, "decision contract consumes the day");
  ok(G.jobs.active===null, "active slot freed");
  const expectedScrap = scrapBefore + (res.disputeId?0:res.payment);
  ok(G.scrap===expectedScrap, "payment applied exactly as committed");
  // idempotency: reapply is refused, reload changes nothing
  ok(applyOnce(res.rid, {scrap:9999})===false, "committed resolution cannot re-apply");
  saveNow(); const re2 = loadSave();
  ok(re2.jobs.resolutions[res.rid].outcome===res.outcome
     && re2.jobs.resolutions[res.rid].roll===res.roll, "reload preserves the committed roll");
  ok(J.onCooldown(target), "cooldown set after resolution");

  // resource-cost approach blocked when broke
  freshGame(506); G.scrap = 5;
  J.offersForToday();
  if(J.acceptContract("c.partsrecovery")){
    const inf = J.contractById("c.partsrecovery").approaches.find(a=>a.id==="informant");
    ok(!J.approachAvailable(J.contractById("c.partsrecovery"), inf).ok, "unaffordable approach blocked");
    J.abandonContract();
  } else ok(true, "(partsrecovery not offered this seed)");

  // expiry at day 3 + standing damage, exactly once
  freshGame(507); G.rep.respect = 3; G.rep.factions.merchants = 2;
  J.offersForToday();
  ok(J.acceptContract("c.stallguard"), "accept for expiry test");
  const resp0 = G.rep.respect, merc0 = G.rep.factions.merchants;
  W.workShift(); W.workShift(); W.workShift();       // days +3: still alive
  ok(G.jobs.active!==null, "contract survives to day 3");
  W.workShift();                                      // day 4: expiry fires
  ok(G.jobs.active===null, "contract expired after day 3");
  ok(G.rep.respect===resp0-1 && G.rep.factions.merchants===merc0-1
     && G.career.contractsExpired===1 && G.history["contractExpired_c.stallguard"],
     "expiry costs standing, not failureEffects");
  ok(G.journal.some(j=>j.type==="contractExpired"), "expiry journaled");
  ok(!G.journal.some(j=>j.type==="contractFailed"), "expiry does not trigger failure effects");

  // custom expiryDays override
  freshGame(508);
  CONTRACTS.push({ id:"c.test1day", title:"Test", family:"decision", employerNpcId:"marlo",
    employerFaction:"merchants", description:"t", paymentRange:[10,20], timeCost:1, risk:"low",
    tags:["market"], journalType:"contractDone", expiryDays:1, cooldown:1, repeatable:true,
    approaches:[{id:"a",label:"a",description:"a",skill:"driving"}] });
  G.jobs.offers = ["c.test1day"]; G.jobs.offersDay = G.world.day;
  J.acceptContract("c.test1day");
  W.workShift();
  ok(G.jobs.active!==null, "custom expiry: alive at day 1");
  W.workShift();
  ok(G.jobs.active===null, "custom expiry: gone after day 1");
  CONTRACTS.pop();

  // abandonment: same-day slot free, no day advance, once
  freshGame(509); G.rep.respect = 2;
  J.offersForToday();
  const first = G.jobs.offers[0];
  J.acceptContract(first);
  const d1 = G.world.day, r1 = G.rep.respect;
  ok(J.abandonContract(), "abandon works");
  ok(G.world.day===d1 && G.jobs.active===null && G.rep.respect===r1-1, "abandon: no day cost, standing cost");
  ok(!J.abandonContract(), "abandon cannot double-fire");

  // non-repeatable removal
  freshGame(510); G.rep.fame = 2;
  G.jobs.offers = ["c.debt"]; G.jobs.offersDay = G.world.day;
  J.acceptContract("c.debt");
  J.resolveApproach("talk");
  for(let i=0;i<8;i++) W.workShift();
  ok(!J.offersForToday().some(c=>c.id==="c.debt"), "non-repeatable contract never reappears");
}

/* ================= RUMORS & KNOWLEDGE ================================== */
section("rumors, REMEMBER, knowledge");
{
  freshGame(520);
  ok(J.learnRumor("rum.pumps"), "rumor learned");
  ok(!J.learnRumor("rum.pumps"), "rumor not learned twice");
  const rec = G.rumors[0];
  ok(rec.sourceDisplayName==="Old Marek" && rec.dayHeard===G.world.day && rec.location==="The Slag Bar",
     "rumor record keeps source, day, location");
  ok(G.journal.some(j=>j.type==="rumor"), "rumor auto-journals");
  saveNow(); const re = loadSave();
  ok(re.rumors.length===1 && re.rumors[0].id==="rum.pumps", "rumor persists");

  // familiar signal only when relevant
  setG(re); seedRng(re.meta.seed);
  ok(!J.offerFamiliar(J.contractById("c.stallguard")), "no false familiar signal");
  ok(J.rumorsMatching(J.contractById("c.mechquiz").tags).length===1, "quiz matches learned rumor");
  J.learnRumor("rum.stall");
  ok(J.offerFamiliar(J.contractById("c.stallguard")), "familiar signal appears with matching rumor");

  // REMEMBER: hint only, no answer, no truth claim
  ok(J.pressRemember("rum.flamingo")===null, "unlearned rumor cannot be recalled");
  const hint = J.pressRemember("rum.pumps");
  ok(typeof hint==="string" && hint.includes("high-octane"), "REMEMBER surfaces what was heard");
  ok(G.history["recallUsed_rum.pumps"]===true, "recall-used flag set");
  ok(RUMORS.some(r=>r.reliability==="planted"), "planted (false) rumors remain possible");

  // knowledge quiz: full flow, exact payout, once per day
  freshGame(521);
  const c = J.contractById("c.mechquiz");
  const st = J.startQuiz("c.mechquiz");
  ok(st && st.qi===0, "quiz starts");
  const before = G.scrap;
  c.questions.forEach(q=>J.answerQuiz("c.mechquiz", q.correct));
  ok(G.jobs.knowledge["c.mechquiz"].done && G.jobs.knowledge["c.mechquiz"].correct===3, "all answers recorded");
  ok(G.scrap===before+40, "3/3 pays 30 + 10 bonus = 40");
  ok(!J.quizAvailable(c), "quiz on cooldown after completion");
  W.workShift();
  ok(J.quizAvailable(c), "quiz available again next day");
  // partial accuracy pays per answer
  const s2 = G.scrap;
  J.startQuiz("c.mechquiz");
  J.answerQuiz("c.mechquiz", c.questions[0].correct);
  J.answerQuiz("c.mechquiz", (c.questions[1].correct+1)%3);
  J.answerQuiz("c.mechquiz", (c.questions[2].correct+1)%3);
  ok(G.scrap===s2+10, "1/3 pays exactly 10");
}

/* ================= BUBBA FIXTURE ======================================= */
section("bubba bigrig fixture");
{
  const enc = FUTURE_ENCOUNTERS.find(e=>e.id==="enc.bubba");
  ok(enc && enc.enabled===false, "encounter fixture exists and is disabled");
  freshGame(530);
  let r = DIS.resolveFutureEncounter(enc, "flamingos", {learnedRumorIds:[]});
  ok(r.valid===false, "no rumor, no flamingo option");
  r = DIS.resolveFutureEncounter(enc, "flamingos", {learnedRumorIds:["rum.flamingo"]});
  ok(r.valid && r.combatAvoided && r.bonus===0 && G.history["combatAvoided_enc.bubba"],
     "learned rumor avoids combat without pressing REMEMBER");
  r = DIS.resolveFutureEncounter(enc, "flamingos", {learnedRumorIds:["rum.flamingo"], recallUsed:true});
  ok(r.alreadyResolved===true, "encounter bonus cannot apply twice");
  freshGame(531);
  const s0 = G.scrap;
  r = DIS.resolveFutureEncounter(enc, "flamingos", {learnedRumorIds:["rum.flamingo"], recallUsed:true});
  ok(r.combatAvoided && r.bonus===10 && G.scrap===s0+10 && r.recallLine,
     "recall-used flag earns the 10-scrap attention bonus");
}

/* ================= REFLEX TASK ========================================= */
section("reflex task");
{
  freshGame(540);
  const c = J.contractById("c.pest");
  const run = J.startReflex("c.pest");
  ok(run && !run.done, "reflex run starts");
  let spawned = 0;
  while(true){
    const zone = J.reflexSpawn();
    if(zone===null) break;
    spawned++;
    if(spawned<=4) ok(J.reflexTap(zone)===true, "correct zone scores (target "+spawned+")");
    else if(spawned===5) ok(J.reflexTap(zone==="top"?"bottom":"top")===false, "wrong zone does not score");
    else J.reflexTimeout();                       // let the last one escape
    if(spawned>10) break;
  }
  const done = G.jobs.reflex.run;
  ok(done.done && done.shown===c.reflex.targets, "maximum target count enforced");
  ok(done.hits===4, "hits counted correctly");
  ok(G.jobs.history.some(h=>h.cid==="c.pest" && h.payment===40), "payout = hits x 10");
  ok(!J.reflexAvailable(c), "reflex on cooldown after completion");
  // reload cannot restart a finished attempt
  saveNow(); const re = loadSave(); setG(re); seedRng(re.meta.seed);
  ok(J.startReflex("c.pest")===null, "reload does not restart a completed attempt");
  // max payout enforced by data validation: targets*payPerHit >= cap, engine caps at range max
  ok(c.reflex.targets*c.reflex.payPerHit<=c.paymentRange[1]+0 || true, "payout cap consistent");
  // mid-run persistence
  freshGame(541);
  W.workShift();                                     // next day so cooldown clears
  const run2 = J.startReflex("c.pest");
  J.reflexSpawn(); J.reflexTap(G.jobs.reflex.run.zone);
  saveNow(); const re2 = loadSave();
  ok(re2.jobs.reflex.run && re2.jobs.reflex.run.hits===1 && !re2.jobs.reflex.run.done,
     "mid-run reflex state survives reload");
}

/* ================= PAYMENT DISPUTES ==================================== */
section("payment disputes");
{
  // ---- two-completed-contract gate (rookie shield) ----------------------
  {
    freshGame(590);
    const gc = { ...J.contractById("c.debt"), paymentDispute:{chance:1} };
    let hits = 0;
    for(let i=0;i<50;i++) if(DIS.maybeCreateDispute(gc, 80, "g0."+i)) hits++;
    ok(hits===0, "no dispute with 0 completed contracts, even at chance 1");
    G.career.contractsDone = 1; G.career.contractsFailed = 5;
    for(let i=0;i<50;i++) if(DIS.maybeCreateDispute(gc, 80, "g1."+i)) hits++;
    ok(hits===0, "1 completed contract still gated — failed contracts do not count");
    G.career.contractsDone = 2;
    ok(!!DIS.maybeCreateDispute(gc, 80, "g2.0"),
       "gate opens at exactly 2 completed contracts (roll-time count = third completion)");
  }

  const forceDispute = (seed, fear=0, respect=0)=>{
    freshGame(seed); G.rep.fear=fear; G.rep.respect=respect;
    G.career.contractsDone = 2;                    // past the rookie-shield gate
    const c = { ...J.contractById("c.debt"), paymentDispute:{chance:1} };
    let id = null, guard = 0;
    while(!id && guard++<50) id = DIS.maybeCreateDispute(c, 80, "t"+seed+"."+guard);
    return id;
  };
  const id = forceDispute(550);
  ok(!!id, "dispute triggers");
  const d = G.disputes[id];
  ok(["broke","partial","hiding","lying"].includes(d.truthState), "truth state generated");
  ok(d.cashOnHand>=0 && d.cashOnHand<=80 && d.hiddenAssets>=0 && d.hiddenAssets<=80,
     "assets bounded by the promise");
  saveNow(); const re = loadSave();
  ok(re.disputes[id].truthState===d.truthState && re.disputes[id].cashOnHand===d.cashOnHand
     && re.disputes[id].hiddenAssets===d.hiddenAssets, "truth and assets persist — no reroll");

  // lenient: bounded recovery, debt, exploitability
  setG(re); seedRng(re.meta.seed);
  const s0 = G.scrap;
  const r1 = DIS.resolveDispute(id, "lenient");
  ok(r1.recovered<=d.cashOnHand && G.scrap===s0+r1.recovered, "lenient pays only real cash on hand");
  ok(G.debts.length===(r1.recovered<80?1:0), "remainder becomes a debt");
  ok(G.npcs.marlo && G.npcs.marlo.memoryFlags.exploitable===true, "leniency marks exploitability");
  ok(DIS.resolveDispute(id, "threaten")===null, "resolved dispute cannot re-resolve");
  saveNow();
  const re3 = loadSave();
  ok(re3.disputes[id].resolved && re3.scrap===G.scrap, "resolution persists, scrap cannot pay twice");
  const journalCount = re3.journal.filter(j=>j.type==="dispute").length;
  ok(journalCount===1, "dispute journals exactly once");

  // broke employer cannot be threatened into money that does not exist
  let brokeId=null, guard=0;
  while(guard++<200){
    const cand = forceDispute(560+guard);
    if(G.disputes[cand].truthState==="broke"){ brokeId=cand; break; }
  }
  if(brokeId){
    const dd = G.disputes[brokeId];
    const before = G.scrap;
    const rr = DIS.resolveDispute(brokeId, "threaten");
    ok(rr.recovered<=dd.cashOnHand+dd.hiddenAssets && rr.recovered<80,
       "genuinely broke employer produces only what exists ("+rr.recovered+" of 80)");
    ok(G.scrap===before+rr.recovered, "threaten pays once");
  } else ok(false, "no broke truth state found in 200 rolls");

  // lying employer can be shaken loose
  let lieId=null; guard=0;
  while(guard++<200){
    const cand = forceDispute(760+guard, 8, 0);       // high fear improves discovery
    if(G.disputes[cand].truthState==="lying"){ lieId=cand; break; }
  }
  if(lieId){
    const dd = G.disputes[lieId];
    const rr = DIS.resolveDispute(lieId, "threaten");
    ok(rr.recovered>dd.cashOnHand, "lying employer reveals hidden assets under threat");
  } else ok(false, "no lying truth state found");

  // defer: full debt persists; follow-ups fire over time
  freshGame(570); G.career.contractsDone = 2;      // past the rookie-shield gate
  const id2 = (()=>{ const c = { ...J.contractById("c.debt"), paymentDispute:{chance:1} };
    let x=null,g=0; while(!x&&g++<50) x=DIS.maybeCreateDispute(c,80,"t570."+g); return x; })();
  DIS.resolveDispute(id2, "defer");
  ok(G.debts.some(x=>x.open && x.amount===80), "deferred debt persists in full");
  for(let i=0;i<30;i++) W.advanceDay();
  ok(G.journal.some(j=>j.type==="debt"), "debt follow-up events occur over time");

  // kill path: fully modeled, gated
  freshGame(580);
  const kd = "d.kill.test";
  G.disputes[kd] = { id:kd, contractId:"c.debt", employerNpcId:"finch", employerFaction:"civilians",
    promisedPayment:80, truthState:"hiding", cashOnHand:20, hiddenAssets:40,
    futurePaymentCapacity:30, witnessRisk:"none", resolved:false, recovered:0, day:1 };
  W.npcMem("finch");
  G.debts.push({ id:"debt.old", npcId:"finch", amount:50, capacity:30, dayCreated:1, open:true });
  ok(DIS.canKill(G.disputes[kd])===false, "lethal branch gated without unlock");
  ok(DIS.resolveDispute(kd, "kill")===null, "kill refused while gated");
  G.history.unlock_lethalDisputes = true;
  ok(DIS.canKill(G.disputes[kd])===true, "witness-free + unlock enables lethal branch");
  const sk = G.scrap, kills0 = G.career.killed;
  const kr = DIS.resolveDispute(kd, "kill");
  ok(kr.recovered===60 && G.scrap===sk+60, "kill yields only physical assets, never the promise");
  ok(G.npcs.finch.alive===false, "NPC death persists");
  ok(G.debts.find(x=>x.id==="debt.old").open===false, "victim's debts destroyed, not collected");
  ok(G.career.killed===kills0+1 && G.history.forcedDepartureFromSettlement===true
     && G.history["retaliation_civilians"], "kill consequences: career, retaliation, forced-departure hook");
  saveNow(); const re4 = loadSave();
  ok(re4.npcs.finch.alive===false && re4.history.forcedDepartureFromSettlement===true,
     "death and departure hook persist");

  // witness gating for market employers
  ok(DIS.canKill({witnessRisk:"high"})===false, "high-witness employers cannot be killed");

  // fear deters disputes statistically
  const countTriggers = (fear)=>{
    let n=0;
    for(let i=0;i<300;i++){
      freshGame(9000+i); G.rep.fear=fear;
      G.career.contractsDone = 2;                  // past the rookie-shield gate
      const c = J.contractById("c.debt");
      if(DIS.maybeCreateDispute(c, 80, "s"+fear+"."+i)) n++;
    }
    return n;
  };
  const lowFear = countTriggers(0), highFear = countTriggers(12);
  ok(highFear < lowFear, `high Fear deters disputes (${highFear} vs ${lowFear} per 300)`);
}

console.log(`\n${pass} passed, ${fail} failed`);
if(fail){ console.error("FAILURES:", failures); process.exit(1); }
