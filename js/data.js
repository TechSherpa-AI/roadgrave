/* data.js — static game tables. Read-only at runtime; balancing = edits here. */

export const DATA = {
  cities: [
    { id:"kettle_rock", name:"Kettle Rock", blurb:"A scrapyard town built inside the bones of a dead refinery." },
  ],
  skills: [
    { id:"driving",  name:"Driving",  desc:"Initiative, maneuvers, ramming." },
    { id:"gunnery",  name:"Gunnery",  desc:"To-hit and called shots." },
    { id:"mechanics",name:"Mechanics",desc:"Cheaper repairs, better refits." },
    { id:"scrounge", name:"Scrounge", desc:"Loot quality, barter, odd luck." },
  ],
  chassis: [
    { id:"skiff",   name:"Salt Skiff",  cost:100, wt:350, maxGross:900,  space:6,  mounts:2, handling:1, hull:8,
      blurb:"A stripped dune runner. Quick, fragile, cheap to feed." },
    { id:"courser", name:"Courser",     cost:220, wt:550, maxGross:1400, space:9,  mounts:3, handling:0, hull:12,
      blurb:"Pre-Undertow sedan with good bones. The honest choice." },
    { id:"drayhulk",name:"Drayhulk",    cost:400, wt:900, maxGross:2400, space:14, mounts:4, handling:-1, hull:18,
      blurb:"A refinery hauler. Slow, vast, and very hard to argue with." },
  ],
  plants: [
    { id:"junker", name:"Junker Six",    cost:80,  wt:120, power:80,  heat:4, blurb:"Coughs, rattles, runs forever." },
    { id:"v8",     name:"Refit V8",      cost:180, wt:160, power:130, heat:6, blurb:"Rebuilt from three donors. Strong and steady." },
    { id:"turbine",name:"Howler Turbine",cost:380, wt:140, power:200, heat:5, blurb:"Screams like the damned. Power over patience." },
  ],
  armor: { cost:8, wt:6, max:8,
    facings:[["F","Front"],["L","Left"],["R","Right"],["B","Rear"],["T","Top"]] },
  weapons: [
    { id:"scatter", name:"Scattergun",  cost:60,  wt:40,  space:1, heat:1, dmg:"2d6",   rng:"Close",  ammo:10, rnd:1.0,
      blurb:"Point it, empty it, apologize to no one." },
    { id:"mg",      name:"Slugthrower", cost:90,  wt:50,  space:1, heat:1, dmg:"1d6+2", rng:"Medium", ammo:20, rnd:0.6,
      blurb:"A belt-fed argument. Reliable at range." },
    { id:"cannon",  name:"Bolt Cannon", cost:200, wt:120, space:2, heat:2, dmg:"3d6",   rng:"Long",   ammo:8,  rnd:2.5,
      blurb:"Punches through armor and manners alike." },
    { id:"rockets", name:"Rocket Pod",  cost:150, wt:60,  space:1, heat:0, dmg:"4d6",   rng:"Medium", ammo:4,  rnd:7.5,
      blurb:"Four answers to any question. No heat, no refunds." },
  ],
  gear: [
    { id:"ram",     name:"Ram Plate",    cost:90,  wt:100, space:1, blurb:"Doubles ram damage dealt, halves ram damage taken." },
    { id:"smoke",   name:"Smoke Pots",   cost:40,  wt:20,  space:1, charges:3, rnd:5, blurb:"Drops a blinding cloud behind you." },
    { id:"oil",     name:"Oil Sprayer",  cost:50,  wt:25,  space:1, charges:3, rnd:6, blurb:"Slicks the lane behind. Tailgaters beware." },
    { id:"mines",   name:"Mine Dropper", cost:120, wt:60,  space:1, charges:4, rnd:12, blurb:"Leaves 4d6 surprises on the road." },
    { id:"coolant", name:"Coolant Loop", cost:100, wt:40,  space:1, blurb:"+2 heat budget per turn." },
    { id:"rack",    name:"Cargo Rack",   cost:60,  wt:30,  space:0, blurb:"+4 cargo space for jobs and loot." },
    { id:"ring",    name:"Ring Mount",   cost:130, wt:50,  space:1, blurb:"Lets one weapon traverse 360° (Turret facing)." },
  ],
  shifts: [
    { id:"wrench", name:"Wrench shift at the garage", base:50, var:10, skill:"mechanics",
      flavor:"Elbow-deep in someone else's bad decisions." },
    { id:"wall",   name:"Wall guard rotation",        base:40, var:15, skill:"gunnery",
      flavor:"Eight hours staring at the Gravel Sea, rifle in hand." },
    { id:"sort",   name:"Salvage sorting",            base:35, var:10, skill:"scrounge",
      flavor:"One town's slag is another town's dinner." },
  ],
  rngMax:{ Close:2, Medium:4, Long:6 },
  weaponFacings:[["F","Front"],["L","Left"],["R","Right"],["B","Rear"]],

  /* ---- character appearance: 6 categories × 3 choices = 729 combos ----
     Narrative metadata only — NO stat effects. Layer art specs live in
     docs/ASSET_REQUIREMENTS.md; the game runs fine with no layer art. */
  appearance: [
    { id:"body",     name:"Presentation", opts:[
      {id:"masculine", name:"Masculine"}, {id:"feminine", name:"Feminine"}, {id:"androgynous", name:"Androgynous"} ] },
    { id:"build",    name:"Build", opts:[
      {id:"thin", name:"Wiry"}, {id:"average", name:"Average"}, {id:"muscular", name:"Muscle Beast"} ] },
    { id:"hair",     name:"Hair", opts:[
      {id:"short", name:"Buzzed"}, {id:"long", name:"Long"}, {id:"mohawk", name:"Mohawk"} ] },
    { id:"face",     name:"Face", opts:[
      {id:"attractive", name:"Attractive"}, {id:"rough", name:"Rough"}, {id:"damaged", name:"Damaged"} ] },
    { id:"clothing", name:"Clothing", opts:[
      {id:"leathers", name:"Road Leathers"}, {id:"wraps", name:"Scav Wraps"}, {id:"overalls", name:"Grease Overalls"} ] },
    { id:"accessory",name:"Accessory", opts:[
      {id:"goggles", name:"Cracked Goggles"}, {id:"charm", name:"Bone Charm"}, {id:"gunbelt", name:"Gun Belt"} ] },
  ],

  /* ---- NPC registry: static identity. Per-save memory lives in G.npcs. */
  npcs: {
    odo:  { id:"odo",  name:"Pipsqueak Odo",  faction:"crucible",
            personalityTags:["desperate","opportunistic"], motivationTags:["survival","debt"] },
    kess: { id:"kess", name:"Kess the Vulture", faction:"scavengers",
            personalityTags:["greedy","opportunistic"], motivationTags:["profit","salvage"] },
    bruna:{ id:"bruna",name:"Bruna Halfaxe",  faction:"crucible",
            personalityTags:["honorable","ambitious"], motivationTags:["legacy","dominance"] },
    grix: { id:"grix", name:"Grix Redline",   faction:"gangs",
            personalityTags:["bloodthirsty","sadistic"], motivationTags:["blood","reputation"] },
  },

  /* ---- Crucible tiers. Reactive dialogue lives in data-dialogue.js;
     intro arrays here are scene-setting, played once at the gate. ------ */
  arena: [
    { id:"q", name:"Qualifier — Blood & Gravel", purse:120, repeat:60, xp:1, npc:"odo",
      pitch:"Every season the Crucible feeds on fresh drivers. Prove you're not food.",
      foe:{ skills:{driving:1,gunnery:1},
        v:{ chassis:"skiff", plant:"junker", armor:{F:2,L:1,R:1,B:1,T:0},
            weapons:[{id:"scatter",facing:"F",ammo:10}], gear:[], dmg:{hull:0,tires:0,plant:0} } },
      intro:[
        "The holding pen smells of coolant and fear. Beyond the gate: a bowl of packed slag and chain-link, and ten thousand people who paid to watch steel die.",
        "Pipsqueak Odo revs a patched Salt Skiff two stalls down. He doesn't look at you — rookies never do. \"Nothing personal,\" he mutters to his wheel. \"I just gotta eat.\"",
        "The pit master drops his arm.",
      ],
      winText:"The gate crew hauls the Skiff off in chains while the crowd stamps the bleachers into thunder. At the gate, a militia sergeant in slag-grey leathers looks you over — takes in the fresh scars, the smoking barrels — and gives you a single, short nod. In Kettle Rock, that nod is worth more than the purse.",
      loseText:"You come to with a tow chain rattling past your window and the taste of copper in your mouth. The crowd is already chanting someone else's name. The Gravel Sea doesn't grieve, and neither does the Crucible." },
    { id:"p", name:"Purse Bout — The Grinder", purse:250, repeat:150, xp:2, req:"q", npc:"kess",
      pitch:"Kess the Vulture strips her kills before they stop rolling.",
      foe:{ skills:{driving:2,gunnery:2},
        v:{ chassis:"courser", plant:"v8", armor:{F:3,L:2,R:2,B:2,T:0},
            weapons:[{id:"mg",facing:"F",ammo:20},{id:"scatter",facing:"B",ammo:10}], gear:[], dmg:{hull:0,tires:0,plant:0} } },
      intro:[
        "Night bout. Floodlights turn the pit floor to hammered tin, and the shadows under the bleachers are full of buyers who deal in what's left of losers.",
        "Kess the Vulture walks her Courser's perimeter, tapping each panel — a ritual, or an inventory. She looks at your rig the way a butcher looks at weight. \"I'll keep the plant,\" she says. \"The rest is scrap.\"",
        "Somewhere above, the odds change hands one last time. The gate drops.",
      ],
      winText:"The Grinder's crowd doesn't cheer so much as roar — a furnace sound that gets into your chest and stays. Scrap rains onto the pit floor, flung by winners of bets. At the gate the same militia sergeant is waiting. Two nods this time. People notice things like that here.",
      loseText:"The tow crew works fast, because Kess pays them to. You keep your rig — barely; the militia's one mercy rule — but she walks off with your pride itemized on a slate." },
    { id:"t", name:"Title Bout — Halfaxe", purse:500, repeat:300, xp:3, req:"p", npc:"bruna",
      pitch:"Bruna Halfaxe has held the title for three seasons. The crowd chants her name. It sounds like hammers.",
      foe:{ skills:{driving:3,gunnery:3},
        v:{ chassis:"drayhulk", plant:"v8", armor:{F:4,L:3,R:3,B:3,T:1},
            weapons:[{id:"cannon",facing:"F",ammo:8},{id:"mg",facing:"T",ammo:20}],
            gear:[{id:"ram",charges:null},{id:"ring",charges:null}], dmg:{hull:0,tires:0,plant:0} } },
      intro:[
        "They pack the bleachers to standing for a title bout. Vendors sell char-corn and engine-grease candy; children wear hammered-tin axes on strings.",
        "Bruna Halfaxe doesn't posture. She sits on the Drayhulk's push-bar, wrapping her wrists, watching you the way weather watches a roof. \"Three seasons,\" she says, not unkindly. \"Know what I've learned? Everybody's brave until the third hit.\"",
        "She stands. The crowd starts chanting. It sounds like hammers — it IS hammers, ten thousand fists on tin.",
      ],
      winText:"They don't crown champions in Kettle Rock. They brand your name onto the Crucible's gate with a welding torch, right beneath three seasons of Bruna's. The militia sergeant doesn't nod this time — he salutes. Next season, the kids' tin axes will carry YOUR sigil.",
      loseText:"You wake to Bruna's own crew pulling you clear — champion's courtesy. She crouches by your window a moment before the tow. \"Everybody's brave until the third hit,\" she says. \"You lasted to the third. Come back.\"" },
  ],
  repeatWinText:"The crowd knows your name now. A returning winner draws a lighter purse but the same roar — and the sergeant at the gate still gives you the nod.",

  /* Kettle Rock map hotspots: percent coords over img/city.jpg */
  mapHotspots: [
    { screen:"garage", label:"Garage",     x:1.5,  y:42, w:16, h:14 },
    { screen:"jobs",   label:"Job Board",  x:13,   y:62, w:14, h:11 },
    { screen:"market", label:"Market",     x:30,   y:50, w:16, h:13 },
    { screen:"bar",    label:"Slag Bar",   x:60,   y:54, w:15, h:13 },
    { screen:"arena",  label:"The Crucible", x:79, y:49, w:20, h:15 },
  ],
};

export const byId = (list,id)=>list.find(x=>x.id===id);
