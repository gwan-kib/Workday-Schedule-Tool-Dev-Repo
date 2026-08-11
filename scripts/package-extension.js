import { copyFile, cp, mkdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SUPPORTED_BROWSERS = new Set(["chrome", "firefox"]);
const browser = process.argv[2];

if (!SUPPORTED_BROWSERS.has(browser)) {
  console.error("Usage: node scripts/package-extension.js <chrome|firefox>");
  process.exit(1);
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, "..");
const outputDir = join(rootDir, "build", browser);
const manifestSource = join(rootDir, `manifest.${browser}.json`);
const icons = ["icon16.png", "icon32.png", "icon48.png", "icon128.png"];

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

await cp(join(rootDir, "dist"), join(outputDir, "dist"), { recursive: true });
await copyFile(manifestSource, join(outputDir, "manifest.json"));
await Promise.all(icons.map((icon) => copyFile(join(rootDir, icon), join(outputDir, icon))));

console.log(`Packaged ${browser} extension at build/${browser}`);
