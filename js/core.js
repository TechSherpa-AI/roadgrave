/* core.js — state container, seeded RNG, event bus, save/load/migrate.
   Owns G's identity and persistence. Knows nothing about game rules. */

export const SAVE_VERSION = 5;
export const BUILD = "0.5.0-m3.1a";
export const SAVE_KEY = "roadgrave.save";
export const BACKUP_KEY = "roadgrave.save.backup";
const SAVE_PREFIX = "RG1.";

/* localStorage shim so every module (and node tests) can run headless */
const LS = (typeof localStorage !== "undefined") ? localStorage : (() => {
  const m = {};
  return { getItem:k=>m[k]??null, setItem:(k,v)=>{m[k]=String(v);}, removeItem:k=>{delete m[k];} };
})();
export { LS };

/* ---- event bus -------------------------------------------------------- */
const listeners = {};
export const bus = {
  on(ev, fn){ (listeners[ev] = listeners[ev]||[]).push(fn); },
  emit(ev, ...args){ (listeners[ev]||[]).forEach(fn=>{ try{ fn(...args); }catch(e){ console.error("bus handler failed:", ev, e); } }); },
};

/* ---- central game state (live-bound export) --------------------------- */
export let G = null;
export function setG(v){ G = v; }

/* ---- seeded RNG: replayable via seed + call count --------------------- */
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}}
let rng = mulberry32(1);
export function rand(){ G.meta.rngCalls++; return rng(); }
export function ri(lo,hi){ return lo + Math.floor(rand()*(hi-lo+1)); }
export function pick(list){ return list[Math.floor(rand()*list.length)]; }
export function seedRng(seed){ rng = mulberry32(seed); }
export function reseedRng(){ rng = mulberry32(G.meta.seed); for(let i=0;i<G.meta.rngCalls;i++) rng(); }

/* ---- new game --------------------------------------------------------- */
export function newGame(){
  return {
    saveVersion: SAVE_VERSION,
    meta:{ build:BUILD, ironman:false,
           seed:(Date.now()^(Math.random()*0xffffffff))>>>0, rngCalls:0 },
    screen:"title",
    player:{ created:false, name:"",
      skills:{driving:0,gunnery:0,mechanics:0,scrounge:0}, xp:0, injuries:[],
      appearance:{ body:null, build:null, hair:null, face:null, clothing:null, accessory:null } },
    scrap:0,
    inventory:[],
    vehicles:[],
    activeVehicle:0,
    crew:[],
    world:{ location:"kettle_rock", day:1, fuel:0, water:0, food:0, ammoReserve:0 },
    rep:{ fame:0, respect:0, fear:0, popularity:0,
      factions:{ militia:0, merchants:0, mechanics:0, scavengers:0,
                 crucible:0, civilians:0, gangs:0, raiders:0 } },
    career:{ wins:0, losses:0, streak:0, bestStreak:0,
      crucibleWins:0, crucibleLosses:0, championships:0,
      contractsDone:0, contractsFailed:0, contractsExpired:0,
      scrapEarned:0, scrapSpent:0, salvageRecovered:0, distance:0,
      rescued:0, abandoned:0, killed:0, betrayals:0,
      promisesKept:0, promisesBroken:0,
      locationsDiscovered:[], settlementsVisited:["kettle_rock"], discoveries:[] },
    /* v5: Job Board, rumors, disputes — see docs/ARCHITECTURE.md */
    jobs:{ offersDay:0, offers:[], active:null, cooldowns:{}, resolutions:{},
           history:[], emergencyDay:0, knowledge:{}, reflex:{ dayDone:0, run:null } },
    rumors:[],
    debts:[],
    disputes:{},
    history:{},
    npcs:{},
    journal:[],
    narrative:{ recent:[] },
    campaign:{ beatsDone:[], flags:{} },
    combat:null,
    log:[],
  };
}

/* ---- defaults recovery: one place, not scattered undefined checks ----- */
export function ensureDefaults(s){
  const fresh = newGame();
  const fill = (dst, src) => {
    for(const k of Object.keys(src)){
      if(dst[k] === undefined || dst[k] === null && src[k] !== null && typeof src[k] === "object"){
        dst[k] = JSON.parse(JSON.stringify(src[k]));
      } else if(dst[k] && typeof dst[k]==="object" && !Array.isArray(dst[k])
             && src[k] && typeof src[k]==="object" && !Array.isArray(src[k])){
        fill(dst[k], src[k]);
      }
    }
  };
  fill(s, fresh);
  if(!Array.isArray(s.journal)) s.journal = [];
  if(!Array.isArray(s.narrative.recent)) s.narrative.recent = [];
  if(!Array.isArray(s.rumors)) s.rumors = [];
  if(!Array.isArray(s.debts)) s.debts = [];
  if(!Array.isArray(s.jobs.offers)) s.jobs.offers = [];
  if(!Array.isArray(s.jobs.history)) s.jobs.history = [];
  s.vehicles.forEach(v=>{
    v.dmg = v.dmg || {hull:0,tires:0,plant:0};
    v.weapons.forEach(w=>{ if(w.dmgd===undefined) w.dmgd=false; });
    v.history = v.history || {};
    const h = v.history;
    const hDef = { originalChassis:v.chassis, acquiredDay:1, previousOwners:[],
      mileage:0, wins:0, losses:0, kills:0, majorRepairs:0, installs:0, removals:0, championships:0 };
    for(const k of Object.keys(hDef)) if(h[k]===undefined) h[k]=JSON.parse(JSON.stringify(hDef[k]));
  });
  return s;
}

/* ---- migrations: explicit chain, each maps one version forward -------- */
const MIGRATIONS = {
  1: s => {                                   // v1 scaffold -> v2 slice-1
    s.driver.created = !!s.driver.created;
    s.driver.name = s.driver.name==="Nameless" ? "" : (s.driver.name||"");
    s.meta.version = 2;
  },
  2: s => {                                   // v2 -> v3 combat fields
    s.vehicles.forEach(v=>{
      v.dmg = v.dmg || {hull:0,tires:0,plant:0};
      v.weapons.forEach(w=>{ if(w.dmgd===undefined) w.dmgd=false; });
    });
    s.campaign.flags.arena = s.campaign.flags.arena || {q:0,p:0,t:0};
    s.combat = s.combat || null;
    s.meta.version = 3;
  },
  3: s => {                                   // v3 -> v4 milestone-3 schema
    s.saveVersion = 4;
    delete s.meta.version;
    // driver -> player
    const d = s.driver || {};
    s.player = { created:!!d.created, name:d.name||"",
      skills:d.skills||{driving:0,gunnery:0,mechanics:0,scrounge:0},
      xp:d.xp||0, injuries:d.injuries||[],
      appearance:{ body:null, build:null, hair:null, face:null, clothing:null, accessory:null } };
    delete s.driver;
    s.activeVehicle = 0;
    // world resources
    const w = s.world || {};
    s.world = { location:w.location||"kettle_rock", day:w.day||1,
      fuel:w.fuel||0, water:0, food:w.supplies||0, ammoReserve:0 };
    // faction rep -> multidimensional rep
    const fr = (w.factionRep)||{};
    const arena = (s.campaign && s.campaign.flags && s.campaign.flags.arena) || {q:0,p:0,t:0};
    const wins = (arena.q||0)+(arena.p||0)+(arena.t||0);
    s.rep = { fame:Math.min(20,wins), respect:Math.min(20,wins),
      fear:0, popularity:Math.min(20,wins),
      factions:{ militia:fr.militias||0, merchants:fr.combine||0, mechanics:0,
                 scavengers:0, crucible:wins, civilians:0, gangs:fr.gangs||0,
                 raiders:0, zealots:fr.zealots||0 } };
    // career + npc memory from arena record
    s.career = { wins, losses:0, streak:0, bestStreak:0,
      crucibleWins:wins, crucibleLosses:0, championships:arena.t||0,
      contractsDone:0, contractsFailed:0, scrapEarned:0, scrapSpent:0,
      salvageRecovered:0, distance:0, rescued:0, abandoned:0, killed:0,
      betrayals:0, promisesKept:0, promisesBroken:0,
      locationsDiscovered:[], settlementsVisited:["kettle_rock"], discoveries:[] };
    s.history = {};
    if(arena.q) s.history.defeatedOdo = arena.q;
    if(arena.p) s.history.defeatedKess = arena.p;
    if(arena.t) s.history.defeatedBruna = arena.t;
    s.npcs = {};
    const mem = (n)=>({ encounterCount:n, lossesToPlayer:n, winsVsPlayer:0,
      relationship:0, disposition:"neutral", alive:true, memoryFlags:{} });
    if(arena.q) s.npcs.odo = mem(arena.q);
    if(arena.p) s.npcs.kess = mem(arena.p);
    if(arena.t) s.npcs.bruna = mem(arena.t);
    s.journal = [];
    s.narrative = { recent:[] };
    s.inventory = s.inventory||[];
    s.vehicles.forEach(v=>{ v.id = v.id || ("v"+Math.floor(Math.random()*1e9)); });
    s.saveVersion = 4;
  },
  4: s => {                                   // v4 -> v5: jobs, rumors, disputes
    s.jobs = { offersDay:0, offers:[], active:null, cooldowns:{}, resolutions:{},
               history:[], emergencyDay:0, knowledge:{}, reflex:{ dayDone:0, run:null } };
    s.rumors = [];                            // structured rumor records
    s.debts = [];                             // deferred payments owed to the player
    s.disputes = {};                          // disputeId -> persisted truth/assets/resolution
    s.career.contractsExpired = s.career.contractsExpired || 0;
    s.saveVersion = 5;
  },
};

export function migrate(s){
  let v = s.saveVersion || (s.meta && s.meta.version) || 1;
  while(v < SAVE_VERSION){
    const m = MIGRATIONS[v];
    if(!m) throw new Error("No migration from save version "+v);
    m(s);
    v = s.saveVersion || s.meta.version;
  }
  return ensureDefaults(s);
}

/* ---- persistence ------------------------------------------------------ */
let saveTimer = null;
export function save(){
  clearTimeout(saveTimer);
  saveTimer = setTimeout(()=>{ try{ LS.setItem(SAVE_KEY, JSON.stringify(G)); }catch(e){ console.error("autosave failed:", e); } }, 150);
}
export function saveNow(){ try{ LS.setItem(SAVE_KEY, JSON.stringify(G)); }catch(e){ console.error("save failed:", e); } }

export function loadSave(){
  const raw = LS.getItem(SAVE_KEY);
  if(!raw) return null;
  try{
    const parsed = JSON.parse(raw);
    const ver = parsed.saveVersion || (parsed.meta && parsed.meta.version) || 1;
    if(ver < SAVE_VERSION) LS.setItem(BACKUP_KEY, raw);   // pre-migration backup
    return migrate(parsed);
  }catch(e){
    console.error("ROADGRAVE: save failed to load — booting fresh. Backup preserved. ", e);
    return null;
  }
}
export function hasSave(){ return !!LS.getItem(SAVE_KEY); }
export function eraseSave(){ LS.removeItem(SAVE_KEY); }

export function exportSave(){ return SAVE_PREFIX + b64encode(JSON.stringify(G)); }
export function importSave(str){
  str = (str||"").trim();
  if(!str.startsWith(SAVE_PREFIX)) throw new Error("Not a ROADGRAVE save string.");
  const s = migrate(JSON.parse(b64decode(str.slice(SAVE_PREFIX.length))));
  setG(s); reseedRng(); save();
}
function b64encode(s){
  if(typeof btoa!=="undefined") return btoa(unescape(encodeURIComponent(s)));
  return Buffer.from(s,"utf8").toString("base64");
}
function b64decode(s){
  if(typeof atob!=="undefined") return decodeURIComponent(escape(atob(s)));
  return Buffer.from(s,"base64").toString("utf8");
}

/* ---- display log (UI ticker, not the journal) ------------------------- */
export function logMsg(t){ G.log.push(t); if(G.log.length>60) G.log.shift(); }
