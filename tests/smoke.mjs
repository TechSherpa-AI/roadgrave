/* Browser-level smoke test — `node tests/smoke.mjs`
   Boots the real game in headless Chromium and plays the core path through
   the actual DOM: new game -> character creation -> shifts for scrap ->
   buy chassis -> fit plant + weapon -> Crucible qualifier -> full fight ->
   aftermath -> journal entry -> reload persistence. Fails on console errors.

   Local:  npm i playwright-core --no-save
           CHROMIUM_PATH=/path/to/chromium node tests/smoke.mjs
   CI:     npm i playwright --no-save && npx playwright install --with-deps chromium */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIME = { ".html":"text/html", ".js":"text/javascript", ".mjs":"text/javascript",
  ".jpg":"image/jpeg", ".png":"image/png", ".mp4":"video/mp4", ".json":"application/json" };
const server = createServer((req,res)=>{
  let p = req.url.split("?")[0];
  if(p==="/") p = "/index.html";
  const file = join(root, p);
  if(!existsSync(file)){ res.writeHead(404); res.end(); return; }
  res.writeHead(200, {"Content-Type": MIME[extname(file)]||"application/octet-stream"});
  res.end(readFileSync(file));
});
await new Promise(r=>server.listen(8952, r));

let chromium;
try{ ({chromium} = await import("playwright")); }
catch{ ({chromium} = await import("playwright-core")); }

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport:{width:390, height:844} });
const consoleErrors = [];
page.on("console", m=>{ if(m.type()==="error") consoleErrors.push(m.text()); });
page.on("pageerror", e=>consoleErrors.push(String(e)));

let pass=0, fail=0; const failures=[];
const ok = (c,l)=>{ if(c) pass++; else { fail++; failures.push(l); console.error("  ✗", l); } };
const tap = async sel => { await page.click(sel); await page.waitForTimeout(120); };
const has = sel => page.$(sel).then(x=>!!x);
const state = () => page.evaluate(()=>window.__RG_STATE());

try{
  // fresh boot -> title
  await page.goto("http://localhost:8952/");
  await page.waitForTimeout(600);
  ok(await page.evaluate(()=>document.body.innerText.includes("ROADGRAVE")), "title renders");

  // new game -> creation
  await page.evaluate(()=>{ [...document.querySelectorAll("button")].find(b=>b.textContent.includes("New Game")).click(); });
  await page.waitForTimeout(200);
  ok(await has("#dname"), "creation screen shows");
  await page.fill("#dname", "Smoke");
  await tap('[data-act="skillMod"][data-skill="driving"][data-delta="1"]');
  await tap('[data-act="skillMod"][data-skill="gunnery"][data-delta="1"]');
  await tap('[data-act="appSet"][data-cat="hair"][data-opt="mohawk"]');
  await tap('[data-act="createDone"]');
  let s = await state();
  ok(s.player.created && s.player.name==="Smoke" && s.scrap===100, "driver created with severance");
  ok(s.player.appearance.hair==="mohawk", "appearance choice stored");

  // earn scrap: 4 shifts
  await tap('[data-act="go"][data-to="jobs"]');
  for(let i=0;i<4;i++) await tap('[data-act="workShift"][data-id="wrench"]');
  s = await state();
  ok(s.scrap>=240 && s.world.day===5, "shifts pay and advance days (scrap "+s.scrap+")");

  // buy + outfit rig through the workshop UI
  await tap('[data-act="go"][data-to="hub"]');
  await tap('.maphot[data-to="garage"]');
  await tap('[data-act="buyChassis"][data-id="skiff"]');
  ok(await has('[data-act="setPlant"]'), "workshop opens after chassis purchase");
  await tap('[data-act="setPlant"][data-id="junker"]');
  await tap('[data-act="buyWeapon"][data-id="scatter"]');
  await tap('[data-act="armorMod"][data-f="F"][data-delta="1"]');
  s = await state();
  ok(s.vehicles[0].plant==="junker" && s.vehicles[0].weapons.length===1 && s.vehicles[0].armor.F===1,
     "rig outfitted via UI");

  // into the Crucible
  await tap('[data-act="go"][data-to="garage"]');
  await tap('[data-act="go"][data-to="hub"]');
  await tap('[data-act="go"][data-to="arena"]');
  await tap('[data-act="startBout"][data-id="q"]');
  ok(await has(".track"), "fight screen renders the lane grid");

  // play the whole bout through the DOM
  let guard=0;
  while(guard++<120 && !(await has('[data-act="fightDone"]'))){
    if(await has('[data-act="maneuver"][data-m="coast"]')){
      if(await page.$('[data-act="maneuver"][data-m="accel"]:not([disabled])'))
        await tap('[data-act="maneuver"][data-m="accel"]');
      else await tap('[data-act="maneuver"][data-m="coast"]');
    }
    let fguard=0;
    while(fguard++<6 && await page.$('[data-act="fire"]:not([disabled])') && !(await has('[data-act="fightDone"]')))
      await page.click('[data-act="fire"]:not([disabled])').then(()=>page.waitForTimeout(100));
    if(await page.$('[data-act="endTurn"]')) await tap('[data-act="endTurn"]');
  }
  ok(guard<120, "bout completes through the UI ("+guard+" turns)");
  s = await state();
  const result = s.combat && s.combat.result;
  ok(result==="win"||result==="lose", "bout resolved ("+result+")");
  await tap('[data-act="fightDone"]');
  s = await state();
  ok(s.combat===null, "aftermath exits cleanly");
  ok(s.career.crucibleWins + s.career.crucibleLosses === 1, "career records the bout");
  ok(s.journal.some(j=>j.type==="boutWin"||j.type==="boutLoss"), "journal recorded the bout");
  ok(s.npcs.odo && s.npcs.odo.encounterCount===1, "rival memory recorded the encounter");

  // reload persistence: same screen, same scrap (allow the debounced
  // autosave to flush before reloading)
  const scrapBefore = s.scrap;
  await page.waitForTimeout(400);
  await page.reload(); await page.waitForTimeout(600);
  s = await state();
  ok(s.scrap===scrapBefore && s.player.name==="Smoke", "state survives reload");
  ok(await page.evaluate(()=>document.body.innerText.length>100), "post-reload screen renders");

  const realErrors = consoleErrors.filter(e=>!e.includes("404"));
  ok(realErrors.length===0, "no console errors ("+(realErrors.join(" | ")||"clean")+")");
}catch(e){
  fail++; failures.push("smoke crashed: "+e.message);
  console.error(e);
}

await browser.close();
server.close();
console.log(`\nsmoke: ${pass} passed, ${fail} failed`);
if(fail){ console.error("FAILURES:", failures); process.exit(1); }
