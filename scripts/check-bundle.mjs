// Builds the demo for production and fails if any of the detector made it
// into the bundle: the Vue plugin must reduce to an empty install().
import { execSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = path.join(ROOT, "demo/dist/assets");
execSync("npm --prefix demo run build", { cwd: ROOT, stdio: "inherit" });

const needles = ["[vue-leak]", "FinalizationRegistry", "$Heap", "__leakMarker"];
const found = readdirSync(ASSETS)
  .filter((f) => f.endsWith(".js"))
  .flatMap((f) => {
    const code = readFileSync(path.join(ASSETS, f), "utf8");
    return needles.filter((n) => code.includes(n)).map((n) => `${f}: ${n}`);
  });
if (found.length > 0) {
  console.error(`Detector code in the production bundle:\n  ${found.join("\n  ")}`);
  process.exit(1);
}
console.log("Production bundle is free of the detector.");
