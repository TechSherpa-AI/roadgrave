/* data-dialogue.js — ALL reactive lines. Pure content: add lines here
   without touching game logic. See docs/ARCHITECTURE.md §4 for fields.

   Entry fields (all optional except id, ctx, text):
     id            unique string
     ctx           context key the engine is asked for
     speaker       npc id — restricts to that speaker
     personality   [tags] — any tag must appear in speaker's personalityTags
     minLosses / maxLosses   speaker's lossesToPlayer (rival memory)
     minStreak     player's current win streak
     minTier / maxTier       crowd fame tier index 0..4
                             (0 unknown, 1 emerging, 2 established, 3 famous, 4 legend)
     minFear / minPopularity / minRespect
     appearance    {category:optionId} — player appearance must match
     requiredFlags / excludedFlags   [keys] in G.history
     once          memory-flag key: fires at most once per NPC (or globally if no speaker)
     weight        selection weight (default 1)
     effects       declared consequences applied when the line fires:
                   { rep:{popularity:1}, factions:{militia:1},
                     setFlags:["key"], incFlags:{key:1}, npcRelationship:1 }
                   Consequences live HERE, on the entry — game code never
                   infers effects from line wording.
*/
export const LINES = [

/* ================= CRUCIBLE RIVALS — TAUNTS (they hit you) ============ */
// Odo — desperate. Starts apologetic, gets shrill after losing to you.
{ id:"odo.t1", ctx:"crucibleTaunt", speaker:"odo", maxLosses:0, text:"Odo whoops: \"That one's for my landlord!\"" },
{ id:"odo.t2", ctx:"crucibleTaunt", speaker:"odo", maxLosses:0, text:"\"Stay still!\" Odo shouts over the engines. \"It's quicker if you stay still!\"" },
{ id:"odo.t3", ctx:"crucibleTaunt", speaker:"odo", minLosses:1, text:"\"Not this time!\" Odo's voice cracks on 'time'. \"NOT this time!\"" },
{ id:"odo.t4", ctx:"crucibleTaunt", speaker:"odo", minLosses:2, text:"Odo, ragged: \"You already took everything else! Leave me the purse!\"" },
{ id:"odo.t5", ctx:"crucibleTaunt", speaker:"odo", minLosses:3, text:"Odo screams something wordless. The desperation has stopped being funny." },

// Kess — greedy. Money talk that curdles as the losses stack.
{ id:"kess.t1", ctx:"crucibleTaunt", speaker:"kess", maxLosses:0, text:"\"Hold still,\" Kess says, flat over the loudspeaker crackle. \"You're damaging my property.\"" },
{ id:"kess.t2", ctx:"crucibleTaunt", speaker:"kess", maxLosses:0, text:"Kess: \"Every dent you take comes off my resale.\"" },
{ id:"kess.t3", ctx:"crucibleTaunt", speaker:"kess", minLosses:1, text:"\"Last time cost me a season's margin,\" Kess says. \"I'm collecting. With interest.\"" },
{ id:"kess.t4", ctx:"crucibleTaunt", speaker:"kess", minLosses:2, text:"Kess, cold: \"You think you can keep on winning? Not happening. I've priced your wreck already.\"" },
{ id:"kess.t5", ctx:"crucibleTaunt", speaker:"kess", minLosses:3, text:"\"Forget the purse,\" Kess says quietly. Somewhere she stopped doing arithmetic. \"Forget the parts. This is personal inventory now.\"" },

// Bruna — honorable/ambitious. Counts hits; earns her rage slowly.
{ id:"bruna.t1", ctx:"crucibleTaunt", speaker:"bruna", maxLosses:0, text:"Bruna, calm over the loudspeaker: \"First hit.\"" },
{ id:"bruna.t2", ctx:"crucibleTaunt", speaker:"bruna", maxLosses:0, text:"\"Second hit,\" Bruna counts, and the crowd counts with her." },
{ id:"bruna.t3", ctx:"crucibleTaunt", speaker:"bruna", maxLosses:0, text:"The Drayhulk fills your mirrors like a building falling." },
{ id:"bruna.t4", ctx:"crucibleTaunt", speaker:"bruna", minLosses:1, text:"\"That belt you wear was mine,\" Bruna says. \"I'm not angry. I'm correcting the record.\"" },
{ id:"bruna.t5", ctx:"crucibleTaunt", speaker:"bruna", minLosses:2, text:"Bruna: \"Twice was luck. That was a lucky win. This is the REMATCH.\"" },
{ id:"bruna.t6", ctx:"crucibleTaunt", speaker:"bruna", minLosses:3, text:"No counting today. Bruna fights silent, and silence from her is the loudest thing in the pit." },

// Grix Redline — bloodthirsty (future gang rival; fires for any bloodthirsty speaker)
{ id:"blood.t1", ctx:"crucibleTaunt", personality:["bloodthirsty","sadistic"], text:"\"Forget the purse!\" comes the howl. \"I do this for the blood and the pain!\"" },
{ id:"blood.t2", ctx:"crucibleTaunt", personality:["bloodthirsty"], text:"\"Going to take your ass DOWN!\" The laugh after it is worse than the words." },
{ id:"blood.t3", ctx:"crucibleTaunt", personality:["bloodthirsty"], minLosses:2, text:"\"Every time you beat me you make me something worse. Thank you. THANK you.\"" },

// Appearance jabs — rare spice, any rival
{ id:"jab.mohawk", ctx:"crucibleTaunt", appearance:{hair:"mohawk"}, weight:0.4, text:"\"Nice mohawk. I'll scrape it off the windshield later.\"" },
{ id:"jab.muscle", ctx:"crucibleTaunt", appearance:{build:"muscular"}, weight:0.4, text:"\"All that muscle and you still hide behind armor plate?\"" },
{ id:"jab.damaged", ctx:"crucibleTaunt", appearance:{face:"damaged"}, weight:0.4, text:"\"Whoever rearranged your face — I'll finish the job free.\"" },

/* ================= CRUCIBLE RIVALS — PAIN (you penetrate) ============= */
{ id:"odo.p1", ctx:"cruciblePain", speaker:"odo", text:"Odo's voice cracks over the din: \"Okay. Okay okay okay—\"" },
{ id:"odo.p2", ctx:"cruciblePain", speaker:"odo", text:"Something tears loose off the Skiff. Odo stops singing." },
{ id:"kess.p1", ctx:"cruciblePain", speaker:"kess", text:"Kess goes quiet. Somehow that's worse than shouting." },
{ id:"kess.p2", ctx:"cruciblePain", speaker:"kess", text:"\"That,\" Kess says tonelessly, \"was expensive.\"" },
{ id:"bruna.p1", ctx:"cruciblePain", speaker:"bruna", text:"A sound moves through the crowd like weather turning — Bruna Halfaxe just got hurt." },
{ id:"bruna.p2", ctx:"cruciblePain", speaker:"bruna", text:"Bruna laughs, loud and real. \"THERE you are! Finally — a bout!\"" },
{ id:"blood.p1", ctx:"cruciblePain", personality:["bloodthirsty"], text:"They're laughing. You just tore steel off their rig and they're LAUGHING." },

/* ================= RIVALS — BEATEN / VICTOR =========================== */
{ id:"odo.b1", ctx:"crucibleBeaten", speaker:"odo", maxLosses:0, text:"Odo climbs out with his hands up, grinning through a split lip. \"Worth it,\" he calls. \"Almost.\"" },
{ id:"odo.b2", ctx:"crucibleBeaten", speaker:"odo", minLosses:1, text:"Odo doesn't climb out for a long moment. When he does, he doesn't look at the crowd, or at you." },
{ id:"odo.b3", ctx:"crucibleBeaten", speaker:"odo", minLosses:3, text:"Odo sits on his dead rig's hood and, to everyone's surprise, salutes you. \"Teach me sometime,\" he calls. \"I'll work for food.\"" },
{ id:"kess.b1", ctx:"crucibleBeaten", speaker:"kess", maxLosses:0, text:"Kess steps out before her wreck stops smoking and studies it, already itemizing the loss. She spares you exactly one look: \"Decent work. I'd have kept your plant.\"" },
{ id:"kess.b2", ctx:"crucibleBeaten", speaker:"kess", minLosses:1, text:"Kess kicks her dead Courser once — the first uncalculated thing you've ever seen her do." },
{ id:"kess.b3", ctx:"crucibleBeaten", speaker:"kess", minLosses:3, text:"\"Name your price,\" Kess says through the window, before the tow crew even arrives. \"For lessons. Everything has a price. Apparently including me.\"" },
{ id:"bruna.b1", ctx:"crucibleBeaten", speaker:"bruna", maxLosses:0, text:"The Drayhulk shudders, sags, and dies. In the sudden quiet you hear one pair of hands clapping, slow and steady: Bruna's, from inside the wreck. \"Good bout,\" she calls. \"Champion.\"" },
{ id:"bruna.b2", ctx:"crucibleBeaten", speaker:"bruna", minLosses:1, text:"Bruna steps out, pulls off a gauntlet, and offers you her bare hand through the window. The crowd doesn't know which name to chant." },
{ id:"odo.v1", ctx:"crucibleVictor", speaker:"odo", text:"Odo circles your wreck once, almost apologetic. \"Told you,\" he says. \"Gotta eat.\"" },
{ id:"kess.v1", ctx:"crucibleVictor", speaker:"kess", text:"Kess is already walking your wreck with a grease pencil, marking what she'll keep." },
{ id:"bruna.v1", ctx:"crucibleVictor", speaker:"bruna", text:"Bruna idles beside your wreck a long moment. \"Third hit,\" she says, and the crowd takes up her name in hammer-time." },

/* ================= CROWD — ENTRANCE (bout start, by fame tier) ======== */
{ id:"ent.u1", ctx:"crowdEntrance", maxTier:0, text:"Nobody chants for you. Somebody near the gate is taking bets on how long you last — the long odds are unkind." },
{ id:"ent.u2", ctx:"crowdEntrance", maxTier:0, text:"A vendor glances at your rig and doesn't bother learning your name." },
{ id:"ent.e1", ctx:"crowdEntrance", minTier:1, maxTier:1, text:"Somewhere in the stands, one voice knows your name. It sounds strange, shouted." },
{ id:"ent.e2", ctx:"crowdEntrance", minTier:1, maxTier:1, text:"\"That's the one from the qualifiers,\" someone says. \"Watch the front gun.\"" },
{ id:"ent.s1", ctx:"crowdEntrance", minTier:2, maxTier:2, text:"The crowd splits at your entrance — half cheering, half booing, all betting." },
{ id:"ent.s2", ctx:"crowdEntrance", minTier:2, maxTier:2, text:"\"Came up from NOTHING!\" someone bellows from the cheap rail. \"From the bottom of the slag heap! One of OURS!\"" },
{ id:"ent.f1", ctx:"crowdEntrance", minTier:3, maxTier:3, text:"A whole section wears your colors now. Where did they even get your colors?" },
{ id:"ent.f2", ctx:"crowdEntrance", minTier:3, maxTier:3, text:"They chant your name before your wheels touch the pit floor. The champion's supporters chant louder, to drown it. They fail." },
{ id:"ent.l1", ctx:"crowdEntrance", minTier:4, text:"You roll in and the Crucible ROARS — no name, no words, just the sound ten thousand people make when the legend shows up in person." },
{ id:"ent.l2", ctx:"crowdEntrance", minTier:4, text:"Parents lift kids onto shoulders as you pass the gate. Remember when nobody here would learn your name?" },

/* ================= CROWD — AMBIENT (mid-fight, by fame tier) ========== */
{ id:"amb.u1", ctx:"crowdAmbient", maxTier:1, text:"The bleachers move like water — ten thousand people leaning with every turn." },
{ id:"amb.u2", ctx:"crowdAmbient", maxTier:1, text:"A vendor's cry cuts the din: char-corn, hot slag, fresh odds on the underdog." },
{ id:"amb.u3", ctx:"crowdAmbient", maxTier:1, text:"\"Fresh meat's still rolling!\" someone shouts, halfway between mockery and surprise." },
{ id:"amb.s1", ctx:"crowdAmbient", minTier:2, text:"A drum crew in the stands has picked up your engine's rhythm. They're keeping time with YOU." },
{ id:"amb.s2", ctx:"crowdAmbient", minTier:2, text:"\"Slag-heap kid's still in it!\" The cheer that answers is bigger than last season's." },
{ id:"amb.f1", ctx:"crowdAmbient", minTier:3, text:"Grinder-spit rains from the rails — the crowd throws sparks when their favorite runs hot." },
{ id:"amb.f2", ctx:"crowdAmbient", minTier:4, text:"For a moment the whole Crucible holds its breath with you. All of it. At once." },

/* ================= CROWD — WIN REACTION (by fame tier) ================ */
{ id:"cw.u1", ctx:"crowdWin", maxTier:0, text:"The crowd blinks. Then somebody laughs — the good kind — and the bets start paying out at long odds." },
{ id:"cw.e1", ctx:"crowdWin", minTier:1, maxTier:1, text:"More of them know your name on the way out than knew it on the way in." },
{ id:"cw.s1", ctx:"crowdWin", minTier:2, maxTier:2, text:"\"From the BOTTOM!\" the cheap rail howls. \"Slag heap to the pit floor! That's one of ours!\"" },
{ id:"cw.f1", ctx:"crowdWin", minTier:3, maxTier:3, text:"Your supporters come over the rail. The militia lets them. Even the militia is grinning." },
{ id:"cw.l1", ctx:"crowdWin", minTier:4, text:"They'll tell people they were here tonight. Years from now, more people will claim they were here than the Crucible holds." },

/* ================= CROWD — LOSS REACTION (by fame tier) =============== */
{ id:"cl.u1", ctx:"crowdLoss", maxTier:0, text:"\"Come back when you learn to drive!\" The whole rail takes it up. Laughter follows the tow chain." },
{ id:"cl.u2", ctx:"crowdLoss", maxTier:0, text:"\"Get some brains before you die, kid!\" someone yells, not unkindly. Almost advice." },
{ id:"cl.u3", ctx:"crowdLoss", maxTier:0, text:"Nobody boos. Booing takes caring. They're already watching the gate for the next bout." },
{ id:"cl.e1", ctx:"crowdLoss", minTier:1, maxTier:1, text:"A few voices actually groan for you. Progress, of a sort." },
{ id:"cl.s1", ctx:"crowdLoss", minTier:2, maxTier:2, text:"The detractors crow. But listen — under it — your people are chanting 'NEXT BOUT. NEXT BOUT.'" },
{ id:"cl.f1", ctx:"crowdLoss", minTier:3, text:"Someone throws garbage; three someones throw the garbage-thrower over the rail. Your crowd polices its own now." },
{ id:"cl.l1", ctx:"crowdLoss", minTier:4, text:"Legends are allowed to bleed. Half the Crucible is silent; the other half sings your name like a hymn at a wake." },

/* ================= TOWN AMBIENT EVENTS ================================ */
// recognition / praise
{ id:"town.rec1", ctx:"townEvent", minTier:1, effects:{rep:{popularity:1}}, text:"A dock worker double-takes at you. \"You're the one from the Crucible. Knew it. Shake my hand — nobody'll believe me otherwise.\"" },
{ id:"town.rec2", ctx:"townEvent", minTier:2, text:"Two kids run past re-enacting your last bout. The one playing you refuses to trade roles." },
{ id:"town.rec3", ctx:"townEvent", minTier:2, once:"townFanSpouse", effects:{rep:{popularity:1}}, text:"A fan plants themselves in your path, beaming, and gestures at their startled spouse. \"Kiss 'em! One kiss! It's our anniversary!\"" },
{ id:"town.rec4", ctx:"townEvent", minTier:3, text:"Someone's chalked your rig — recognizably YOUR rig — on the water-tower. The militia hasn't scrubbed it off. That's a statement." },
// business
{ id:"town.biz1", ctx:"townEvent", minTier:2, text:"A merchant flags you down. \"Loved that last Crucible run. Five caps off your first purchase... next year.\"" },
{ id:"town.biz2", ctx:"townEvent", minTier:3, text:"A parts dealer offers to name a sale after you. \"The Champion's Clearance. You get nothing, of course. But it's an honor.\"" },
// mockery
{ id:"town.mock1", ctx:"townEvent", maxTier:0, text:"A gate guard squints at your rig, then at you. \"Towing fees are up front, friend.\"" },
{ id:"town.mock2", ctx:"townEvent", maxTier:1, requiredFlags:["lostAnyBout"], text:"\"Hey, it's the tow-chain special!\" The scrap-pickers cackle. Word of a loss travels faster than a convoy here." },
// threat / fear
{ id:"town.fear1", ctx:"townEvent", minFear:3, text:"A conversation dies as you pass. Every eye finds somewhere else to be. The silence follows you a full block." },
{ id:"town.fear2", ctx:"townEvent", minFear:5, text:"A merchant refuses your scrap. \"On the house. Please.\" It isn't generosity. It's insurance." },
// begging / comedy
{ id:"town.beg1", ctx:"townEvent", minTier:2, effects:{rep:{popularity:1}}, text:"A man with an engine block in a wheelbarrow begs you to autograph it. It's not even a make you've driven." },
{ id:"town.com1", ctx:"townEvent", text:"Somebody's goat is loose in the scrap lanes again. The militia sergeant chasing it pretends not to see you seeing him." },
{ id:"town.com2", ctx:"townEvent", text:"A street preacher of the Last Green blesses your tires — \"the meek shall inherit the road\" — then asks for a lift nowhere in particular." },
// recruitment tease (companions later)
{ id:"town.rct1", ctx:"townEvent", minTier:2, text:"A mechanic with grease to the elbows watches you pass. \"Whoever tunes your rig is wasting your money,\" they call. \"Just saying.\"" },

/* ================= SLAG BAR ============================================ */
{ id:"bar.look1", ctx:"barEvent", minTier:2, once:"barAdmirer", effects:{setFlags:["barAdmirerSeen"]}, text:"Someone across the room keeps looking at you. Not hostile. The other thing." },
{ id:"bar.look2", ctx:"barEvent", minTier:2, requiredFlags:["barAdmirerSeen"], text:"The one who kept looking finally walks over. \"I saw you crushing cars in the Crucible. Want to find somewhere quieter?\"" },
{ id:"bar.tale1", ctx:"barEvent", minTier:3, text:"Someone at the rail is telling your qualifier story to a stranger. The story has grown a second rocket pod and a heroic fire." },
{ id:"bar.tale2", ctx:"barEvent", maxTier:1, text:"The bar talk is all Bruna. Three seasons. Nobody's betting against her — yet." },

/* rumors (drink-bought) */
{ id:"rum1", ctx:"barRumor", text:"\"The Meridian Collection took Harrow's Gate off the toll map. Nobody says where the tithe convoys go.\"" },
{ id:"rum2", ctx:"barRumor", text:"\"Combine buyers pay double for intact power plants. Triple if you don't ask where they're bound.\"" },
{ id:"rum3", ctx:"barRumor", text:"\"There's a wreck field north of the causeway where the tow crews won't go. Draw your own conclusions.\"" },
{ id:"rum4", ctx:"barRumor", text:"\"Crucible champion two seasons back? Drives courier now. Says the road pays better than glory.\"" },
{ id:"rum5", ctx:"barRumor", text:"\"Zealots of the Last Green bless any rig that hauls seed stock. Blessings stop bullets now, apparently.\"" },
{ id:"rum6", ctx:"barRumor", text:"\"They say the Collection's flagship is a refinery on treads. They say you hear it before the horizon shows it.\"" },
];
