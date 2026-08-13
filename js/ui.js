/* ui.js — screens + input wiring. The only gameplay module that touches
   the DOM. Game logic lives in world/vehicles/combat/dialogue/legacy. */

import { G, setG, newGame, seedRng, save, hasSave, eraseSave, exportSave, importSave,
         logMsg, bus, BUILD, LS } from "./core.js";
import { DATA, byId } from "./data.js";
import * as W from "./world.js";
import * as V from "./vehicles.js";
import * as C from "./combat.js";
import { evaluate } from "./legacy.js";
import { GOLDEN } from "./golden.js";

/* ---- render machinery ------------------------------------------------- */
export function setScreen(name){ G.screen = name; save(); render(); }
bus.on("screen", setScreen);

export function el(html){ const d=document.createElement("div"); d.innerHTML=html; return d.firstElementChild; }
export function esc(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

export function render(){
  const app = document.getElementById("app");
  app.innerHTML = "";
  const screen = SCREENS[G ? G.screen : "title"] || SCREENS.title;
  try{ screen(app); }catch(e){ console.error("screen render failed:", G.screen, e); app.appendChild(el(`<main><p class="warn">Screen error — see console.</p><button data-act="go" data-to="title">Title</button></main>`)); }
  window.scrollTo(0,0);
}
function headerBar(){
  const city = byId(DATA.cities, G.world.location);
  return el(`<header>
    <span class="t">ROADGRAVE</span>
    <span class="stat">${city?city.name:"—"} · Day <b>${G.world.day}</b> · ${W.TIER_NAMES[W.fameTier()]}<br><b>${G.scrap}</b> scrap · Fuel <b>${G.world.fuel}</b></span>
  </header>`);
}
function hero(name){ return `<img class="hero" src="img/${name}.jpg" alt="" onerror="this.remove()">`; }
function backBtn(to){ return `<button class="small" data-act="go" data-to="${to||"hub"}">Back</button>`; }
function chassisArt(v){
  const armored = V.armorPts(v)>=8;
  return hero(`chassis-${v.chassis}${armored?"-armored":""}`);
}
export function devMode(){ return LS.getItem("roadgrave.dev")==="1"; }

/* ---- central tap dispatcher ------------------------------------------- */
export const ACTIONS = {};
document.addEventListener("click", e=>{
  const t = e.target.closest("[data-act]");
  if(!t || t.disabled) return;
  const fn = ACTIONS[t.dataset.act];
  if(fn){ fn(t.dataset, t); save(); }
});
ACTIONS.go = d => {
  if(d.to==="bar") W.maybeTownEvent(0.5, "barEvent");
  if(d.to==="hub" && G.player.created) W.maybeTownEvent(0.25, "townEvent");
  setScreen(d.to);
};

/* ---- creation --------------------------------------------------------- */
const CREATE_POOL = 8, SKILL_MAX = 4;
let draft = null;
function newDraft(){
  const app = {};
  DATA.appearance.forEach(cat=>{ app[cat.id] = cat.opts[Math.floor(Math.random()*3)].id; });
  return { name:"", skills:{driving:0,gunnery:0,mechanics:0,scrounge:0}, appearance:app };
}
function draftPointsLeft(){
  return CREATE_POOL - DATA.skills.reduce((a,s)=>a+draft.skills[s.id],0);
}
ACTIONS.skillMod = d => {
  const v = draft.skills[d.skill] + (+d.delta);
  if(v<0 || v>SKILL_MAX) return;
  if(+d.delta>0 && draftPointsLeft()<=0) return;
  draft.skills[d.skill] = v;
  render();
};
ACTIONS.appSet = d => { draft.appearance[d.cat] = d.opt; render(); };
ACTIONS.appRandom = () => { const n = newDraft(); draft.appearance = n.appearance; render(); };
ACTIONS.createDone = () => {
  const name = (document.getElementById("dname").value||"").trim();
  if(!name){ document.getElementById("cmsg").textContent = "Every driver needs a name."; return; }
  G.player.name = name;
  G.player.skills = draft.skills;
  G.player.appearance = draft.appearance;
  G.player.created = true;
  W.earn(100, "severance");
  W.addJournal("created", { name });
  logMsg(`${name} signs the refinery's severance ledger: 100 scrap and a handshake.`);
  logMsg("The Crucible posts open qualifiers. The garage smells like opportunity.");
  draft = null;
  setScreen("hub");
};

/* ---- garage / workshop / market wrappers ------------------------------ */
ACTIONS.buyChassis = d => { if(V.buyChassis(d.id)) setScreen("workshop"); };
ACTIONS.sellVehicle = () => {
  const v = V.vehicle(); if(!v) return;
  if(!confirm(`Sell ${v.name} back to the yard for ${V.sellVal(V.vInvested(v))} scrap?`)) return;
  V.sellVehicle(); render();
};
ACTIONS.renameVehicle = () => {
  const v = V.vehicle(); if(!v) return;
  const n = prompt("Name your rig:", v.name);
  if(n) { V.renameVehicle(n); render(); }
};
ACTIONS.setPlant   = d => { V.setPlant(d.id); render(); };
ACTIONS.armorMod   = d => { V.armorMod(d.f, +d.delta); render(); };
ACTIONS.buyWeapon  = d => { V.buyWeapon(d.id); render(); };
ACTIONS.sellWeapon = d => { V.sellWeapon(+d.i); render(); };
ACTIONS.faceWeapon = d => { V.faceWeapon(+d.i); render(); };
ACTIONS.buyGear    = d => { V.buyGear(d.id); render(); };
ACTIONS.sellGear   = d => { V.sellGear(+d.i); render(); };
ACTIONS.reload     = d => { V.reloadWeapon(+d.i); render(); };
ACTIONS.refill     = d => { V.refillGear(+d.i); render(); };
ACTIONS.repair     = () => { V.repairVehicle(); render(); };
ACTIONS.buyRes     = d => { W.buyResource(d.kind); render(); };
ACTIONS.workShift  = d => { W.workShift(d.id); render(); };
ACTIONS.rumor      = () => { W.buyRumor(); render(); };

/* ---- combat wrappers -------------------------------------------------- */
ACTIONS.startBout   = d => { C.startBout(d.id); };
ACTIONS.maneuver    = d => { C.playerManeuver(d.m); render(); };
ACTIONS.toggleCalled= () => { C.toggleCalled(); render(); };
ACTIONS.fire        = d => { C.playerFire(+d.i); render(); };
ACTIONS.endTurn     = () => { C.endTurn(); render(); };
ACTIONS.concede     = () => {
  if(!confirm("Concede the bout? You'll be towed out with a loss.")) return;
  C.concede(); render();
};
ACTIONS.fightDone   = () => { C.fightDone(); };

/* ---- retirement / legacy ---------------------------------------------- */
ACTIONS.retire = () => {
  if(!confirm("Retire? This ends the career — the Gravel Sea will judge it.")) return;
  G.campaign.flags.retired = true;
  const L = evaluate(G);
  W.addJournal("retired", { legacy:L.name });
  setScreen("legacy");
};
ACTIONS.newLegend = () => {
  eraseSave();
  const g = newGame(); setG(g); seedRng(g.meta.seed);
  setScreen("title");
};

/* ======================= SCREENS ======================================= */
export const SCREENS = {

  title(app){
    const m = el(`<main style="justify-content:flex-start; text-align:center; gap:14px; padding-top:0;">
      <div class="splashwrap">
        <img src="img/title.jpg" alt="" onerror="this.style.display='none'">
        <video src="img/RoadGrave.StartScreen.mp4" poster="img/title.jpg" autoplay muted loop playsinline
          onerror="this.remove()"></video>
        <div class="splashname"><h1>ROADGRAVE</h1></div>
      </div>
      <p class="flavor">Two hundred years after the Undertow, the Gravel Sea eats the careless.<br>
      Seven cities. One road. Your move.</p>
      <div id="btns" style="display:flex; flex-direction:column; gap:10px;"></div>
      <p class="dim">v${BUILD}</p>
    </main>`);
    const btns = m.querySelector("#btns");
    if(hasSave() && G && G.campaign.flags.started && !G.campaign.flags.dead){
      const label = G.player.created ? `${esc(G.player.name)} · Day ${G.world.day} · ${G.scrap} scrap` : `Day ${G.world.day}`;
      btns.appendChild(el(`<button class="primary" data-act="go" data-to="${G.player.created?"hub":"create"}">Continue<span class="sub">${label}</span></button>`));
    }
    const n = el(`<button>New Game<span class="sub">Start broke and carless in Kettle Rock</span></button>`);
    n.onclick = ()=>{
      if(hasSave() && G.campaign.flags.started && !confirm("Overwrite the existing save?")) return;
      const g = newGame(); setG(g); seedRng(g.meta.seed);
      G.campaign.flags.started = true;
      setScreen("create");
    };
    btns.appendChild(n);
    btns.appendChild(el(`<button data-act="go" data-to="settings">Settings &amp; Saves</button>`));
    app.appendChild(m);
  },

  create(app){
    if(!draft) draft = newDraft();
    const left = draftPointsLeft();
    const skillRows = DATA.skills.map(s=>`
      <div class="row">
        <div class="grow"><b>${s.name}</b> <span class="dim">${draft.skills[s.id]}</span><br>
          <span class="dim" style="font-size:13px">${s.desc}</span></div>
        <button class="mini" data-act="skillMod" data-skill="${s.id}" data-delta="-1" ${draft.skills[s.id]<=0?"disabled":""}>−</button>
        <button class="mini" data-act="skillMod" data-skill="${s.id}" data-delta="1" ${left<=0||draft.skills[s.id]>=SKILL_MAX?"disabled":""}>+</button>
      </div>`).join("");
    const appRows = DATA.appearance.map(cat=>`
      <div class="approw"><span class="applbl">${cat.name}</span>
        ${cat.opts.map(o=>`<button class="chip ${draft.appearance[cat.id]===o.id?"sel":""}" data-act="appSet" data-cat="${cat.id}" data-opt="${o.id}">${o.name}</button>`).join("")}
      </div>`).join("");
    const m = el(`<main>
      <h2>New Driver</h2>
      <p class="flavor">The refinery let you go with a handshake and a severance. The road doesn't care what your papers said.</p>
      <div class="panel">
        <input type="text" id="dname" placeholder="Driver name" maxlength="18" value="${esc(draft.name)}">
      </div>
      <h2>The face in the mirror</h2>
      <div class="panel" style="gap:6px">${appRows}
        <button class="small" data-act="appRandom">Roll the dice on looks</button>
        <p class="dim" style="font-size:13px">Looks are story, not stats. People will remember them.</p>
      </div>
      <h2>Skills — ${left} point${left===1?"":"s"} left</h2>
      <div class="panel">${skillRows}</div>
      <button class="primary" data-act="createDone">Hit the streets<span class="sub">Collect 100 scrap severance</span></button>
      <p class="msg err" id="cmsg"></p>
    </main>`);
    m.querySelector("#dname").addEventListener("input", e=>{ draft.name = e.target.value; });
    app.appendChild(m);
  },

  hub(app){
    if(!G.player.created){ setScreen("create"); return; }
    app.appendChild(headerBar());
    const v = V.vehicle();
    const carLine = v ? `${esc(v.name)} — ${V.roadworthy(v)?'<span class="good">road-worthy</span>':'<span class="warn">not road-worthy</span>'}`
                      : '<span class="warn">No vehicle. The yard has chassis for sale.</span>';
    const hotspots = DATA.mapHotspots.map(h=>`
      <button class="maphot" data-act="go" data-to="${h.screen}"
        style="left:${h.x}%; top:${h.y}%; width:${h.w}%; height:${h.h}%;"
        aria-label="${h.label}"></button>`).join("");
    const listBtns = DATA.mapHotspots.map(h=>`
      <button class="small" data-act="go" data-to="${h.screen}">${h.label}</button>`).join("");
    const m = el(`<main>
      <div class="mapwrap">
        <img src="img/city.jpg" alt="Kettle Rock" onerror="this.closest('.mapwrap').classList.add('noimg')">
        ${hotspots}
      </div>
      <div class="grid2" style="grid-template-columns:1fr 1fr 1fr;">${listBtns}</div>
      <div class="panel"><div class="kv"><span>Driver</span><b>${esc(G.player.name)}</b></div>
        <div class="kv"><span>Standing</span><span>${W.TIER_NAMES[W.fameTier()]} · ${G.career.streak?`streak ${G.career.streak}`:"no streak"}</span></div>
        <div class="kv"><span>Rig</span><span>${carLine}</span></div></div>
      <h2>Log</h2>
      <div class="panel">${(G.log.length?G.log.slice(-6):["(nothing yet)"]).map(t=>`<p class="dim">${esc(t)}</p>`).join("")}</div>
      <div class="row">
        <button class="small grow" data-act="go" data-to="journal">Journal</button>
        <button class="small grow" data-act="go" data-to="settings">Settings</button>
      </div>
    </main>`);
    app.appendChild(m);
  },

  garage(app){
    app.appendChild(headerBar());
    const v = V.vehicle();
    if(!v){
      const rows = DATA.chassis.map(ch=>`
        ${hero("chassis-"+ch.id)}
        <button data-act="buyChassis" data-id="${ch.id}" ${G.scrap<ch.cost?"disabled":""}>
          ${ch.name} — ${ch.cost} scrap
          <span class="sub">${ch.blurb}</span>
          <span class="sub">Frame ${ch.wt} wt · carries ${ch.maxGross} · ${ch.space} space · ${ch.mounts} mounts · handling ${ch.handling>=0?"+":""}${ch.handling} · hull ${ch.hull}</span>
        </button>`).join("");
      app.appendChild(el(`<main>
        ${hero("garage")}
        <h2>The Yard — pick a chassis</h2>
        <p class="flavor">Rows of frames under tarps. The yard boss quotes prices without looking up.</p>
        ${rows}
        ${backBtn()}
      </main>`));
      return;
    }
    const s = V.vStats(v);
    const h = v.history;
    const wpns = v.weapons.map((w)=>{
      const d = byId(DATA.weapons,w.id);
      return `<div class="kv"><span>${d.name} (${w.facing==="T"?"Turret":w.facing})</span><span>${d.dmg} · ${w.ammo}/${d.ammo} ammo</span></div>`;
    }).join("") || `<p class="dim">No weapons mounted.</p>`;
    const gear = v.gear.map(g=>{
      const d = byId(DATA.gear,g.id);
      return `<div class="kv"><span>${d.name}</span><span>${g.charges!=null?g.charges+" charges":"—"}</span></div>`;
    }).join("") || `<p class="dim">No gear installed.</p>`;
    app.appendChild(el(`<main>
      ${chassisArt(v)}
      <div class="row"><h1 style="font-size:22px; letter-spacing:.06em; text-align:left;" class="grow">${esc(v.name)}</h1>
        <button class="small" style="width:auto" data-act="renameVehicle">Rename</button></div>
      <div class="panel">${V.vSchematic(v, 230)}</div>
      <div class="panel">
        <div class="kv"><span>Chassis</span><b>${s.ch.name}</b></div>
        <div class="kv"><span>Power plant</span><b>${s.pl?s.pl.name:'<span class="warn">none — she won’t start</span>'}</b></div>
        <div class="kv"><span>Weight</span><span class="${s.over?'warn':''}">${s.weight} / ${s.ch.maxGross}${s.over?" OVERLOADED":""}</span></div>
        <div class="kv"><span>Acceleration</span><b>${s.accel}</b></div>
        <div class="kv"><span>Handling</span><b>${s.handling>=0?"+":""}${s.handling}</b></div>
        <div class="kv"><span>Heat / turn</span><span class="${s.heatDraw>s.heatCap?'warn':''}">${s.heatDraw} draw / ${s.heatCap} budget</span></div>
        <div class="kv"><span>Space</span><span>${s.spaceUsed} / ${s.space}${s.cargoSpace?` (+${s.cargoSpace} cargo)`:""}</span></div>
        <div class="kv"><span>Armor F/L/R/B/T</span><span>${v.armor.F}/${v.armor.L}/${v.armor.R}/${v.armor.B}/${v.armor.T}</span></div>
      </div>
      ${V.vDamaged(v)?`<h2>Damage</h2>
      <div class="panel">
        ${s.dmg.hull?`<div class="kv"><span>Hull</span><span class="warn">${s.hull}/${s.hullMax}</span></div>`:""}
        ${s.dmg.tires?`<div class="kv"><span>Tires shredded</span><span class="warn">${s.dmg.tires}</span></div>`:""}
        ${s.dmg.plant?`<div class="kv"><span>Power plant hits</span><span class="warn">${s.dmg.plant}/2</span></div>`:""}
        ${v.weapons.filter(w=>w.dmgd).map(w=>`<div class="kv"><span>${byId(DATA.weapons,w.id).name}</span><span class="warn">smashed</span></div>`).join("")}
        <button class="primary small" data-act="repair" ${G.scrap<V.repairCost(v)?"disabled":""}>Full repair — ${V.repairCost(v)} scrap${G.player.skills.mechanics?` (Mechanics discount)`:""}</button>
        <p class="dim">Chipped armor isn't damage — re-plate it in the Workshop.</p>
      </div>`:""}
      <h2>Mounted</h2>
      <div class="panel">${wpns}${gear}</div>
      <h2>Service record</h2>
      <div class="panel">
        <div class="kv"><span>In service since</span><span>Day ${h.acquiredDay}</span></div>
        <div class="kv"><span>Record</span><span>${h.wins}W – ${h.losses}L${h.championships?` · ${h.championships} title${h.championships>1?"s":""}`:""}</span></div>
        <div class="kv"><span>Kills</span><span>${h.kills}</span></div>
        <div class="kv"><span>Track distance</span><span>${h.mileage} bands</span></div>
        <div class="kv"><span>Refits</span><span>${h.installs} in / ${h.removals} out · ${h.majorRepairs} major rebuild${h.majorRepairs===1?"":"s"}</span></div>
      </div>
      <button class="primary" data-act="go" data-to="workshop">Open the Workshop</button>
      <button class="danger small" data-act="sellVehicle">Sell rig — ${V.sellVal(V.vInvested(v))} scrap</button>
      ${backBtn()}
    </main>`));
  },

  workshop(app){
    const v = V.vehicle();
    if(!v){ setScreen("garage"); return; }
    app.appendChild(headerBar());
    const s = V.vStats(v);
    const statbar = `<div class="statbar">
      <div><span class="lbl">Weight</span><span class="${s.over?'warn':''}">${s.weight}/${s.ch.maxGross}</span></div>
      <div><span class="lbl">Accel</span>${s.accel}</div>
      <div><span class="lbl">Heat</span><span class="${s.heatDraw>s.heatCap?'warn':''}">${s.heatDraw}/${s.heatCap}</span></div>
      <div><span class="lbl">Space</span>${s.spaceUsed}/${s.space}</div>
    </div>`;
    const plants = DATA.plants.map(p=>{
      const owned = v.plant===p.id;
      const refund = v.plant ? V.sellVal(byId(DATA.plants,v.plant).cost) : 0;
      const afford = G.scrap + refund >= p.cost;
      return `<button data-act="setPlant" data-id="${p.id}" ${owned||!afford?"disabled":""}>
        ${p.name} — ${owned?"installed":p.cost+" scrap"}
        <span class="sub">${p.blurb}</span>
        <span class="sub">Power ${p.power} · heat budget ${p.heat}/turn · ${p.wt} wt${v.plant&&!owned?` · trade-in credit ${refund}`:""}</span>
      </button>`;
    }).join("");
    const armor = DATA.armor.facings.map(([f,label])=>`
      <div class="row">
        <div class="grow"><b>${label}</b> <span class="dim">${v.armor[f]} pt</span></div>
        <button class="mini" data-act="armorMod" data-f="${f}" data-delta="-1" ${v.armor[f]<=0?"disabled":""}>−</button>
        <button class="mini" data-act="armorMod" data-f="${f}" data-delta="1" ${v.armor[f]>=DATA.armor.max||G.scrap<DATA.armor.cost?"disabled":""}>+</button>
      </div>`).join("");
    const mounted = v.weapons.map((w,i)=>{
      const d = byId(DATA.weapons,w.id);
      const reloadCost = Math.ceil((d.ammo-w.ammo)*d.rnd);
      return `<div class="panel" style="gap:6px">
        <div class="kv"><b>${d.name}</b><span>${d.dmg} · ${d.rng} · heat ${d.heat}</span></div>
        <div class="kv"><span>Ammo</span><span>${w.ammo}/${d.ammo}</span></div>
        <div class="row">
          <button class="small grow" data-act="faceWeapon" data-i="${i}">Facing: ${w.facing==="T"?"Turret":w.facing}</button>
          <button class="small grow" data-act="reload" data-i="${i}" ${w.ammo>=d.ammo||G.scrap<reloadCost?"disabled":""}>Reload${reloadCost>0?" "+reloadCost+"s":""}</button>
          <button class="small danger grow" data-act="sellWeapon" data-i="${i}">Sell ${V.sellVal(d.cost)}s</button>
        </div>
      </div>`;
    }).join("");
    const buyWpns = DATA.weapons.map(w=>{
      const no = s.mountsUsed>=s.mounts || s.spaceUsed+w.space>s.space || G.scrap<w.cost;
      return `<button data-act="buyWeapon" data-id="${w.id}" ${no?"disabled":""}>
        ${w.name} — ${w.cost} scrap
        <span class="sub">${w.blurb}</span>
        <span class="sub">${w.dmg} dmg · ${w.rng} · heat ${w.heat}/shot · ${w.ammo} rds · ${w.wt} wt · ${w.space} space</span>
      </button>`;
    }).join("");
    const gearRows = v.gear.map((g,i)=>{
      const d = byId(DATA.gear,g.id);
      const refillCost = d.charges ? Math.ceil((d.charges-(g.charges||0))*(d.rnd||0)) : 0;
      return `<div class="panel" style="gap:6px">
        <div class="kv"><b>${d.name}</b><span>${g.charges!=null?g.charges+"/"+d.charges+" charges":""}</span></div>
        <div class="row">
          ${d.charges?`<button class="small grow" data-act="refill" data-i="${i}" ${g.charges>=d.charges||G.scrap<refillCost?"disabled":""}>Refill${refillCost>0?" "+refillCost+"s":""}</button>`:""}
          <button class="small danger grow" data-act="sellGear" data-i="${i}">Sell ${V.sellVal(d.cost)}s</button>
        </div>
      </div>`;
    }).join("");
    const buyGearRows = DATA.gear.map(g=>{
      const no = s.spaceUsed+g.space>s.space || G.scrap<g.cost;
      return `<button data-act="buyGear" data-id="${g.id}" ${no?"disabled":""}>
        ${g.name} — ${g.cost} scrap
        <span class="sub">${g.blurb}</span>
        <span class="sub">${g.wt} wt · ${g.space} space${g.charges?` · ${g.charges} charges`:""}</span>
      </button>`;
    }).join("");
    app.appendChild(el(`<main>
      ${statbar}
      <div class="panel">${V.vSchematic(v, 190)}</div>
      <p class="flavor">Grease, sparks, and the radio playing static hymns. Sell-back is ${V.SELLBACK*100}% — experiment freely.</p>
      <h2>Power plant</h2>
      ${plants}
      <h2>Armor — ${DATA.armor.cost}s / ${DATA.armor.wt} wt per point</h2>
      <div class="panel">${armor}</div>
      <h2>Weapons — ${s.mountsUsed}/${s.mounts} mounts${v.gear.some(g=>g.id==="ring")?" · ring mount fitted":""}</h2>
      ${mounted}
      ${buyWpns}
      <h2>Utility gear</h2>
      ${gearRows}
      ${buyGearRows}
      <button class="primary" data-act="go" data-to="garage">Done — back to the Garage</button>
    </main>`));
  },

  market(app){
    app.appendChild(headerBar());
    const v = V.vehicle();
    const ammoRows = v ? v.weapons.map((w,i)=>{
      const d = byId(DATA.weapons,w.id);
      const cost = Math.ceil((d.ammo-w.ammo)*d.rnd);
      return `<button class="small" data-act="reload" data-i="${i}" ${w.ammo>=d.ammo||G.scrap<cost?"disabled":""}>
        ${d.name}: ${w.ammo}/${d.ammo}${cost>0?" — reload "+cost+" scrap":" — full"}</button>`;
    }).join("") : "";
    const P = W.RESOURCE_PRICES;
    app.appendChild(el(`<main>
      ${hero("market")}
      <h2>The Rust Bucket Market</h2>
      <p class="flavor">Hanging tarps, hissing lamps, prices scratched on slate. Everything's negotiable except the exits.</p>
      <div class="panel">
        <div class="kv"><span>Fuel</span><b>${G.world.fuel} units</b></div>
        <div class="kv"><span>Water</span><b>${G.world.water}</b></div>
        <div class="kv"><span>Food</span><b>${G.world.food}</b></div>
      </div>
      <button data-act="buyRes" data-kind="fuel" ${G.scrap<P.fuel.cost?"disabled":""}>Buy fuel — ${P.fuel.cost} scrap<span class="sub">+${P.fuel.qty} units. The road runs on it (Slice 3).</span></button>
      <button data-act="buyRes" data-kind="water" ${G.scrap<P.water.cost?"disabled":""}>Buy water — ${P.water.cost} scrap<span class="sub">+${P.water.qty}. Nobody crosses the Gravel Sea dry.</span></button>
      <button data-act="buyRes" data-kind="food" ${G.scrap<P.food.cost?"disabled":""}>Buy food — ${P.food.cost} scrap<span class="sub">+${P.food.qty} rations. Matters when you have a crew (Slice 4).</span></button>
      ${v && v.weapons.length ? `<h2>Ammo</h2>${ammoRows}` : ""}
      <p class="dim">Parts and weapons are fitted at the Workshop. Faction prices arrive with reputation.</p>
      ${backBtn()}
    </main>`));
  },

  jobs(app){
    app.appendChild(headerBar());
    const rows = DATA.shifts.map(j=>`
      <button data-act="workShift" data-id="${j.id}">
        ${j.name}<span class="sub">${j.flavor}</span>
        <span class="sub">~${j.base + G.player.skills[j.skill]*5} scrap (${byId(DATA.skills,j.skill).name} helps) · takes 1 day</span>
      </button>`).join("");
    app.appendChild(el(`<main>
      ${hero("jobs")}
      <h2>Job Board</h2>
      <p class="flavor">Chalk on rusted steel. The good contracts ask for a rig and a death wish; the rest ask for your morning.</p>
      ${rows}
      <div class="panel"><p class="dim">Courier and combat contracts post when the road opens (Slice 3).</p></div>
      ${backBtn()}
    </main>`));
  },

  bar(app){
    app.appendChild(headerBar());
    app.appendChild(el(`<main>
      ${hero("bar")}
      <h2>The Slag Bar</h2>
      <p class="flavor">Condensation on the glass, faces in the smoke. Everyone here is between jobs or between lives.</p>
      <button data-act="rumor" ${G.scrap<5?"disabled":""}>Buy a round — 5 scrap<span class="sub">Loosen a tongue, hear the road</span></button>
      <div class="panel">${(G.log.filter(l=>l.startsWith("Slag Bar:")).slice(-4).map(t=>`<p class="dim">${esc(t.slice(10))}</p>`).join("")) || '<p class="dim">Nobody’s talking yet.</p>'}</div>
      <div class="panel"><p class="dim">Drivers, gunners, and mechanics drink here. Recruiting opens in Slice 4.</p></div>
      ${backBtn()}
    </main>`));
  },

  arena(app){
    app.appendChild(headerBar());
    const v = V.vehicle();
    const ready = v && V.roadworthy(v);
    const readyLine = !v ? '<span class="warn">You need a rig. The yard sells chassis.</span>'
      : !v.plant ? '<span class="warn">Your rig has no power plant.</span>'
      : !V.roadworthy(v) ? '<span class="warn">Your rig is overloaded — shed weight first.</span>'
      : V.vDamaged(v) ? '<span class="warn">Your rig carries damage. Fighting like this is a choice.</span>'
      : '<span class="good">Your rig is ready.</span>';
    const rows = DATA.arena.map(t=>{
      const beaten = G.history["defeated"+t.npc.charAt(0).toUpperCase()+t.npc.slice(1)]||0;
      const locked = t.req && !(G.history["defeated"+byId(DATA.arena,t.req).npc.charAt(0).toUpperCase()+byId(DATA.arena,t.req).npc.slice(1)]);
      const mem = G.npcs[t.npc];
      const grudge = mem && mem.winsVsPlayer>0 ? ` · beat you ×${mem.winsVsPlayer}` : "";
      return `<button data-act="startBout" data-id="${t.id}" ${locked||!ready?"disabled":""}>
        ${t.name} — ${beaten? t.repeat : t.purse} scrap${beaten?` (repeat)`:""}
        <span class="sub">${locked ? "Win the previous bout to unlock." : t.pitch}</span>
        <span class="sub">vs ${byId(DATA.arena,t.id) && (DATA.npcs[t.npc]||{}).name} · ${byId(DATA.chassis,t.foe.v.chassis).name}${beaten?` · beaten ×${beaten}`:""}${grudge}</span>
      </button>`;
    }).join("");
    app.appendChild(el(`<main>
      ${hero("arena")}
      <h2>The Crucible</h2>
      <p class="flavor">A pit of packed slag ringed in weld-scarred bleachers, dug where the refinery's biggest tank used to stand. Bout days, half of Kettle Rock climbs the tin. The militia takes its cut at the gate; the crowd takes the rest out of whoever loses.</p>
      ${(G.history.defeatedBruna)?'<p class="flavor">Your name is burned into the gate in torch-script, right under three seasons of Bruna\'s. Kids point when you walk past.</p>':""}
      <div class="panel"><p>${readyLine}</p></div>
      ${rows}
      ${backBtn()}
    </main>`));
  },

  fight(app){
    const c = G.combat;
    if(!c){ setScreen("arena"); return; }
    const v = V.vehicle();
    const ps = V.vStats(v), es = V.vStats(c.foeV);
    const brg = C.bearing(c.p, c.e);
    const dirWord = brg.arc==="F"?"ahead":brg.arc==="B"?"behind":"beside you";
    let cells = "";
    for(let band=C.TRACK-1; band>=0; band--){
      for(let lane=0; lane<C.LANES; lane++){
        const p = c.p.pos===band && c.p.lane===lane;
        const e = c.e.pos===band && c.e.lane===lane;
        cells += `<div class="cell ${p&&e?"pe":p?"p":e?"e":""}">${p&&e?"P·E":p?"P":e?"E":""}</div>`;
      }
    }
    const heatPips = n=>`<span class="pips">${'<span class="on">●</span>'.repeat(Math.max(0,n))}${'<span class="off">●</span>'.repeat(Math.max(0,ps.heatCap-n))}</span>`;
    const hullPips = (h,m)=>`<span class="pips hullpips">${'<span class="on">■</span>'.repeat(Math.max(0,h))}${'<span class="off">■</span>'.repeat(Math.max(0,m-h))}</span>`;
    let controls = "";
    if(c.done){
      const s = c.summary||{};
      controls = `${c.result==="win"?hero("arena-win"):hero("arena-loss")}<div class="panel">
        <p class="${c.result==="win"?"good":"warn"}"><b>${c.result==="win"?"VICTORY.":"WRECKED."}</b></p>
        ${s.text?`<p class="flavor">${esc(s.text)}</p>`:""}
        ${s.crowd?`<p class="flavor">${esc(s.crowd)}</p>`:""}
        ${c.result==="win"
          ? `<p>Purse: <b>${s.purse}</b> scrap · picked from the wreck: <b>${s.salvage}</b> more.</p>`
          : s.ironman
            ? `<p class="warn">Ironman: the Gravel Sea keeps what it takes. This career is over.</p>`
            : `<p>The tow, the pit fee, and the vultures cost <b>${s.lost}</b> scrap. Your rig — and your pride — need the garage.</p>`}
        <button class="primary" data-act="fightDone">${s.ironman?"Face the judgment":"Leave the pit"}</button>
      </div>`;
    } else if(c.phase==="move"){
      const ramOk = c.p.lane===c.e.lane && brg.arc==="F" && brg.dist<=Math.max(1,c.p.speed);
      controls = `<h2>Round ${c.round} — maneuver</h2>
      <div class="btnrow">
        <button data-act="maneuver" data-m="accel" ${c.p.speed>=ps.maxSpeed?"disabled":""}>Accelerate</button>
        <button data-act="maneuver" data-m="coast">Coast</button>
        <button data-act="maneuver" data-m="brake" ${c.p.speed<=0?"disabled":""}>Brake</button>
        <button data-act="maneuver" data-m="swerveL" ${c.p.lane<=0?"disabled":""}>Swerve L</button>
        <button data-act="maneuver" data-m="boost" ${c.p.heat<2?"disabled":""}>Boost (2♨)</button>
        <button data-act="maneuver" data-m="swerveR" ${c.p.lane>=C.LANES-1?"disabled":""}>Swerve R</button>
      </div>
      ${ramOk?`<button class="danger" data-act="maneuver" data-m="ram">RAM ${esc(c.foe.name)}<span class="sub">2d6+speed to them, 1d6 recoil to you${v.gear.some(g=>g.id==="ram")?" — ram plate doubles it":""}</span></button>`:""}
      <button class="small" data-act="concede">Concede the bout (take the loss)</button>`;
    } else {
      const wpnBtns = v.weapons.map((w,i)=>{
        const d = byId(DATA.weapons,w.id);
        const f = { st:c.p, v, skills:G.player.skills };
        const chk = C.canFire(f, w, brg);
        const pct = C.toHit(f, w, brg, c.e, c.called);
        return `<button data-act="fire" data-i="${i}" ${chk.ok?"":"disabled"}>
          ${d.name} (${w.facing==="T"?"Turret":w.facing}) — ${chk.ok?pct+"%":chk.why}
          <span class="sub">${d.dmg} dmg · ammo ${w.ammo}/${d.ammo} · heat ${d.heat}</span>
        </button>`;
      }).join("");
      controls = `<h2>Round ${c.round} — fire</h2>
      <button class="small" data-act="toggleCalled">Called shot: <b>${c.called?c.called.toUpperCase()+" (−25%)":"OFF"}</b></button>
      ${wpnBtns}
      <button class="primary" data-act="endTurn">End turn</button>`;
    }
    app.appendChild(el(`<main>
      <div class="panel" style="gap:4px">
        <div class="kv"><b class="warn">${esc(c.foe.name)}</b><span>${es.ch.name} · ${dirWord}, ${brg.dist} band${brg.dist===1?"":"s"}</span></div>
        <div class="kv"><span>Hull ${hullPips(es.hull,es.hullMax)}</span><span>Spd ${c.e.speed}</span></div>
        <div class="kv"><span>Armor F/L/R/B</span><span>${c.foeV.armor.F}/${c.foeV.armor.L}/${c.foeV.armor.R}/${c.foeV.armor.B}</span></div>
      </div>
      <div class="track">${cells}</div>
      <div class="panel" style="gap:4px">
        <div class="kv"><b>${esc(v.name)}</b><span>Spd ${c.p.speed}/${ps.maxSpeed} · you fire on its <b>${brg.hitFacing}</b></span></div>
        <div class="kv"><span>Hull ${hullPips(ps.hull,ps.hullMax)}</span><span>Heat ${heatPips(c.p.heat)}</span></div>
        <div class="kv"><span>Armor F/L/R/B</span><span>${v.armor.F}/${v.armor.L}/${v.armor.R}/${v.armor.B}</span></div>
        ${c.p.drvPen?`<div class="kv"><span class="warn">Driver hit</span><span class="warn">−${c.p.drvPen} to skills</span></div>`:""}
      </div>
      ${controls}
      <div class="panel">${c.log.slice(-6).map(t=>`<p class="dim" style="font-size:13.5px">${esc(t)}</p>`).join("")}</div>
    </main>`));
  },

  journal(app){
    app.appendChild(headerBar());
    const entries = G.journal.slice().reverse().map(e=>`
      <div class="panel" style="gap:2px">
        <p class="dim" style="font-size:12px">Day ${e.day}</p>
        <p style="font-size:15px">${esc(e.text)}</p>
      </div>`).join("") || '<div class="panel"><p class="dim">The story hasn\'t started yet.</p></div>';
    app.appendChild(el(`<main>
      <h2>Journal — the story so far</h2>
      <div class="panel" style="gap:4px">
        <div class="kv"><span>Record</span><span>${G.career.crucibleWins}W – ${G.career.crucibleLosses}L${G.career.championships?` · ${G.career.championships} title${G.career.championships>1?"s":""}`:""}</span></div>
        <div class="kv"><span>Best streak</span><span>${G.career.bestStreak}</span></div>
        <div class="kv"><span>Fame / Respect / Fear / Pop.</span><span>${G.rep.fame} / ${G.rep.respect} / ${G.rep.fear} / ${G.rep.popularity}</span></div>
        <div class="kv"><span>Lifetime scrap</span><span>${G.career.scrapEarned} earned · ${G.career.scrapSpent} spent</span></div>
      </div>
      ${entries}
      ${backBtn()}
    </main>`));
  },

  legacy(app){
    const L = evaluate(G);
    app.appendChild(el(`<main style="justify-content:center; gap:14px;">
      <h2 style="text-align:center; border:none;">The Gravel Sea renders judgment</h2>
      <div class="panel" style="text-align:center; gap:8px;">
        <p class="dim">Career performance</p>
        <p style="font-size:40px; color:var(--amber); font-weight:700;">${L.performance}<span class="dim" style="font-size:18px;">/100</span></p>
        <h1 style="font-size:24px;">${esc(L.name)}</h1>
        <p class="flavor">${esc(L.text)}</p>
      </div>
      <div class="panel" style="gap:4px">
        <div class="kv"><span>Bouts</span><span>${L.career.wins}W – ${L.career.losses}L${L.career.championships?` · ${L.career.championships} title${L.career.championships>1?"s":""}`:""}</span></div>
        <div class="kv"><span>Best streak</span><span>${L.career.bestStreak}</span></div>
        <div class="kv"><span>Lifetime scrap</span><span>${L.career.scrapEarned}</span></div>
        <div class="kv"><span>Days on the road</span><span>${L.career.daysOnTheRoad}</span></div>
        <div class="kv"><span>Journal entries</span><span>${L.career.journalEntries}</span></div>
      </div>
      ${G.campaign.flags.dead || G.campaign.flags.retired
        ? `<button class="primary" data-act="newLegend">Begin a new legend</button>`
        : `<button class="small" data-act="go" data-to="settings">Back</button>`}
    </main>`));
  },

  settings(app){
    app.appendChild(headerBar());
    const m = el(`<main>
      <h2>Settings</h2>
      <div class="panel">
        <label class="toggle">Ironman (defeat permanently ends the career)
          <input type="checkbox" id="ironman" ${G.meta.ironman?"checked":""}></label>
      </div>
      <h2>Save</h2>
      <div class="panel">
        <p class="dim">Autosave is always on. Export a save string as a backup; import restores it exactly.</p>
        <button id="doExport" class="small">Export save to text</button>
        <textarea id="saveBox" placeholder="Save string appears here / paste one to import"></textarea>
        <div class="row">
          <button id="doCopy" class="small grow">Copy</button>
          <button id="doImport" class="small grow">Import</button>
        </div>
        <p class="msg" id="msg"></p>
      </div>
      <h2>Career</h2>
      <div class="panel">
        <button class="small" data-act="go" data-to="journal">Read the journal</button>
        ${G.player.created?`<button class="small" data-act="go" data-to="legacy">Preview your legacy</button>
        <button class="danger small" data-act="retire">Retire — end the career</button>`:""}
      </div>
      <h2>Danger</h2>
      <div class="panel">
        <button id="doReset" class="danger small">Erase save and restart</button>
      </div>
      ${devMode()?`<h2>Developer</h2><div class="panel"><button class="small" data-act="go" data-to="debug">Open debug panel</button></div>`:""}
      <button class="primary" data-act="go" data-to="${G.campaign.flags.started && G.player.created ? "hub" : "title"}">Back</button>
    </main>`);
    const msg = (t,ok)=>{ const e=m.querySelector("#msg"); e.textContent=t; e.className="msg "+(ok?"ok":"err"); };
    m.querySelector("#ironman").onchange = e=>{ G.meta.ironman = e.target.checked; save(); };
    m.querySelector("#doExport").onclick = ()=>{ m.querySelector("#saveBox").value = exportSave(); msg("Exported. Copy it somewhere safe.", true); };
    m.querySelector("#doCopy").onclick = async ()=>{
      const box = m.querySelector("#saveBox");
      if(!box.value){ msg("Nothing to copy — export first.", false); return; }
      try{ await navigator.clipboard.writeText(box.value); msg("Copied to clipboard.", true); }
      catch(e){ box.select(); msg("Tap and hold the text to copy manually.", false); }
    };
    m.querySelector("#doImport").onclick = ()=>{
      try{ importSave(m.querySelector("#saveBox").value); msg("Save imported.", true); render(); }
      catch(e){ msg("Import failed: "+e.message, false); }
    };
    m.querySelector("#doReset").onclick = ()=>{
      if(!confirm("Erase the save? This cannot be undone unless you exported a backup.")) return;
      eraseSave();
      const g = newGame(); setG(g); seedRng(g.meta.seed);
      setScreen("title");
    };
    app.appendChild(m);
  },

  debug(app){
    if(!devMode()){ setScreen("settings"); return; }
    app.appendChild(headerBar());
    const stat = (label, path)=>`<button class="small" data-act="dbgEdit" data-path="${path}">${label}: <b>${path.split(".").reduce((o,k)=>o&&o[k], G)}</b></button>`;
    const goldenBtns = Object.keys(GOLDEN).map(k=>`<button class="small" data-act="dbgGolden" data-k="${k}">${k}</button>`).join("");
    const jumpBtns = ["title","create","hub","garage","workshop","market","jobs","bar","arena","journal","legacy","settings"]
      .map(s=>`<button class="small" data-act="go" data-to="${s}">${s}</button>`).join("");
    app.appendChild(el(`<main>
      <h2>Debug panel (dev only)</h2>
      <div class="grid2">
        ${stat("Scrap","scrap")} ${stat("Fame","rep.fame")}
        ${stat("Respect","rep.respect")} ${stat("Fear","rep.fear")}
        ${stat("Popularity","rep.popularity")} ${stat("Streak","career.streak")}
        ${stat("Crucible W","career.crucibleWins")} ${stat("Crucible L","career.crucibleLosses")}
        ${stat("Militia rep","rep.factions.militia")} ${stat("Merchants rep","rep.factions.merchants")}
        ${stat("Day","world.day")} ${stat("XP","player.xp")}
      </div>
      <h2>Golden states</h2>
      <div class="grid2" style="grid-template-columns:1fr 1fr 1fr;">${goldenBtns}</div>
      <h2>Jump to screen</h2>
      <div class="grid2" style="grid-template-columns:1fr 1fr 1fr;">${jumpBtns}</div>
      <h2>Tools</h2>
      <div class="panel">
        <button class="small" data-act="dbgWreck">Damage active vehicle</button>
        <button class="small" data-act="dbgFlag">Set history flag…</button>
        <button class="small" data-act="dbgCooldown">Clear dialogue anti-repeat</button>
        <button class="small danger" data-act="dbgDevOff">Disable dev mode</button>
      </div>
      ${backBtn("settings")}
    </main>`));
  },
};

/* debug actions */
ACTIONS.dbgEdit = d => {
  const keys = d.path.split(".");
  const cur = keys.reduce((o,k)=>o&&o[k], G);
  const val = prompt(d.path, cur);
  if(val===null) return;
  let obj = G; for(let i=0;i<keys.length-1;i++) obj = obj[keys[i]];
  obj[keys[keys.length-1]] = isNaN(+val) ? val : +val;
  render();
};
ACTIONS.dbgGolden = d => {
  const g = GOLDEN[d.k](); setG(g); seedRng(g.meta.seed);
  logMsg(`[debug] loaded golden state: ${d.k}`);
  setScreen(g.screen||"hub");
};
ACTIONS.dbgWreck = () => {
  const v = V.vehicle(); if(!v) return;
  v.dmg = {hull:4,tires:2,plant:1}; if(v.weapons[0]) v.weapons[0].dmgd = true;
  render();
};
ACTIONS.dbgFlag = () => {
  const k = prompt("history flag key (e.g. defeatedBruna)"); if(!k) return;
  const val = prompt("value (number or true)", "true");
  G.history[k] = val==="true" ? true : (isNaN(+val)?val:+val);
  render();
};
ACTIONS.dbgCooldown = () => { G.narrative.recent = []; render(); };
ACTIONS.dbgDevOff = () => { LS.removeItem("roadgrave.dev"); setScreen("settings"); };
