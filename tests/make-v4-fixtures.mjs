/* Capture REAL v4 save fixtures by playing the actual current engine
   headless — not synthetic objects. Run against the pre-v5 codebase; the
   outputs are pinned in tests/legacy-saves/ as migration inputs.
   node tests/make-v4-fixtures.mjs */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { G, setG, newGame, seedRng } from "../js/core.js";
import * as W from "../js/world.js";
import * as V from "../js/vehicles.js";
import * as C from "../js/combat.js";

const out = join(dirname(fileURLToPath(import.meta.url)), "legacy-saves");

function playCommonOpening(seed){
  const g = newGame(); g.meta.seed = seed;
  g.campaign.flags.started = true;
  setG(g); seedRng(seed);
  // creation, as the UI would commit it
  G.player.name = "Ricketts";
  G.player.skills = { driving:2, gunnery:3, mechanics:2, scrounge:1 };
  G.player.appearance = { body:"androgynous", build:"muscular", hair:"mohawk",
    face:"damaged", clothing:"leathers", accessory:"gunbelt" };
  G.player.created = true;
  W.earn(100, "severance");
  W.addJournal("created", { name:"Ricketts" });
  // earn and build through the real economy
  W.workShift("wrench"); W.workShift("wall"); W.workShift("sort");
  G.scrap += 600;                       // stake shortcut, still real ops below
  V.buyChassis("courser");
  V.setPlant("v8");
  ["F","F","F","L","R","B"].forEach(f=>V.armorMod(f,1));
  V.buyWeapon("mg"); V.buyWeapon("cannon");
  V.buyGear("ring"); V.faceWeapon(0); V.faceWeapon(0); V.faceWeapon(0); V.faceWeapon(0); // mg -> turret
  W.buyResource("fuel"); W.buyResource("water");
  W.buyRumor();
}
function grind(tier){
  C.startBout(tier);
  let guard=0;
  while(G.combat && !G.combat.done && guard++<250){
    if(G.combat.phase==="move"){
      const b = C.bearing(G.combat.p, G.combat.e);
      C.playerManeuver(b.dist>3 ? "accel" : "coast");
    }
    for(let i=0;i<V.vehicle().weapons.length;i++){ if(G.combat.done) break; C.playerFire(i); }
    if(!G.combat.done) C.endTurn();
  }
  const r = G.combat.result;
  C.fightDone();
  V.repairVehicle();
  V.vehicle().weapons.forEach((w,i)=>V.reloadWeapon(i));
  return r;
}

/* progressed fixture: real career with wins, losses, rep, journal, memory */
playCommonOpening(2024);
const results = [grind("q"), grind("q"), grind("p")];
G.screen = "hub";
writeFileSync(join(out,"v4-progressed.json"), JSON.stringify(G, null, 1));
console.log("v4-progressed:", results.join(","), "| scrap", G.scrap,
  "| fame", G.rep.fame, "| journal", G.journal.length,
  "| odo mem", JSON.stringify(G.npcs.odo||null));

/* mid-fight fixture: live combat state with damage, ammo and heat spent */
playCommonOpening(3033);
C.startBout("q");
for(let round=0; round<2 && !G.combat.done; round++){
  if(G.combat.phase==="move"){
    const b = C.bearing(G.combat.p, G.combat.e);
    C.playerManeuver(b.dist>3 ? "accel" : "coast");
  }
  C.playerFire(0);
  if(!G.combat.done) C.endTurn();
}
if(G.combat.phase==="move"){
  const b = C.bearing(G.combat.p, G.combat.e);
  C.playerManeuver(b.dist>3 ? "accel" : "coast");   // leave it in fire phase
}
G.screen = "fight";
writeFileSync(join(out,"v4-midfight.json"), JSON.stringify(G, null, 1));
console.log("v4-midfight: round", G.combat.round, "phase", G.combat.phase,
  "| p.heat", G.combat.p.heat, "| foe hull dmg", G.combat.foeV.dmg.hull,
  "| rngCalls", G.meta.rngCalls);
