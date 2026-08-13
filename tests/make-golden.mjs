/* Regenerate golden save fixtures from js/golden.js builders.
   Run after schema changes: node tests/make-golden.mjs */
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { GOLDEN } from "../js/golden.js";

const dir = join(dirname(fileURLToPath(import.meta.url)), "golden");
mkdirSync(dir, { recursive:true });
for(const [name, build] of Object.entries(GOLDEN)){
  const g = build.call(GOLDEN);
  writeFileSync(join(dir, name+".json"), JSON.stringify(g, null, 1));
  console.log("wrote", name+".json");
}
