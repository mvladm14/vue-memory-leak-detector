// Builds and packs the detector, then installs the TARBALL into demo/ — the
// way users get it, and the only way the demo gets a single copy of vue (a
// `file:..` link would resolve the root's own copy).
import { execSync } from "node:child_process";
import { readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEMO = path.join(ROOT, "demo");
const sh = (cmd, cwd) => execSync(cmd, { cwd, stdio: "inherit" });
const tarballs = () => readdirSync(ROOT).filter((f) => /^vue-memory-leak-detector-.*\.tgz$/.test(f));

sh("npm run build", ROOT);
for (const f of tarballs()) rmSync(path.join(ROOT, f));
sh("npm pack", ROOT);
const [tgz] = tarballs();
if (!tgz) throw new Error("npm pack produced no tarball");
sh("npm install", DEMO);
sh(`npm install --no-save "${path.join(ROOT, tgz)}"`, DEMO);
// Vite caches pre-bundled dependencies: drop the old detector.
rmSync(path.join(DEMO, "node_modules/.vite"), { recursive: true, force: true });
