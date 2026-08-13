/* Browser-level smoke test — `node tests/smoke.mjs`
   Plays the core player path through the real DOM at iPhone viewport:
   create -> emergency labor -> Job Board (persisted offers) -> accept &
   resolve a contract -> payment dispute -> Slag Bar rumors -> Journal
   Rumors -> knowledge quiz with REMEMBER -> pest control reflex task ->
   garage & workshop -> Crucible bout with MID-FIGHT RELOAD -> aftermath ->
   reload persistence. Fails on console errors and horizontal scroll.

   Local:  npm i playwright-core --no-save
           CHROMIUM_PATH=/path/to/chromium node tests/smoke.mjs
   CI:     npm i playwright --no-save && npx playwright install --with-deps chromium */
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const shots = process.env.SMOKE_SHOTS || "";
if(shots) mkdirSync(shots, {recursive:true});
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
const tap = async sel => { await page.click(sel); await page.waitForTimeout(140); };
const has = sel => page.$(sel).then(x=>!!x);
const state = () => page.evaluate(()=>window.__RG_STATE());
const noHScroll = async label => ok(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth+1), "no horizontal scroll: "+label);
const shot = async name => { if(shots) await page.screenshot({path:join(shots,name+".png")}); };

try{
  /* ---- boot + creation ------------------------------------------------ */
  await page.goto("http://localhost:8952/");
  await page.waitForTimeout(600);
  ok(await page.evaluate(()=>document.body.innerText.includes("ROADGRAVE")), "title renders");
  await page.evaluate(()=>{ [...document.querySelectorAll("button")].find(b=>b.textContent.includes("New Game")).click(); });
  await page.waitForTimeout(200);
  await page.fill("#dname", "Smoke");
  await tap('[data-act="skillMod"][data-skill="gunnery"][data-delta="1"]');
  await tap('[data-act="skillMod"][data-skill="gunnery"][data-delta="1"]');
  await tap('[data-act="skillMod"][data-skill="driving"][data-delta="1"]');
  await tap('[data-act="createDone"]');
  let s = await state();
  ok(s.player.created && s.scrap===100, "driver created with severance");

  /* ---- job board: persisted offers + emergency labor ------------------ */
  await tap('[data-act="go"][data-to="jobs"]');
  await noHScroll("jobs"); await shot("m31a-jobs");
  s = await state();
  ok(s.jobs.offers.length===3 && s.jobs.offersDay===s.world.day, "three daily offers persisted");
  const offerIds = s.jobs.offers.join(",");
  await page.reload(); await page.waitForTimeout(600);
  s = await state();
  ok(s.jobs.offers.join(",")===offerIds, "reload does not reroll offers");
  for(let i=0;i<3;i++){
    if(await page.$('[data-act="labor"]:not([disabled])')) await tap('[data-act="labor"]');
  }
  s = await state();
  ok(s.world.day===4 && s.scrap>=160, "three days of emergency labor banked (scrap "+s.scrap+")");
  ok(s.jobs.offersDay===s.world.day, "day advance refreshed the offers for the new day");

  /* ---- accept + resolve a contract ------------------------------------ */
  await tap('[data-act^="acceptContract"]');
  ok(await has('[data-act="approach"]'), "contract screen shows approaches");
  await noHScroll("contract"); await shot("m31a-contract");
  await page.click('[data-act="approach"]:not([disabled])');
  await page.waitForTimeout(250);
  s = await state();
  const rids = Object.keys(s.jobs.resolutions);
  ok(rids.length>=1 && s.jobs.active===null, "contract resolved and slot freed");
  ok(s.journal.some(j=>["contractDone","contractFailed"].includes(j.type)), "contract journaled");

  /* ---- payment dispute (inject a deterministic fixture) --------------- */
  await page.evaluate(()=>{
    const g = JSON.parse(localStorage.getItem("roadgrave.save"));
    g.disputes["d.smoke"] = { id:"d.smoke", contractId:"c.stallguard", employerNpcId:"marlo",
      employerFaction:"merchants", promisedPayment:50, truthState:"partial",
      cashOnHand:25, hiddenAssets:5, futurePaymentCapacity:20,
      witnessRisk:"high", resolved:false, resolution:null, recovered:0, day:g.world.day };
    g.screen = "jobs";
    localStorage.setItem("roadgrave.save", JSON.stringify(g));
  });
  await page.reload(); await page.waitForTimeout(600);
  ok(await has('[data-act="disputeChoice"]'), "payment-dispute panel appears");
  ok(!(await has('[data-act="disputeChoice"][data-choice="kill"]')), "lethal option gated for market employer");
  await shot("m31a-dispute");
  const scrapBeforeDispute = (await state()).scrap;
  let dGuard=0;   // a natural dispute from the contract may queue ahead of the fixture
  while(dGuard++<4 && await page.$('[data-act="disputeChoice"][data-choice="lenient"]'))
    await tap('[data-act="disputeChoice"][data-choice="lenient"]');
  s = await state();
  ok(s.disputes["d.smoke"].resolved && s.scrap>scrapBeforeDispute, "dispute resolved, partial cash recovered");
  ok(s.debts.length>=1, "remainder carried as a debt");

  /* ---- rumors at the Slag Bar ---------------------------------------- */
  await tap('[data-act="go"][data-to="hub"]');
  await tap('[data-act="go"][data-to="bar"]');
  for(let i=0;i<4;i++) if(await page.$('[data-act="rumor"]:not([disabled])')) await tap('[data-act="rumor"]');
  s = await state();
  ok(s.rumors.length>=3, "structured rumors learned and recorded ("+s.rumors.length+")");
  ok(s.journal.filter(j=>j.type==="rumor").length===s.rumors.length, "each rumor journaled once");

  /* ---- journal rumors section ----------------------------------------- */
  await tap('[data-act="go"][data-to="hub"]');
  await tap('[data-act="go"][data-to="journal"]');
  const journalText = await page.evaluate(()=>document.body.innerText);
  ok(/rumors/i.test(journalText) && /slag bar/i.test(journalText), "journal shows Rumors section");
  await noHScroll("journal");

  /* ---- knowledge quiz with REMEMBER ----------------------------------- */
  await tap('[data-act="go"][data-to="hub"]');
  await tap('[data-act="go"][data-to="jobs"]');
  ok(await page.evaluate(()=>document.body.innerText.includes("SOUNDS FAMILIAR"))
     || (await state()).rumors.length<4, "familiar signal shows when a rumor matches an offer");
  await tap('[data-act="startQuiz"]');
  await noHScroll("quiz"); await shot("m31a-quiz");
  const quiz = (await state());
  ok(quiz.screen==="quiz", "quiz starts");
  // q1, q2: answer correct (indices from data: 0 then 1)
  await tap('[data-act="answerQuiz"][data-i="0"]');
  await tap('[data-act="answerQuiz"][data-i="1"]');
  // q3 carries the rumor hint: REMEMBER should be present if rum.pumps learned
  s = await state();
  const knowsPumps = s.rumors.some(r=>r.id==="rum.pumps");
  if(knowsPumps){
    ok(await has('[data-act="remember"][data-id="rum.pumps"]'), "REMEMBER offered on the hinted question");
    await tap('[data-act="remember"][data-id="rum.pumps"]');
    ok(await page.evaluate(()=>document.body.innerText.includes("high-octane")), "REMEMBER shows the recollection");
    s = await state();
    ok(!s.jobs.knowledge["c.mechquiz"].done, "REMEMBER does not answer for the player");
  }
  const scrapBeforeQ3 = (await state()).scrap;
  await tap('[data-act="answerQuiz"][data-i="2"]');
  s = await state();
  ok(s.jobs.knowledge["c.mechquiz"].done && s.scrap===scrapBeforeQ3+40, "quiz sweep pays 40 exactly");

  /* ---- pest control reflex task --------------------------------------- */
  await tap('[data-act="startPest"]');
  await shot("m31a-pest"); await noHScroll("pest");
  let guard=0;
  while(guard++<20){
    s = await state();
    const run = s.jobs.reflex.run;
    if(!run || run.done) break;
    if(run.zone){ await page.click(`.pestzone[data-zone="${run.zone}"]`); }
    await page.waitForTimeout(480);
  }
  s = await state();
  ok(s.jobs.reflex.run && s.jobs.reflex.run.done, "reflex task completes");
  ok(s.jobs.reflex.run.hits>=4, "attentive play catches most pests ("+s.jobs.reflex.run.hits+"/6)");
  await tap('[data-act="pestDone"]');

  /* ---- garage + workshop (existing flow) ------------------------------- */
  await tap('[data-act="go"][data-to="hub"]');
  await tap('.maphot[data-to="garage"]');
  await tap('[data-act="buyChassis"][data-id="skiff"]');
  ok(await has('[data-act="setPlant"]'), "workshop opens after purchase");
  await tap('[data-act="setPlant"][data-id="junker"]');
  await tap('[data-act="buyWeapon"][data-id="scatter"]');
  s = await state();
  ok(s.vehicles[0].plant==="junker" && s.vehicles[0].weapons.length===1, "rig outfitted");

  /* ---- Crucible with mid-fight reload (existing flow) ------------------ */
  await tap('[data-act="go"][data-to="garage"]');
  await tap('[data-act="go"][data-to="hub"]');
  await tap('[data-act="go"][data-to="arena"]');
  await tap('[data-act="startBout"][data-id="q"]');
  ok(await has(".track"), "fight screen renders");
  guard=0;
  let reloadedMidFight = false;
  while(guard++<120 && !(await has('[data-act="fightDone"]'))){
    if(guard===1){                       // mid-fight persistence, in anger
      await page.waitForTimeout(400);
      await page.reload(); await page.waitForTimeout(600);
      reloadedMidFight = true;
      ok(await has(".track"), "mid-fight reload restores the fight");
    }
    if(await has('[data-act="maneuver"][data-m="coast"]')){
      if(await page.$('[data-act="maneuver"][data-m="accel"]:not([disabled])'))
        await tap('[data-act="maneuver"][data-m="accel"]');
      else await tap('[data-act="maneuver"][data-m="coast"]');
    }
    let fg=0;
    while(fg++<6 && await page.$('[data-act="fire"]:not([disabled])') && !(await has('[data-act="fightDone"]')))
      await page.click('[data-act="fire"]:not([disabled])').then(()=>page.waitForTimeout(100));
    if(await page.$('[data-act="endTurn"]')) await tap('[data-act="endTurn"]');
  }
  ok(guard<120 && reloadedMidFight, "bout completes through the UI after mid-fight reload");
  await tap('[data-act="fightDone"]');
  s = await state();
  ok(s.career.crucibleWins + s.career.crucibleLosses === 1, "career records the bout");

  /* ---- final persistence ----------------------------------------------- */
  const finalScrap = s.scrap;
  await page.waitForTimeout(400);
  await page.reload(); await page.waitForTimeout(600);
  s = await state();
  ok(s.scrap===finalScrap && s.player.name==="Smoke" && s.rumors.length>=3
     && Object.keys(s.jobs.resolutions).length>=1, "full state survives reload");
  await noHScroll("final");

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