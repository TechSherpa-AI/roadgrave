/* golden.js — builders for golden test saves. Used by tests/run.mjs (via
   tests/golden/*.json fixtures) and by the debug panel for instant states.
   Each builder returns a complete, valid v4 save object. */

import { newGame } from "./core.js";
import { newVehicle } from "./vehicles.js";

function base(name="Ada", skills={driving:2,gunnery:3,mechanics:2,scrounge:1}){
  const g = newGame();
  g.meta.seed = 12345;
  g.player.created = true;
  g.player.name = name;
  g.player.skills = skills;
  g.player.appearance = { body:"androgynous", build:"muscular", hair:"mohawk",
    face:"damaged", clothing:"leathers", accessory:"goggles" };
  g.campaign.flags.started = true;
  g.screen = "hub";
  return g;
}
function rig(g, chassis="courser", plant="v8", weapons=[["mg","F"],["cannon","F"]], armor={F:4,L:2,R:2,B:2,T:0}){
  const v = newVehicle(chassis);
  v.name = "The Test Mule";
  v.plant = plant;
  v.armor = {...armor};
  v.weapons = weapons.map(([id,facing])=>({id, facing, ammo:{scatter:10,mg:20,cannon:8,rockets:4}[id], dmgd:false}));
  g.vehicles = [v];
  return v;
}

export const GOLDEN = {
  fresh(){                              // brand-new character, no vehicle
    const g = base("Fresh Meat", {driving:2,gunnery:2,mechanics:2,scrounge:2});
    g.scrap = 100;
    g.journal.push({day:1,type:"created",data:{name:"Fresh Meat"},text:"Fresh Meat arrived in Kettle Rock."});
    return g;
  },
  starter(){                            // starter vehicle, little money
    const g = base("Starter");
    g.scrap = 40;
    rig(g, "skiff", "junker", [["scatter","F"]], {F:2,L:0,R:0,B:1,T:0});
    return g;
  },
  damaged(){                            // limping rig after a bad bout
    const g = base("Limper");
    g.scrap = 120;
    const v = rig(g);
    v.dmg = {hull:5,tires:2,plant:1};
    v.weapons[0].dmgd = true;
    v.armor.F = 0;
    g.career.crucibleLosses = 2; g.career.losses = 2;
    g.history.lostAnyBout = true;
    return g;
  },
  wealthy(){                            // money is no object
    const g = base("Baron");
    g.scrap = 5000;
    g.career.scrapEarned = 6000;
    rig(g, "drayhulk", "turbine",
      [["cannon","F"],["mg","L"],["mg","R"],["rockets","B"]], {F:8,L:6,R:6,B:6,T:2});
    return g;
  },
  champion(){                           // beat everyone incl. Bruna
    const g = base("Champ");
    g.scrap = 900;
    rig(g);
    g.career = {...g.career, wins:8, crucibleWins:8, streak:5, bestStreak:6,
      championships:1, scrapEarned:2400 };
    g.rep = {...g.rep, fame:10, respect:9, fear:2, popularity:8 };
    g.rep.factions.militia = 8; g.rep.factions.crucible = 8;
    g.history = { defeatedOdo:3, defeatedKess:3, defeatedBruna:2 };
    g.npcs = {
      odo:  {encounterCount:3, lossesToPlayer:3, winsVsPlayer:0, relationship:1, disposition:"respect", alive:true, memoryFlags:{}},
      kess: {encounterCount:3, lossesToPlayer:3, winsVsPlayer:0, relationship:0, disposition:"grudge",  alive:true, memoryFlags:{}},
      bruna:{encounterCount:2, lossesToPlayer:2, winsVsPlayer:0, relationship:2, disposition:"respect", alive:true, memoryFlags:{}},
    };
    return g;
  },
  beloved(){                            // famous and loved, barely feared
    const g = this.champion();
    g.player.name = "Darling";
    g.rep = {...g.rep, fame:15, respect:10, fear:0, popularity:16 };
    return g;
  },
  hated(){                              // famous, effective, loathed
    const g = this.champion();
    g.player.name = "Grudge";
    g.rep = {...g.rep, fame:15, respect:8, fear:9, popularity:1 };
    g.career.killed = 6;
    return g;
  },
  feared(){                             // high-fear enforcer career
    const g = base("Dread");
    g.scrap = 1500;
    rig(g, "drayhulk", "v8", [["cannon","F"]], {F:8,L:4,R:4,B:4,T:0});
    g.career = {...g.career, wins:6, crucibleWins:6, killed:7, scrapEarned:1800, bestStreak:4 };
    g.rep = {...g.rep, fame:8, respect:4, fear:11, popularity:1 };
    return g;
  },
  rivalries(){                          // deep NPC memories, mixed record
    const g = base("Nemesis");
    g.scrap = 400;
    rig(g);
    g.career = {...g.career, wins:4, losses:3, crucibleWins:4, crucibleLosses:3, scrapEarned:900 };
    g.rep = {...g.rep, fame:5, respect:4, fear:1, popularity:3 };
    g.history = { defeatedOdo:2, defeatedKess:1, lostAnyBout:true };
    g.npcs = {
      odo:  {encounterCount:4, lossesToPlayer:2, winsVsPlayer:2, relationship:-1, disposition:"personal", alive:true, memoryFlags:{}},
      kess: {encounterCount:2, lossesToPlayer:1, winsVsPlayer:1, relationship:-1, disposition:"irritated", alive:true, memoryFlags:{}},
    };
    return g;
  },
  midfight(){                           // saved mid-Crucible, fire phase
    const g = base("Paused");
    g.scrap = 300;
    const v = rig(g);
    g.screen = "fight";
    g.npcs.odo = {encounterCount:1, lossesToPlayer:0, winsVsPlayer:0, relationship:0, disposition:"neutral", alive:true, memoryFlags:{}};
    g.combat = {
      tier:"q", npc:"odo", round:3, phase:"fire", done:false, result:null, applied:false,
      called:null, enemyFirst:false, rams:0,
      p:{ pos:4, lane:1, speed:2, heat:6, drvPen:0 },
      e:{ pos:6, lane:1, speed:1, heat:4, drvPen:0 },
      foe:{ id:"odo", name:"Pipsqueak Odo", skills:{driving:1,gunnery:1} },
      foeV:{ chassis:"skiff", plant:"junker", armor:{F:1,L:1,R:1,B:0,T:0},
        weapons:[{id:"scatter",facing:"F",ammo:6,dmgd:false}], gear:[],
        dmg:{hull:2,tires:1,plant:0},
        history:{ originalChassis:"skiff", acquiredDay:1, previousOwners:[], mileage:9,
          wins:0, losses:0, kills:0, majorRepairs:0, installs:0, removals:0, championships:0 } },
      log:["Round 3: you have the initiative."],
    };
    return g;
  },
  veteran(){                            // near-retirement, rich history
    const g = this.champion();
    g.player.name = "Old Iron";
    g.world.day = 120;
    g.career = {...g.career, wins:15, losses:4, crucibleWins:15, crucibleLosses:4,
      championships:2, scrapEarned:5200, contractsDone:6, bestStreak:8 };
    g.rep = {...g.rep, fame:16, respect:14, fear:5, popularity:12 };
    for(let d=1; d<=12; d++)
      g.journal.push({day:d*10, type:"boutWin", data:{foe:"someone"}, text:"Another bout, another purse."});
    return g;
  },
};
