const { copyFileSync } = require("node:fs");
const { resolve } = require("node:path");

const source = resolve(__dirname, "..", "manifest.chrome.json");
const target = resolve(__dirname, "..", "manifest.json");

copyFileSync(source, target);
console.log("Synced manifest.chrome.json -> manifest.json");
