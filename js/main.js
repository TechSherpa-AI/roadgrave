/* main.js — boot. */
import { G, setG, newGame, loadSave, seedRng, reseedRng, LS } from "./core.js";
import { render, SCREENS } from "./ui.js";

(function boot(){
  // dev mode: ?dev=1 turns it on persistently; ?dev=0 turns it off
  try{
    const q = new URLSearchParams(location.search);
    if(q.get("dev")==="1") LS.setItem("roadgrave.dev","1");
    if(q.get("dev")==="0") LS.removeItem("roadgrave.dev");
  }catch(e){}

  const loaded = loadSave();
  if(loaded){ setG(loaded); reseedRng(); }
  else { const g = newGame(); setG(g); seedRng(g.meta.seed); g.screen = "title"; }

  // live state handle for the browser smoke test / console debugging
  window.__RG_STATE = () => JSON.parse(JSON.stringify(G));

  if(!SCREENS[G.screen]) G.screen = "title";
  if(G.screen==="fight" && !G.combat) G.screen = "arena";
  if(G.campaign.flags.dead) G.screen = "legacy";
  if(G.campaign.flags.started && !G.player.created && !["title","settings"].includes(G.screen)) G.screen = "create";
  render();
})();
