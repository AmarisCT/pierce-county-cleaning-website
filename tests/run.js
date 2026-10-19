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
const srcPages = fs.readdirSync(path.join(ROOT, "src/pages")).filter(f => f.endsWith(".html"));
check(`site has every page (${srcPages.length})`, () => {
  assert.strictEqual(pages.length, srcPages.length);
  assert.ok(pages.length >= 20, "expected at least 20 pages");
});
check("favicon, touch icon and link preview image exist", () => {
  for (const f of ["favicon.svg", "apple-touch-icon.png", "og-image.jpg"]) assert.ok(fs.existsSync(path.join(SITE, "assets", f)), f);
});
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
    for (const bad of ["insured", "bonded", "5-star", "five-star", "testimonial", "certified", "employee", "employed by", "draft", "[date"]) assert.ok(!text.includes(bad), `contains "${bad}"`);
  });
}
// ---------- search (SEO) checks ----------
const read = f => fs.readFileSync(path.join(SITE, f), "utf8");
const ld = html => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
const nodes = html => ld(html).flatMap(d => d["@graph"] || [d]);
const visibleText = html => (html.match(/<main[^>]*>([\s\S]*?)<\/main>/) || ["", ""])[1]
  .replace(/<[^>]+>/g, " ").replace(/&\w+;/g, " ").toLowerCase().replace(/\s+/g, " ").trim();
const indexable = pages.filter(f => !read(f).includes('content="noindex"'));

for (const f of pages) {
  const html = read(f);
  check(`${f}: one h1, valid structured data`, () => {
    assert.strictEqual((html.match(/<h1[\s>]/g) || []).length, 1, "needs exactly one <h1>");
    ld(html); // throws if any JSON-LD block is invalid
  });
  check(`${f}: photos have width and height`, () => {
    for (const img of html.match(/<img src="assets\/photos\/[^>]+>/g) || []) assert.match(img, / width="\d+" height="\d+"/, img.slice(0, 80));
  });
}
check("titles and descriptions are unique", () => {
  for (const tag of [/<title>([^<]+)<\/title>/, /<meta name="description" content="([^"]+)">/]) {
    const seen = {};
    for (const f of indexable) { const v = read(f).match(tag)[1]; assert.ok(!seen[v], `${f} repeats ${seen[v]}: ${v}`); seen[v] = f; }
  }
});
check("descriptions are 70-170 characters", () => {
  for (const f of indexable) { const d = read(f).match(/<meta name="description" content="([^"]+)">/)[1]; assert.ok(d.length >= 70 && d.length <= 170, `${f}: ${d.length}`); }
});
check("home page describes the business for Google", () => {
  const biz = nodes(read("index.html")).find(n => n["@type"] === "LocalBusiness");
  assert.ok(biz, "LocalBusiness missing");
  assert.strictEqual(biz.name, "Pierce County Cleaning Services LLC");
  assert.ok(biz.areaServed.length >= 6 && biz.url && biz.email, "areaServed/url/email");
  assert.ok(!("aggregateRating" in biz) && !("review" in biz), "no ratings or reviews until they are real");
});
const cityPages = pages.filter(f => f.startsWith("house-cleaning-"));
check("six city pages, each with Service data for its city", () => {
  assert.strictEqual(cityPages.length, 6);
  for (const f of cityPages) {
    const svc = nodes(read(f)).find(n => n["@type"] === "Service");
    assert.ok(svc && /, WA$/.test(svc.areaServed.name), f);
  }
});
check("city pages are not copies of each other", () => {
  const shingles = t => { const w = t.split(" "), s = new Set(); for (let i = 0; i + 5 <= w.length; i++) s.add(w.slice(i, i + 5).join(" ")); return s; };
  const sets = cityPages.map(f => [f, shingles(visibleText(read(f)))]);
  for (let i = 0; i < sets.length; i++) for (let j = i + 1; j < sets.length; j++) {
    const [a, A] = sets[i], [b, B] = sets[j];
    const overlap = [...A].filter(x => B.has(x)).length / Math.min(A.size, B.size);
    assert.ok(overlap < 0.3, `${a} and ${b} share ${(overlap * 100).toFixed(0)}% of their wording`);
  }
});
check("service pages carry prices in their structured data", () => {
  for (const [f, key] of [["move-out-cleaning.html", "moveout"], ["deep-cleaning.html", "deep"]]) {
    const svc = nodes(read(f)).find(n => n["@type"] === "Service");
    const prices = Object.values(P.services[key].prices);
    assert.strictEqual(svc.offers.lowPrice, Math.min(...prices), f);
    assert.strictEqual(svc.offers.highPrice, Math.max(...prices), f);
  }
});
check("prices are in the HTML, not only added by JavaScript", () => {
  assert.strictEqual((read("services.html").match(/<tbody data-price-table><tr>/g) || []).length, 1, "price table empty");
  assert.match(read("index.html"), /data-from="standard">From \$\d+</);
  assert.match(read("move-out-cleaning.html"), /<td class="num">\$\d+<\/td>/);
});
check("sitemap lists every indexable page, and only those", () => {
  const xml = read("sitemap.xml");
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  assert.strictEqual(locs.length, indexable.length);
  assert.ok(!xml.includes("404.html"), "404 page should not be in the sitemap");
});
check("every page links to all six city pages (footer)", () => {
  for (const f of pages) for (const c of cityPages) assert.ok(read(f).includes(`href="${c}"`), `${f} -> ${c}`);
});

check("no reviews are written into the pages: they only come from the Reviews tab", () => {
  for (const f of pages) {
    const html = read(f);
    for (const m of html.matchAll(/<div class="reviews" data-reviews[^>]*>([\s\S]*?)<\/div>/g)) assert.strictEqual(m[1].trim(), "", f);
    assert.ok(!/class="review"/.test(html), `${f} has a review written into the page`);
  }
});
check("reviews page has the form and is kept out of search results", () => {
  const html = read("reviews.html");
  assert.ok(html.includes('id="review-form"') && html.includes('name="consent"'));
  assert.ok(html.includes('content="noindex"'));
});

for (const js of ["config.js", "prices.js", "site.js", "quote.js", "reviews.js"]) {
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
