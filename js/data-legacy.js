/* data-legacy.js — legacy archetype table. Evaluated top to bottom within
   each band; first predicate match wins. `c`=career, `r`=rep, `h`=history.
   Performance (1-100) and archetype are SEPARATE: performance measures how
   effectively the career was played, archetype classifies what it was. */

export const ARCHETYPES = {
  /* high band: performance >= 70 */
  high: [
    { id:"warlord", name:"WARLORD OF THE WASTES",
      test:(c,r,h)=> r.fear>=8 && c.killed>=5,
      text:"You dominated the region the old way: violence, fear, and other people's misery. Convoys pay you not to exist. Mothers use your name to make children behave. It works." },
    { id:"marshal", name:"MARSHAL OF KETTLE ROCK",
      test:(c,r,h)=> r.factions.militia>=6 && r.respect>=8 && r.fear<8,
      text:"You built something rarer than victory: order. The militia answers to you, the roads are safer than they've been in a generation, and the sergeant who once nodded at a rookie now takes your orders." },
    { id:"immortal", name:"CRUCIBLE IMMORTAL",
      test:(c,r,h)=> c.championships>=3,
      text:"Your name is burned so deep into the Crucible's gate they'll have to melt the gate to lose it. Children are named after your rig. The pit master retired; your legend didn't." },
    { id:"roadbaron", name:"ROAD BARON",
      test:(c,r,h)=> c.scrapEarned>=3000 && c.contractsDone>=5,
      text:"Every convoy on the spine pays your rates, drives your routes, burns your fuel. You never wore a crown. You wrote invoices instead." },
    { id:"merchprince", name:"MERCHANT PRINCE",
      test:(c,r,h)=> r.factions.merchants>=6 && c.scrapEarned>=2000,
      text:"The market men call you one of their own now, which is the closest thing to love they're capable of. Half of Kettle Rock's shelves are stocked because you kept the roads open." },
    { id:"champion", name:"CHAMPION OF THE CRUCIBLE",
      test:(c,r,h)=> c.championships>=1,
      text:"You took the title from Bruna Halfaxe and the crowd never went home disappointed again. The tin axes the kids wear carry your sigil. That was the whole dream, and you drove it down." },
    { id:"respectedgun", name:"RESPECTED GUN",
      test:()=>true,
      text:"Not a king, not a monster — a professional. When work had to go right, people said your name first, and they said it with respect." },
  ],
  /* middle band: 35-69 */
  mid: [
    { id:"mastermech", name:"MASTER MECHANIC",
      test:(c,r,h)=> r.factions.mechanics>=4 || (h.majorRepairsTotal||0)>=6,
      text:"The fights faded; the craft stayed. Your bay at the garage has a waiting list a season long, and drivers pay double for your torch-work. The wrench outlasted the gun." },
    { id:"garageowner", name:"GARAGE OWNER",
      test:(c,r,h)=> c.scrapEarned>=1200,
      text:"You bought the garage you once worked shifts in. The pay's steady, the coffee's terrible, and nobody shoots at you anymore — mostly." },
    { id:"regular", name:"KETTLE ROCK REGULAR",
      test:(c,r,h)=> r.popularity>=4,
      text:"Every town needs its almost-heroes. You've got a stool at the Slag Bar, a story for every scar, and rounds you rarely pay for. There are worse retirements. Most of them, in fact." },
    { id:"fixture", name:"SLAG BAR FIXTURE",
      test:()=>true,
      text:"You know the Slag Bar's taps better than your own rig. The stories get bigger every season; the tabs get longer. Nobody checks the math on either." },
  ],
  /* failure band: < 35 — increasingly ridiculous, deliberately fun to find */
  fail: [
    { id:"failedmerc", name:"FAILED MERCENARY",
      test:(c,r,h)=> c.crucibleLosses>=3 && c.crucibleWins>=1,
      text:"You had exactly one good bout in you, and you spent it early. The rest was tow chains. Recruiters still use your posters — as a warning about insurance." },
    { id:"scrappicker", name:"SCRAP PICKER",
      test:(c,r,h)=> c.scrapEarned<400,
      text:"The Gravel Sea takes most people whole. It took you in installments. You know every wreck field on the spine now — from the inside, on foot, with a magnet on a stick." },
    { id:"corpselooter", name:"CORPSE LOOTER",
      test:(c,r,h)=> r.factions.scavengers>=2,
      text:"You follow the bouts you once fought in, waiting for the tow crews to miss something. They usually don't. You usually check anyway." },
    { id:"warningsign", name:"HUMAN WARNING SIGN",
      test:(c,r,h)=> c.crucibleLosses>=5,
      text:"The militia pays you four scrap a day to stand at the city gate and show new drivers your face. \"This,\" the sergeant says, \"is what confidence does.\" It's honest work." },
    { id:"janitor", name:"CRUCIBLE JANITOR",
      test:(c,r,h)=> c.crucibleWins===0 && c.crucibleLosses>=1,
      text:"You never left the Crucible. Technically. You sweep it now — the slag, the shell casings, the pieces of drivers who were exactly as good as you were." },
    { id:"toothcollector", name:"CRUCIBLE TOOTH COLLECTOR",
      test:()=>true,
      text:"The apocalypse won. You walk the pit after bouts with a bucket and a magnet, collecting what the crowd knocks loose. Teeth, mostly. You've learned which sections spit the most. It's a living. Nobody said whose." },
  ],
};
