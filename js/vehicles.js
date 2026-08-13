/* vehicles.js — vehicle math, vehicle history, garage/market operations,
   and the SVG rig schematic. All scrap movement uses world.js helpers. */

import { G, save, logMsg, pick } from "./core.js";
import { DATA, byId } from "./data.js";
import { earn, spend, addJournal, incFlag } from "./world.js";

export const SELLBACK = 0.7;
export const sellVal = c => Math.floor(c*SELLBACK);

/* ---- construction ----------------------------------------------------- */
export function newVehicle(chassisId){
  return { id:"v"+Math.floor(Math.random()*1e9), name:"", chassis:chassisId, plant:null,
    armor:{F:0,L:0,R:0,B:0,T:0}, weapons:[], gear:[], cargo:[],
    dmg:{hull:0,tires:0,plant:0},
    history:{ originalChassis:chassisId, acquiredDay:1, previousOwners:[],
      mileage:0, wins:0, losses:0, kills:0, majorRepairs:0, installs:0, removals:0, championships:0 } };
}
export function vehicle(){ return G.vehicles[G.activeVehicle||0] || null; }
export function armorPts(v){ return v.armor.F+v.armor.L+v.armor.R+v.armor.B+v.armor.T; }

/* ---- derived stats ---------------------------------------------------- */
export function vStats(v){
  const ch = byId(DATA.chassis, v.chassis);
  const pl = v.plant ? byId(DATA.plants, v.plant) : null;
  const dmg = v.dmg || (v.dmg = {hull:0,tires:0,plant:0});
  const wpnWt  = v.weapons.reduce((a,w)=>a+byId(DATA.weapons,w.id).wt,0);
  const gearWt = v.gear.reduce((a,g)=>a+byId(DATA.gear,g.id).wt,0);
  const weight = ch.wt + (pl?pl.wt:0) + armorPts(v)*DATA.armor.wt + wpnWt + gearWt;
  const spaceUsed = (pl?1:0) + v.weapons.reduce((a,w)=>a+byId(DATA.weapons,w.id).space,0)
                  + v.gear.reduce((a,g)=>a+byId(DATA.gear,g.id).space,0);
  const cargoSpace = v.gear.filter(g=>g.id==="rack").length*4;
  let power = pl?pl.power:0;
  power = Math.round(power * (1 - 0.3*Math.min(dmg.plant,2)));
  const over = weight > ch.maxGross;
  const pw = weight? Math.round(power*1000/weight)/10 : 0;
  const accel = !pl ? "—" : pw>=25?"S": pw>=18?"A": pw>=12?"B": pw>=8?"C":"D";
  const maxSpeed = !pl ? 0 : Math.max(1, ({S:4,A:4,B:3,C:2,D:1})[accel] - (dmg.tires>=2?1:0));
  const handling = ch.handling + (over?-2:0) - (dmg.tires>=3?2 : dmg.tires>=1?1 : 0);
  const heatCap = (pl?pl.heat:0) + v.gear.filter(g=>g.id==="coolant").length*2;
  const heatDraw = v.weapons.reduce((a,w)=>a+byId(DATA.weapons,w.id).heat,0);
  return { ch, pl, weight, over, spaceUsed, space:ch.space, cargoSpace,
           power, pw, accel, maxSpeed, handling, heatCap, heatDraw,
           hull:ch.hull-dmg.hull, hullMax:ch.hull, dmg,
           mountsUsed:v.weapons.length, mounts:ch.mounts };
}
export function vInvested(v){
  const ch = byId(DATA.chassis, v.chassis);
  let n = ch.cost + (v.plant?byId(DATA.plants,v.plant).cost:0) + armorPts(v)*DATA.armor.cost;
  n += v.weapons.reduce((a,w)=>a+byId(DATA.weapons,w.id).cost,0);
  n += v.gear.reduce((a,g)=>a+byId(DATA.gear,g.id).cost,0);
  return n;
}
export function roadworthy(v){ const s=vStats(v); return !!v.plant && !s.over; }
export function vDamaged(v){
  return v.dmg.hull>0 || v.dmg.tires>0 || v.dmg.plant>0 || v.weapons.some(w=>w.dmgd);
}
export function repairCost(v){
  const raw = v.dmg.hull*6 + v.dmg.tires*8 + v.dmg.plant*20 + v.weapons.filter(w=>w.dmgd).length*12;
  let disc = Math.min(0.25, G.player.skills.mechanics*0.05);
  if(G.history.weldFavor) disc = Math.min(0.30, disc + 0.05);   // Weld remembers the manifold
  return Math.ceil(raw*(1-disc));
}

/* ---- garage / market operations (UI wraps these; tests call directly) - */
export function buyChassis(id){
  const ch = byId(DATA.chassis, id);
  if(!ch || vehicle() || !spend(ch.cost)) return false;
  const v = newVehicle(ch.id);
  v.name = "The " + pick(["Stray","Vulture","Kestrel","Mule","Widow","Brick","Omen","Rattler"]);
  v.history.acquiredDay = G.world.day;
  G.vehicles.push(v);
  logMsg(`Bought a ${ch.name}. The yard hands you the keys and a shrug. She's yours: ${v.name}.`);
  addJournal("firstVehicle", { chassisName:ch.name, vname:v.name });
  save();
  return true;
}
export function sellVehicle(){
  const v = vehicle(); if(!v) return 0;
  const val = sellVal(vInvested(v));
  earn(val, "vehicleSale");
  addJournal("vehicleSold", { vname:v.name, value:val });
  G.vehicles.splice(G.activeVehicle||0, 1);
  G.activeVehicle = 0;
  logMsg(`Sold ${v.name} for ${val} scrap. The yard crew doesn't make eye contact.`);
  save();
  return val;
}
export function setPlant(id){
  const v = vehicle(); const pl = byId(DATA.plants, id);
  if(!v || !pl || v.plant===id) return false;
  const refund = v.plant ? sellVal(byId(DATA.plants,v.plant).cost) : 0;
  if(G.scrap + refund < pl.cost) return false;
  if(refund) earn(refund, "tradeIn");
  spend(pl.cost);
  if(v.plant) v.history.removals++;
  v.plant = id; v.history.installs++;
  save(); return true;
}
export function armorMod(f, delta){
  const v = vehicle(); if(!v) return false;
  const cur = v.armor[f];
  if(delta>0){
    if(cur>=DATA.armor.max || !spend(DATA.armor.cost)) return false;
    v.armor[f]=cur+1; v.history.installs++;
  } else {
    if(cur<=0) return false;
    v.armor[f]=cur-1; earn(sellVal(DATA.armor.cost), "sellback"); v.history.removals++;
  }
  save(); return true;
}
export function buyWeapon(id){
  const v = vehicle(); const w = byId(DATA.weapons, id); if(!v||!w) return false;
  const s = vStats(v);
  if(s.mountsUsed>=s.mounts || s.spaceUsed+w.space>s.space || !spend(w.cost)) return false;
  v.weapons.push({ id:w.id, facing:"F", ammo:w.ammo, dmgd:false });
  v.history.installs++;
  save(); return true;
}
export function sellWeapon(i){
  const v = vehicle(); if(!v || !v.weapons[i]) return false;
  earn(sellVal(byId(DATA.weapons, v.weapons[i].id).cost), "sellback");
  v.weapons.splice(i,1); v.history.removals++;
  save(); return true;
}
export function faceWeapon(i){
  const v = vehicle(); const inst = v && v.weapons[i]; if(!inst) return false;
  const hasRing = v.gear.some(g=>g.id==="ring");
  const turretTaken = v.weapons.some((w,j)=>w.facing==="T" && j!==i);
  const order = ["F","L","R","B"].concat(hasRing && !turretTaken ? ["T"] : []);
  inst.facing = order[(order.indexOf(inst.facing)+1) % order.length];
  save(); return true;
}
export function buyGear(id){
  const v = vehicle(); const g = byId(DATA.gear, id); if(!v||!g) return false;
  const s = vStats(v);
  if(s.spaceUsed+g.space>s.space || !spend(g.cost)) return false;
  v.gear.push({ id:g.id, charges:g.charges||null });
  v.history.installs++;
  save(); return true;
}
export function sellGear(i){
  const v = vehicle(); if(!v || !v.gear[i]) return false;
  const g = byId(DATA.gear, v.gear[i].id);
  if(g.id==="ring") v.weapons.forEach(w=>{ if(w.facing==="T") w.facing="F"; });
  earn(sellVal(g.cost), "sellback");
  v.gear.splice(i,1); v.history.removals++;
  save(); return true;
}
export function reloadWeapon(i){
  const v = vehicle(); const inst = v && v.weapons[i]; if(!inst) return false;
  const w = byId(DATA.weapons, inst.id);
  const missing = w.ammo - inst.ammo;
  const cost = Math.ceil(missing * w.rnd);
  if(missing<=0 || !spend(cost)) return false;
  inst.ammo = w.ammo; save(); return true;
}
export function refillGear(i){
  const v = vehicle(); const inst = v && v.gear[i]; if(!inst) return false;
  const g = byId(DATA.gear, inst.id);
  const missing = (g.charges||0) - (inst.charges||0);
  const cost = Math.ceil(missing * (g.rnd||0));
  if(missing<=0 || !spend(cost)) return false;
  inst.charges = g.charges; save(); return true;
}
export function repairVehicle(){
  const v = vehicle(); if(!v || !vDamaged(v)) return false;
  const cost = repairCost(v);
  if(!spend(cost)) return false;
  const major = v.dmg.hull>=4 || v.dmg.plant>0;
  v.dmg = {hull:0,tires:0,plant:0};
  v.weapons.forEach(w=>w.dmgd=false);
  if(major){ v.history.majorRepairs++; incFlag("majorRepairsTotal"); addJournal("majorRepair", {vname:v.name, cost}); }
  logMsg("The wrench crew hammers your rig back into shape.");
  save(); return true;
}
export function renameVehicle(name){
  const v = vehicle(); if(!v || !name || !name.trim()) return false;
  v.name = name.trim(); save(); return true;
}

/* ---- rig schematic: live top-down SVG blueprint ----------------------- */
const WABBR = { scatter:"SCT", mg:"MG", cannon:"CAN", rockets:"RKT" };
const PABBR = { junker:"J6", v8:"V8", turbine:"TRB" };
export function vSchematic(v, maxw){
  const ch = byId(DATA.chassis, v.chassis);
  const dims = { skiff:{w:78,len:162,wheels:2}, courser:{w:100,len:202,wheels:2},
                 drayhulk:{w:120,len:244,wheels:3} }[v.chassis];
  const cx=100, cy=170;
  const x0=cx-dims.w/2, x1=cx+dims.w/2, y0=cy-dims.len/2, y1=cy+dims.len/2;
  const dmg = v.dmg||{hull:0,tires:0,plant:0};
  const P=[];
  P.push(`<defs><linearGradient id="hullg" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#161b21"/><stop offset="0.5" stop-color="#232b34"/>
    <stop offset="1" stop-color="#161b21"/></linearGradient></defs>`);
  // name header on the blueprint itself
  P.push(`<text x="100" y="16" font-size="13" fill="#e8b04a" text-anchor="middle" font-weight="bold" letter-spacing="1">${(v.name||"UNNAMED RIG").toUpperCase()}</text>`);
  P.push(`<text x="100" y="30" font-size="9" fill="#9aa3ad" text-anchor="middle" letter-spacing="2">${ch.name.toUpperCase()} CHASSIS</text>`);
  // wheels
  const rows = dims.wheels===3 ? [y0+18, cy-12, y1-42] : [y0+18, y1-42];
  let wi=0;
  rows.forEach(wy=>[x0-7,x1-5].forEach(wx=>{
    const bad = wi++ < dmg.tires;
    P.push(`<rect x="${wx}" y="${wy}" width="12" height="26" rx="4" fill="${bad?"#4a1512":"#0e1114"}" stroke="${bad?"#e06055":"#3a4048"}"/>`);
  }));
  // hull + panel seams + windshield
  P.push(`<path d="M ${x0+12} ${y0} L ${x1-12} ${y0} Q ${x1} ${y0} ${x1} ${y0+18} L ${x1} ${y1-10} Q ${x1} ${y1} ${x1-10} ${y1} L ${x0+10} ${y1} Q ${x0} ${y1} ${x0} ${y1-10} L ${x0} ${y0+18} Q ${x0} ${y0} ${x0+12} ${y0} Z"
    fill="url(#hullg)" stroke="${dmg.hull?"#e06055":"#4a5561"}" stroke-width="2"/>`);
  P.push(`<line x1="${x0+6}" y1="${y0+dims.len*0.55}" x2="${x1-6}" y2="${y0+dims.len*0.55}" stroke="#2a323c"/>`);
  P.push(`<line x1="${x0+6}" y1="${y0+dims.len*0.78}" x2="${x1-6}" y2="${y0+dims.len*0.78}" stroke="#2a323c"/>`);
  P.push(`<rect x="${x0+12}" y="${y0+Math.round(dims.len*0.30)}" width="${dims.w-24}" height="14" rx="4" fill="#2b333d"/>`);
  // armor pips
  const pip=(x,y,w,h,on)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.5" fill="${on?"#e8b04a":"none"}" stroke="#3a4048" stroke-width="1"/>`;
  for(let i=0;i<8;i++){
    P.push(pip(cx-47+i*12, y0-16, 10, 6, i<v.armor.F));
    P.push(pip(cx-47+i*12, y1+10, 10, 6, i<v.armor.B));
    P.push(pip(x0-16, cy-47+i*12, 6, 10, i<v.armor.L));
    P.push(pip(x1+10, cy-47+i*12, 6, 10, i<v.armor.R));
  }
  if(v.armor.T) P.push(`<text x="${x1-6}" y="${y0+14}" font-size="9" fill="#e8b04a" text-anchor="end">T:${v.armor.T}</text>`);
  if(v.gear.some(g=>g.id==="ram"))
    P.push(`<rect x="${x0-2}" y="${y0-8}" width="${dims.w+4}" height="6" rx="2" fill="#e8b04a" opacity="0.85"/>`);
  // plant
  const plBad = dmg.plant>0;
  P.push(`<rect x="${cx-19}" y="${y0+10}" width="38" height="18" rx="3" fill="#20262d" stroke="${plBad?"#e06055":v.plant?"#4a5561":"#3a4048"}" ${v.plant?"":'stroke-dasharray="3,3"'}/>`);
  P.push(`<text x="${cx}" y="${y0+23}" font-size="10" fill="${plBad?"#e06055":v.plant?"#e8e6df":"#5a636d"}" text-anchor="middle">${v.plant?PABBR[v.plant]:"——"}</text>`);
  if(v.gear.some(g=>g.id==="coolant"))
    P.push(`<text x="${cx+30}" y="${y0+23}" font-size="8" fill="#6fa8dc">CL</text>`);
  if(v.gear.some(g=>g.id==="rack"))
    P.push(`<rect x="${x0+14}" y="${y1-64}" width="${dims.w-28}" height="34" rx="4" fill="none" stroke="#5a636d" stroke-dasharray="4,3"/>
            <text x="${cx}" y="${y1-44}" font-size="8" fill="#5a636d" text-anchor="middle">CARGO</text>`);
  if(v.gear.some(g=>g.id==="ring"))
    P.push(`<circle cx="${cx}" cy="${cy+8}" r="18" fill="none" stroke="#5a636d" stroke-dasharray="3,3"/>`);
  // weapons at mounts (labels stay upright outside the rotated group)
  const wpn=(x,y,ang,w)=>{
    const bad=w.dmgd, dry=w.ammo<=0;
    const col = bad?"#e06055": dry?"#5a636d":"#c9c4b8";
    return `<g transform="translate(${x},${y})">
      <g transform="rotate(${ang})">
        <line x1="0" y1="-8" x2="0" y2="-22" stroke="${col}" stroke-width="3"/>
        <rect x="-14" y="-8" width="28" height="15" rx="3" fill="#20262d" stroke="${col}"/>
      </g>
      <text x="0" y="3" font-size="8.5" fill="${col}" text-anchor="middle">${WABBR[w.id]}</text>
      ${bad?`<line x1="-14" y1="-8" x2="14" y2="7" stroke="#e06055" stroke-width="2"/>`:""}
    </g>`;
  };
  const off=[[0],[-22,22],[-26,0,26],[-33,-11,11,33]];
  const grp={F:[],L:[],R:[],B:[],T:[]};
  v.weapons.forEach(w=>grp[w.facing].push(w));
  grp.F.forEach((w,k)=>P.push(wpn(cx+off[grp.F.length-1][k], y0+52, 0, w)));
  grp.B.forEach((w,k)=>P.push(wpn(cx+off[grp.B.length-1][k], y1-16, 180, w)));
  grp.L.forEach((w,k)=>P.push(wpn(x0+12, cy+34*k, 270, w)));
  grp.R.forEach((w,k)=>P.push(wpn(x1-12, cy+34*k, 90, w)));
  grp.T.forEach((w)=>P.push(wpn(cx, cy+8, 30, w)));
  const tail = v.gear.filter(g=>["smoke","oil","mines"].includes(g.id));
  tail.forEach((g,k)=>{
    const x = cx + (k-(tail.length-1)/2)*22;
    const dry = !g.charges;
    P.push(`<circle cx="${x}" cy="${y1+26}" r="8" fill="#20262d" stroke="${dry?"#3a4048":"#9aa3ad"}"/>
      <text x="${x}" y="${y1+29}" font-size="8" fill="${dry?"#5a636d":"#9aa3ad"}" text-anchor="middle">${g.id==="smoke"?"S":g.id==="oil"?"O":"M"}</text>`);
  });
  return `<svg viewBox="0 0 200 340" style="width:100%;max-width:${maxw||220}px;display:block;margin:0 auto">${P.join("")}</svg>`;
}
