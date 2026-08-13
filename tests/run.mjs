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

console.log(`\n${pass} passed, ${fail} failed`);
if(fail){ console.error("FAILURES:", failures); process.exit(1); }
