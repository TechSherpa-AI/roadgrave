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
import { bearing, canFire } from "../js/combat.js";   // pure helpers for the fight driver

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
const expectExit = async label => ok(await has('button.exit[data-act="go"][data-to="hub"]'), "Main Street exit: "+label);
const scrollY = () => page.evaluate(()=>window.scrollY);
/* appearance groups: 6 categories × 3 chips, no chip orphaned flush-left
   under the next category label (wrapped chips indent past the label) */
const appearanceGrouped = (pg=page) => pg.evaluate(()=>{
  const rows = [...document.querySelectorAll(".approw")];
  return rows.length===6 && rows.every(r=>{
    const lbl = r.querySelector(".applbl").getBoundingClientRect();
    const chips = [...r.querySelectorAll(".appopts .chip")];
    return chips.length===3 && chips.every(c=>c.getBoundingClientRect().left >= lbl.right-1);
  });
});

try{
  /* ---- boot + creation ------------------------------------------------ */
  await page.goto("http://localhost:8952/");
  await page.waitForTimeout(600);
  ok(await page.evaluate(()=>document.body.innerText.includes("ROADGRAVE")), "title renders");

  /* ---- settings before a career: contextual Back, no Main Street exit --- */
  await tap('[data-act="go"][data-to="settings"]');
  ok(await page.evaluate(()=>{
    const b=document.querySelector('button[data-act="go"][data-to="title"]');
    return !!b && b.textContent.includes("Back") && !document.querySelector("button.exit");
  }), "settings before creation shows Back (to title), no Main Street exit");
  await tap('button[data-act="go"][data-to="title"]');

  await page.evaluate(()=>{ [...document.querySelectorAll("button")].find(b=>b.textContent.includes("New Game")).click(); });
  await page.waitForTimeout(200);
  await page.fill("#dname", "Smoke");

  /* ---- stabilization: appearance grouping + same-screen scroll/focus --- */
  ok(await appearanceGrouped(), "appearance categories keep their chips as one group");
  await noHScroll("create"); await shot("m31a-create");
  await page.evaluate(()=>document.querySelector(".approw:last-of-type").scrollIntoView({block:"center"}));
  await page.waitForTimeout(80);
  const yChip = await scrollY();
  await tap('.approw:last-of-type .chip');
  ok(yChip>0 && Math.abs(await scrollY()-yChip)<=2, "same-screen chip tap preserves scroll ("+yChip+")");
  ok(await page.evaluate(()=>{ const a=document.activeElement;
     return !!(a && a.classList && a.classList.contains("chip")); }),
     "chip tap restores focus to the activated control");

  await tap('[data-act="skillMod"][data-skill="gunnery"][data-delta="1"]');
  ok(await page.evaluate(()=>{ const a=document.activeElement;
     return !!(a && a.dataset && a.dataset.act==="skillMod" && a.dataset.skill==="gunnery"); }),
     "skill +/- restores focus after rerender");
  await tap('[data-act="skillMod"][data-skill="gunnery"][data-delta="1"]');
  await tap('[data-act="skillMod"][data-skill="driving"][data-delta="1"]');

  /* ---- boundary: the tap that disables its own control ------------------ */
  await tap('[data-act="skillMod"][data-skill="gunnery"][data-delta="1"]');  // -> 3
  const yCap = await scrollY();
  await tap('[data-act="skillMod"][data-skill="gunnery"][data-delta="1"]');  // -> 4, "+" disables
  ok(Math.abs(await scrollY()-yCap)<=2, "cap-hitting tap preserves scroll");
  ok(await page.evaluate(()=>{
    const a=document.activeElement;
    return !!(a && a!==document.body && !a.disabled && !a.classList.contains("danger")
      && a.dataset && a.dataset.act==="skillMod" && a.dataset.skill==="gunnery");
  }), "focus falls back to an enabled non-danger control in the same group");
  await tap('[data-act="skillMod"][data-skill="gunnery"][data-delta="-1"]'); // -> 3
  await tap('[data-act="skillMod"][data-skill="gunnery"][data-delta="-1"]'); // -> 2 (original flow)

  await tap('[data-act="createDone"]');
  let s = await state();
  ok(s.player.created && s.scrap===100, "driver created with severance");
  ok(await scrollY()===0, "navigation to a new screen starts at the top");

  /* ---- stabilization: yard chassis cards + locked presentation --------- */
  await tap('button.small[data-act="go"][data-to="garage"]');
  ok(await page.evaluate(()=>{
    const cards=[...document.querySelectorAll(".chassiscard")];
    return cards.length===3 && cards.every(c=>
      c.querySelectorAll(".chassisart img").length===1 &&
      c.querySelectorAll('button[data-act="buyChassis"]').length===1);
  }), "each chassis image pairs with exactly one stat card");
  ok(await page.evaluate(()=>{
    const locked=[...document.querySelectorAll(".chassiscard.locked")];
    return locked.length>=1 && locked.every(c=>{
      const b=c.querySelector("button");
      return b.disabled && b.textContent.includes("more scrap needed");
    });
  }), "unaffordable chassis read as locked and state the missing scrap");
  await noHScroll("yard"); await shot("m31a-yard");
  await expectExit("yard");
  await tap("button.exit");
  s = await state();
  ok(s.screen==="hub", "Leave for Main Street returns to the hub");

  /* ---- settings during an active career: shared Main Street exit ------- */
  await tap('button.small[data-act="go"][data-to="settings"]');
  ok(await page.evaluate(()=>{
    const b=document.querySelector('button.exit[data-act="go"][data-to="hub"]');
    return !!b && b.textContent.includes("Leave for Main Street");
  }), "settings with an active career uses the shared Main Street exit");
  await tap("button.exit");
  s = await state();
  ok(s.screen==="hub", "settings exit returns to the hub");

  /* ---- job board: persisted offers + emergency labor ------------------ */
  await tap('[data-act="go"][data-to="jobs"]');
  await noHScroll("jobs"); await shot("m31a-jobs");
  await expectExit("job board");
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
  await expectExit("contract detail");
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
  await expectExit("slag bar");
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
  await expectExit("journal");

  /* ---- knowledge quiz with REMEMBER ----------------------------------- */
  await tap('[data-act="go"][data-to="hub"]');
  await tap('[data-act="go"][data-to="jobs"]');
  ok(await page.evaluate(()=>document.body.innerText.includes("SOUNDS FAMILIAR"))
     || (await state()).rumors.length<4, "familiar signal shows when a rumor matches an offer");
  await tap('[data-act="startQuiz"]');
  await noHScroll("quiz"); await shot("m31a-quiz");
  await expectExit("knowledge activity");
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
  await expectExit("completed pest activity");
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

  /* ---- stabilization: workshop same-screen scroll/focus + exits -------- */
  await expectExit("workshop");
  await page.evaluate(()=>document.querySelector('[data-act="faceWeapon"][data-i="0"]').scrollIntoView({block:"center"}));
  await page.waitForTimeout(80);
  const yWork = await scrollY();
  await tap('[data-act="faceWeapon"][data-i="0"]');
  ok(yWork>0 && Math.abs(await scrollY()-yWork)<=2, "workshop action preserves scroll ("+yWork+")");
  ok(await page.evaluate(()=>{ const a=document.activeElement;
     return !!(a && a.dataset && a.dataset.act==="faceWeapon"); }),
     "workshop action restores focus to the same control");
  for(let i=0;i<3;i++) await tap('[data-act="faceWeapon"][data-i="0"]');   // full cycle back to F
  s = await state();
  ok(s.vehicles[0].weapons[0].facing==="F", "facing cycle returned to Front");

  /* ---- Crucible with mid-fight reload (existing flow) ------------------ */
  await tap('[data-act="go"][data-to="garage"]');
  ok(await scrollY()===0, "leaving the workshop lands at the top of the garage");
  await expectExit("garage");
  await tap('[data-act="go"][data-to="hub"]');
  await tap('button.small[data-act="go"][data-to="market"]');
  await expectExit("market");
  await tap("button.exit");
  await tap('[data-act="go"][data-to="arena"]');
  await expectExit("crucible lobby");
  await tap('[data-act="startBout"][data-id="q"]');
  ok(await has(".track"), "fight screen renders");
  ok(!(await has("button.exit")), "no Main Street exit mid-fight");
  guard=0;
  let reloadedMidFight = false;
  let prevGapSig = null;      // last round's relative geometry, for standoff detection
  while(guard++<120 && !(await has('[data-act="fightDone"]'))){
    if(guard===1){                       // mid-fight persistence, in anger
      await page.waitForTimeout(400);
      await page.reload(); await page.waitForTimeout(600);
      reloadedMidFight = true;
      ok(await has(".track"), "mid-fight reload restores the fight");
    }
    if(await has('[data-act="maneuver"][data-m="coast"]')){
      /* standoff escape: when the gap is frozen — same bearing/distance as
         last round at matched speed — and no live loaded weapon can fire
         (out of range/arc, or dry), brake to change relative position.
         Otherwise chase: accelerate while able, else coast. */
      s = await state();
      const c = s.combat, pv = s.vehicles[s.activeVehicle||0];
      let brake = false;
      if(c && pv){
        const brg = bearing(c.p, c.e);
        const live = pv.weapons.filter(w=>!w.dmgd && w.ammo>0);
        const noShot = !live.some(w=>canFire({st:c.p}, w, brg).ok);
        const sig = brg.arc+brg.dist+":"+c.p.speed+":"+c.e.speed;
        brake = noShot && c.p.speed===c.e.speed && c.p.speed>0 && sig===prevGapSig;
        prevGapSig = sig;
      }
      if(brake && await page.$('[data-act="maneuver"][data-m="brake"]:not([disabled])'))
        await tap('[data-act="maneuver"][data-m="brake"]');
      else if(await page.$('[data-act="maneuver"][data-m="accel"]:not([disabled])'))
        await tap('[data-act="maneuver"][data-m="accel"]');
      else await tap('[data-act="maneuver"][data-m="coast"]');
    }
    let fg=0;
    while(fg++<6 && await page.$('[data-act="fire"]:not([disabled])') && !(await has('[data-act="fightDone"]')))
      await page.click('[data-act="fire"]:not([disabled])').then(()=>page.waitForTimeout(100));
    if(await page.$('[data-act="endTurn"]')) await tap('[data-act="endTurn"]');
  }
  let stallDiag = "";
  if(guard>=120 && !(await has('[data-act="fightDone"]'))){
    s = await state();
    const c = s.combat || {};
    const pv = (s.vehicles||[])[s.activeVehicle||0] || {weapons:[]};
    const brg = c.p && c.e ? bearing(c.p, c.e) : {arc:"?", dist:"?"};
    const ammo = ws => (ws||[]).map(w=>w.id+(w.dmgd?"(dmgd)":"")+":"+w.ammo).join(" ");
    stallDiag = ` — STALL seed=${s.meta&&s.meta.seed} round=${c.round} phase=${c.phase}`
      + ` p={pos:${c.p&&c.p.pos},lane:${c.p&&c.p.lane},speed:${c.p&&c.p.speed}}`
      + ` e={pos:${c.e&&c.e.pos},lane:${c.e&&c.e.lane},speed:${c.e&&c.e.speed}}`
      + ` bearing=${brg.arc}${brg.dist}`
      + ` dmg p=${JSON.stringify(pv.dmg)} e=${JSON.stringify(c.foeV&&c.foeV.dmg)}`
      + ` ammo p=[${ammo(pv.weapons)}] e=[${ammo(c.foeV&&c.foeV.weapons)}]`;
  }
  ok(guard<120 && reloadedMidFight, "bout completes through the UI after mid-fight reload"+stallDiag);
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

  /* ---- viewport sweep: 375x667 portrait + desktop ----------------------- */
  for(const [w,h,label] of [[375,667,"375x667"],[1280,800,"desktop"]]){
    const ctx = await browser.newContext({viewport:{width:w,height:h}});
    const p2 = await ctx.newPage();
    p2.on("pageerror", e=>consoleErrors.push(String(e)));
    await p2.goto("http://localhost:8952/");
    await p2.waitForTimeout(500);
    await p2.evaluate(()=>{ [...document.querySelectorAll("button")].find(b=>b.textContent.includes("New Game")).click(); });
    await p2.waitForTimeout(250);
    ok(await appearanceGrouped(p2), "appearance groups hold at "+label);
    ok(await p2.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1), "no horizontal scroll on create at "+label);
    if(shots) await p2.screenshot({path:join(shots,"m31a-create-"+label+".png"), fullPage:true});
    await p2.fill("#dname", "Vp");
    await p2.click('[data-act="createDone"]'); await p2.waitForTimeout(200);
    await p2.click('button.small[data-act="go"][data-to="garage"]'); await p2.waitForTimeout(200);
    ok(await p2.evaluate(()=>{
      const cards=[...document.querySelectorAll(".chassiscard")];
      return cards.length===3 && cards.every(c=>
        c.querySelectorAll(".chassisart img").length===1 &&
        c.querySelectorAll('button[data-act="buyChassis"]').length===1);
    }), "chassis pairing holds at "+label);
    ok(await p2.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1), "no horizontal scroll on yard at "+label);
    if(shots) await p2.screenshot({path:join(shots,"m31a-yard-"+label+".png"), fullPage:true});
    await ctx.close();
  }

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