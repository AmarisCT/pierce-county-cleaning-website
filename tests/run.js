#!/usr/bin/env node
// Checks: estimator math, every built page exists with title/description, internal links resolve,
// no forbidden claims in public pages, and scripts parse.
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const ROOT = path.join(__dirname, "..");
const SITE = path.join(ROOT, "site");
let failures = 0;
function check(name, fn) {
  try { fn(); console.log("ok  " + name); }
  catch (e) { failures++; console.log("FAIL " + name + "\n     " + e.message); }
}

// Load prices.js in a fake browser global
global.window = {};
const { pccsEstimate } = require(path.join(ROOT, "src/assets/prices.js"));
const P = global.window.PCCS_PRICES;

check("estimate: 2 bed/1 bath standard is $210", () => assert.strictEqual(pccsEstimate(P, "2-1", "standard", []).total, 210));
check("estimate: add-ons are added", () => assert.deepStrictEqual(pccsEstimate(P, "3-2", "deep", ["fridge", "oven"]), { base: 375, extras: 70, total: 445 }));
check("estimate: unknown service returns null", () => assert.strictEqual(pccsEstimate(P, "2-1", "commercial", []), null));
check("estimate: every service has every size", () => {
  for (const [k, s] of Object.entries(P.services)) for (const z of P.sizes) assert.ok(s.prices[z.id] > 0, `${k} missing ${z.id}`);
});

const pages = fs.readdirSync(SITE).filter(f => f.endsWith(".html"));
check("site has 11 pages", () => assert.strictEqual(pages.length, 11));
for (const f of pages) {
  const html = fs.readFileSync(path.join(SITE, f), "utf8");
  check(`${f}: title and description`, () => {
    assert.match(html, /<title>[^<]{10,}<\/title>/);
    assert.match(html, /<meta name="description" content="[^"]{40,}">/);
  });
  check(`${f}: internal links resolve`, () => {
    const links = [...html.matchAll(/href="([^"#:?]+\.(?:html|css|xml))(?:[?#][^"]*)?"/g)].map(m => m[1]);
    for (const l of links) assert.ok(fs.existsSync(path.join(SITE, l)), `missing ${l}`);
  });
  check(`${f}: no unverified claims`, () => {
    const text = html.replace(/<!--[\s\S]*?-->/g, "").toLowerCase();
    for (const bad of ["insured", "bonded", "5-star", "five-star", "testimonial", "certified"]) assert.ok(!text.includes(bad), `contains "${bad}"`);
  });
}
for (const js of ["config.js", "prices.js", "site.js", "quote.js"]) {
  check(`${js} parses`, () => new Function(fs.readFileSync(path.join(SITE, "assets", js), "utf8")));
}

// Quote & invoice email script
require("./apps-script.test.js")(check);
check("apps-script/Code.gs has the same prices as the website", () => {
  const code = fs.readFileSync(path.join(ROOT, "apps-script", "Code.gs"), "utf8");
  const m = code.match(/const PRICES = (\{[\s\S]*?\n\});/);
  assert.ok(m, "PRICES block not found");
  assert.deepStrictEqual(JSON.parse(m[1]), JSON.parse(JSON.stringify(P)));
});

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
