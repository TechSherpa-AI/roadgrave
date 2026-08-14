/* data-jobs.js — Job Board contracts, structured rumors, knowledge
   questions, payment-dispute tuning, and the Bubba BigRig future fixture.
   Pure content: consequences are declared `effects` (see js/effects.js);
   resolution logic lives in js/jobs.js / js/disputes.js.

   Contract fields: id, title, family (decision|knowledge|reflex),
   employerNpcId, employerFaction, description, paymentRange:[lo,hi],
   timeCost (1 = consumes the day, 0 = free action), risk (low|medium|high),
   requirements {skills:{}, rep:{}, factionRep:{}, flags:[]},
   approaches[] (decision only), questions[] (knowledge only),
   reflex {targets, zones, payPerHit} (reflex only),
   successEffects/partialEffects/failureEffects (family-level defaults),
   cooldown (days before reappearing), repeatable, tags[],
   paymentDispute {chance} (omit = never disputes), journalType, expiryDays?.

   Approach fields: id, label, description, skill (player skill) OR repStat
   (fear|respect), mod (success % modifier), requiredRep, requiredFactionRep,
   vehicleRequirement {roadworthy}, resourceCost {scrap}, noCheck (auto
   outcome, e.g. betrayal), successEffects/partialEffects/failureEffects. */

export const CONTRACTS = [

/* ---------------- decision contracts ---------------------------------- */
{ id:"c.stallguard", title:"Stall Watch at the Rust Bucket", family:"decision",
  employerNpcId:"marlo", employerFaction:"merchants",
  description:"Marlo's corner stall keeps losing stock to quick hands on market day. He wants a visible problem standing next to his goods from open to close.",
  paymentRange:[35,60], timeCost:1, risk:"low", cooldown:2, repeatable:true,
  tags:["market","guard","thieves"], paymentDispute:{chance:0.15}, journalType:"contractDone",
  approaches:[
    { id:"loom", label:"Loom", skill:null, repStat:"fear", mod:5,
      description:"Stand by the stall all day looking like a bad decision waiting to happen." },
    { id:"sharpeyes", label:"Watch the crowd", skill:"gunnery", mod:0,
      description:"Track sightlines and hands. Catch them reaching." },
    { id:"dealmaker", label:"Talk to the crews", skill:null, repStat:"respect", mod:0, requiredRep:{respect:2},
      description:"Find whoever runs the quick hands and cut a quiet understanding.",
      successEffects:{ factions:{gangs:1} } },
  ],
  successEffects:{ factions:{merchants:1}, npcRelationships:{marlo:1},
    historyFlags:{ set:["stallguardTrust"] } },
  failureEffects:{ factions:{merchants:-1}, rep:{popularity:-1} } },

{ id:"c.partsrecovery", title:"The Missing Manifold", family:"decision",
  employerNpcId:"weld", employerFaction:"mechanics",
  description:"Somebody walked out of Weld's bay with a rebuilt manifold and half a crate of injectors. Weld wants the parts back more than the culprit punished.",
  paymentRange:[60,90], timeCost:1, risk:"medium", cooldown:3, repeatable:true,
  tags:["mechanics","theft","salvage"], paymentDispute:{chance:0.10}, journalType:"contractDone",
  approaches:[
    { id:"track", label:"Track the parts", skill:"scrounge", mod:5,
      description:"Every part in Kettle Rock flows somewhere. Follow the flow." },
    { id:"shake", label:"Shake the fences", skill:null, repStat:"fear", mod:0,
      description:"Visit the scrap fences and make returning stolen goods feel healthy.",
      successEffects:{ rep:{popularity:-1}, factions:{scavengers:-1} } },
    { id:"informant", label:"Pay an informant", skill:"scrounge", mod:20, resourceCost:{scrap:15},
      description:"Fifteen scrap buys a name from someone who watches the yards." },
  ],
  successEffects:{ factions:{mechanics:1}, npcRelationships:{weld:1},
    historyFlags:{ set:["weldFavor"] } },
  partialEffects:{ factions:{mechanics:1},
    journal:{type:"contractNote", data:{text:"Recovered some of Weld's parts — the manifold's still out there."}} },
  failureEffects:{ factions:{mechanics:-1} } },

{ id:"c.package", title:"A Sealed Box, No Questions", family:"decision",
  employerNpcId:"marlo", employerFaction:"merchants",
  description:"A wax-sealed crate, an address on the far side of the coker stacks, and Marlo's only instruction: it arrives unopened, today, and nobody official sees it move.",
  paymentRange:[60,90], timeCost:1, risk:"medium", cooldown:3, repeatable:true,
  tags:["contraband","delivery","gangs"], paymentDispute:{chance:0.22}, journalType:"contractDone",
  approaches:[
    { id:"discreet", label:"Move it quiet", skill:"scrounge", mod:5,
      description:"Back lanes, tarp over the crate, patience at every checkpoint." },
    { id:"fast", label:"Move it fast", skill:"driving", mod:0, vehicleRequirement:{roadworthy:true},
      description:"Speed is its own discretion. Needs a running rig." },
    { id:"openit", label:"Open the box", noCheck:"betray",
      description:"Whatever pays this well to stay sealed is worth more unsealed.",
      successEffects:{ scrap:40, factions:{gangs:1, merchants:-2}, npcRelationships:{marlo:-2},
        career:{betrayals:1}, historyFlags:{ set:["openedPackage"] },
        journal:{type:"contractNote", data:{text:"Opened Marlo's sealed box. Kept what mattered. Made an enemy who counts coins."}} } },
  ],
  successEffects:{ npcRelationships:{marlo:1} },
  failureEffects:{ factions:{merchants:-1, militia:-1}, rep:{respect:-1},
    journal:{type:"contractNote", data:{text:"The sealed box got noticed. Questions were asked. Names were taken."}} } },

{ id:"c.muster", title:"Militia Muster Day", family:"decision",
  employerNpcId:"harsk", employerFaction:"militia",
  description:"Sergeant Harsk needs steady hands to help run the wall militia's quarterly muster — drill the greens, run the range, keep the line honest.",
  paymentRange:[35,60], timeCost:1, risk:"low", cooldown:4, repeatable:true,
  requirements:{ any:[ {factionRep:{militia:1}}, {rep:{fame:2}} ] },
  tags:["militia","guard","drill"], journalType:"contractDone",
  approaches:[
    { id:"range", label:"Run the range", skill:"gunnery", mod:5,
      description:"Teach the greens which end of a slugthrower forgives nothing." },
    { id:"course", label:"Run the driving course", skill:"driving", mod:5,
      description:"Cones, ramps, and a sergeant timing every lap." },
  ],
  successEffects:{ factions:{militia:1}, npcRelationships:{harsk:1}, rep:{respect:1} },
  failureEffects:{ factions:{militia:-1}, rep:{respect:-1} } },

{ id:"c.hazard", title:"Hot Salvage", family:"decision",
  employerNpcId:"weld", employerFaction:"mechanics",
  description:"A collapsed storage cell full of pre-Undertow components — some priceless, some leaking things with warning glyphs nobody can read anymore. Sort the one from the other.",
  paymentRange:[90,140], timeCost:1, risk:"high", cooldown:4, repeatable:true,
  requirements:{ any:[ {skills:{scrounge:2}}, {skills:{mechanics:2}} ] },
  tags:["salvage","hazard","mechanics"], journalType:"contractDone",
  approaches:[
    { id:"careful", label:"Sort it slow", skill:"scrounge", mod:5,
      description:"Gloves, tongs, and respect for the glyphs." },
    { id:"shielding", label:"Rig shielding first", skill:"mechanics", mod:10, resourceCost:{scrap:10},
      description:"Spend ten scrap on scrap-lead sheeting before touching anything." },
  ],
  successEffects:{ rep:{respect:2}, factions:{mechanics:1} },
  partialEffects:{ rep:{respect:1} },
  failureEffects:{ scrap:-15, rep:{popularity:-1},
    journal:{type:"contractNote", data:{text:"The hot salvage bit back. The burn salve cost 15 scrap and the shakes cost a night's sleep."}} } },

{ id:"c.debt", title:"Finch's Ledger", family:"decision",
  employerNpcId:"marlo", employerFaction:"merchants",
  description:"Finch owes Marlo for two seasons of stall credit and has stopped answering his door. Marlo wants the debt collected — method negotiable, results not.",
  paymentRange:[60,90], timeCost:1, risk:"medium", cooldown:5, repeatable:false,
  requirements:{ rep:{fame:1} },
  tags:["debt","collection"], paymentDispute:{chance:0.25}, journalType:"contractDone",
  approaches:[
    { id:"leanon", label:"Lean on him", skill:null, repStat:"fear", mod:5,
      description:"Fear opens doors that knocking doesn't.",
      successEffects:{ npcRelationships:{finch:-2}, rep:{fear:1} } },
    { id:"talk", label:"Talk it through", skill:null, repStat:"respect", mod:0,
      description:"Finch is drowning, not hiding. Maybe there's a number he can actually pay.",
      successEffects:{ npcRelationships:{finch:1}, historyFlags:{ set:["finchGrateful"] } } },
    { id:"fixrig", label:"Fix his hauler", skill:"mechanics", mod:5,
      description:"Finch's hauler is dead, which is why Finch is broke. Fix the cause, collect the symptom.",
      successEffects:{ npcRelationships:{finch:2}, factions:{civilians:1},
        historyFlags:{ set:["finchGrateful","finchHaulerFixed"] } } },
  ],
  successEffects:{ factions:{merchants:1}, npcRelationships:{marlo:1} },
  failureEffects:{ factions:{merchants:-1},
    journal:{type:"contractNote", data:{text:"Finch's door stayed shut and his debt stayed his. Marlo's opinion of the arrangement was audible from the street."}} } },

/* ---------------- knowledge contract ---------------------------------- */
{ id:"c.mechquiz", title:"Tune-Up Day at Weld's", family:"knowledge",
  employerNpcId:"weld", employerFaction:"mechanics",
  description:"Weld pays a sharp eye to help triage the bay on tune-up day: what's scrap, what's salvage, and why the depot's pumps keep dying. Three calls, ten scrap a piece, bonus for a clean sweep.",
  paymentRange:[0,40], timeCost:0, risk:"low", cooldown:1, repeatable:true,
  tags:["mechanics","knowledge","pumps"], journalType:"knowledge",
  questions:[
    { id:"q.chips", text:"First bin: armor plate pulled off last night's bouts. Which plates are worthless?",
      options:[
        "The chipped ones — Gravel Sea armor is ablative; once it chips, it's scrap",
        "The front plates — those always get replaced anyway",
        "None of them — plate hammers back true between bouts" ],
      correct:0 },
    { id:"q.heat", text:"A customer's Howler Turbine keeps cooking itself mid-fight. Cheapest real fix?",
      options:[
        "Swap in a bigger turbine and hope",
        "Fit a Coolant Loop — two extra heat a turn is the difference",
        "Tell them to fire one gun less and live with it" ],
      correct:1 },
    { id:"q.pumps", text:"The depot's eastern pumps keep seizing and nobody knows why. Weld looks at you. Do you?",
      options:[
        "Sand in the intake filters — happens every season",
        "The crews run them too slow and they gum up",
        "They're being fed high-octane blend those old seals can't tolerate" ],
      correct:2, rumorHint:"rum.pumps" },
  ],
  successEffects:{ factions:{mechanics:1}, npcRelationships:{weld:1} } },

/* ---------------- reflex contract ------------------------------------- */
{ id:"c.pest", title:"Pest Control at the Grain Cage", family:"reflex",
  employerNpcId:"finch", employerFaction:"civilians",
  description:"Something with too many legs and no fear is in the granary cage again. Finch pays by the pest. Bring reflexes.",
  paymentRange:[0,60], timeCost:0, risk:"low", cooldown:1, repeatable:true,
  tags:["pests","reflex","granary"], journalType:"reflex",
  reflex:{ targets:6, zones:["top","middle","bottom"], payPerHit:10, windowMs:1900 },
  successEffects:{ factions:{civilians:1} } },
];

/* ---------------- structured rumors ------------------------------------
   Reliability is INTERNAL: accurate|incomplete|exaggerated|outdated|
   mistaken|planted. REMEMBER surfaces what was heard, never truth. */
export const RUMORS = [
  { id:"rum.pumps",
    text:"Old Marek swears the depot's eastern pumps keep seizing because they're fed high-octane blend their seals were never built for.",
    sourceNpcId:"marek", sourceDisplayName:"Old Marek", location:"The Slag Bar",
    relatedJobTags:["mechanics","pumps"], relatedNpcIds:["weld"], relatedFaction:"mechanics",
    reliability:"accurate",
    hintText:"Old Marek said the eastern pumps can't tolerate high-octane fuel.",
    signal:"Marek taps the bar. \"I'd remember that if I were you. Could make you some scrap.\"" },
  { id:"rum.stall",
    text:"The quick-hand crews working the market scatter the moment anyone dangerous-looking just STANDS at a stall. They don't test muscle they can see.",
    sourceNpcId:null, sourceDisplayName:"A stall runner", location:"The Slag Bar",
    relatedJobTags:["market","guard","thieves"], relatedNpcIds:["marlo"], relatedFaction:"merchants",
    reliability:"accurate",
    hintText:"The stall thieves spook at visible muscle. Just standing there, looking dangerous, works.",
    signal:"\"Keep that upstairs. Somebody might pay for knowing it.\"" },
  { id:"rum.floor",
    text:"Finch? Broke, my whole rusted axle. They say he keeps a season's worth of scrap under his floorboards.",
    sourceNpcId:null, sourceDisplayName:"A gin-soaked scrapper", location:"The Slag Bar",
    relatedJobTags:["debt","collection"], relatedNpcIds:["finch"], relatedFaction:null,
    reliability:"planted",
    hintText:"Somebody claimed Finch hides a season of scrap under his floorboards. Somebody also drinks a lot.",
    signal:null },
  { id:"rum.flamingo",
    text:"If Bubba BigRig ever stops you on the road, ask him about flamingos. Don't ask why. Just ask him about flamingos.",
    sourceNpcId:null, sourceDisplayName:"A scarred courier", location:"The Slag Bar",
    relatedJobTags:["bubba"], relatedNpcIds:["bubba"], relatedEncounterTags:["enc.bubba"], relatedFaction:"raiders",
    reliability:"accurate",
    hintText:"Ask Bubba BigRig about flamingos. The courier was dead serious.",
    signal:"The courier grabs your sleeve. \"I'd remember that one. It's worth more than it sounds.\"" },
];

/* ---------------- payment-dispute tuning --------------------------------
   Truth state is generated ONCE, persisted, hidden from the player.
   Assets scale from the promised payment — an employer can never be
   frightened into producing money that does not exist. */
export const DISPUTE_TRUTHS = [
  { id:"broke",   weight:3, cash:[0.10,0.25], hidden:[0,0],       future:[0.2,0.4] },
  { id:"partial", weight:3, cash:[0.40,0.60], hidden:[0,0.20],    future:[0.3,0.5] },
  { id:"hiding",  weight:2, cash:[0.20,0.40], hidden:[0.40,0.70], future:[0.2,0.4] },
  { id:"lying",   weight:2, cash:[0.10,0.20], hidden:[0.70,0.90], future:[0.1,0.3] },
];
export const DISPUTE_WITNESS = {           // witnessRisk by employer faction
  merchants:"high", militia:"high", mechanics:"medium",
  civilians:"low", scavengers:"low", gangs:"none", raiders:"none",
};

/* ---------------- Bubba BigRig future-encounter fixture ----------------
   DISABLED content: the road encounter engine does not exist yet
   (Slice 3). This fixture proves the rumor->encounter data path and is
   exercised only by tests. */
export const FUTURE_ENCOUNTERS = [
  { id:"enc.bubba", enabled:false, npc:"bubba", tags:["bubba","toll","road"],
    options:[
      { id:"fight", label:"Fight" }, { id:"flee", label:"Flee" },
      { id:"bluff", label:"Bluff" }, { id:"paytoll", label:"Pay the toll" } ],
    special:{ id:"flamingos", label:"ASK ABOUT FLAMINGOS",
      requiresRumor:"rum.flamingo", avoidsCombat:true, recallBonus:10,
      narrative:[
        "\"Hey. You know anything about flamingos?\"",
        "Bubba BigRig's hand comes off his cannon like it burned him. \"Nobody shoot,\" he bellows. \"NOBODY SHOOT. I gotta talk to this one.\"",
        "You end up side by side on a slab of broken overpass, watching the hills go ember-red, while Bubba talks about flamingos for the better part of an hour. He saw them once, as a kid, at a zoo that doesn't exist anymore. Pink like nothing else the world made. He says even blood reminds him of them, which explains something about Bubba you decide not to examine.",
        "His crew waves you through. Nobody has ever paid the toll in flamingo talk before." ],
      recallLine:"\"Nobody ever remembers that shit,\" Bubba says, genuinely moved, and presses ten scrap into your hand like a communion coin." } },
];
