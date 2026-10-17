#!/usr/bin/env node
// Builds the static site: src/pages/*.html (content fragments) + layout -> site/
// No dependencies. Run: node build.js
//
// Photos: pages place photos with {{photo name="hero" tone="light" alt="..." note="..."}}.
// Drop a file named <name>.jpg / .jpeg / .png / .webp into src/assets/photos/ and rebuild:
// it replaces the toned placeholder. Missing photos are listed when you build.
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "src");
const OUT = path.join(__dirname, "site");
const PHOTOS = path.join(SRC, "assets", "photos");
const SITE_URL = (process.env.SITE_URL || "https://amarisct.github.io/pierce-county-cleaning-website").replace(/\/$/, ""); // change if you connect your own domain

const NAV = [
  ["index.html", "Home"],
  ["residential.html", "Residential"],
  ["commercial.html", "Commercial"],
  ["services.html", "Services & Prices"],
  ["about.html", "About"],
  ["service-areas.html", "Areas"],
  ["faq.html", "FAQ"],
  ["contact.html", "Contact"]
];

const esc = s => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

function readMeta(src) {
  const meta = {};
  const re = /^<!--\s*(\w+):\s*(.*?)\s*-->\s*\n/;
  let m;
  while ((m = src.match(re))) { meta[m[1]] = m[2]; src = src.slice(m[0].length); }
  return { meta, body: src };
}

const missingPhotos = new Set();
const STOCK = (() => { try { return JSON.parse(fs.readFileSync(path.join(SRC, "photos.json"), "utf8")); } catch { return {}; } })();
const stockUrl = (id, w) => `https://images.unsplash.com/${id}?auto=format&amp;fit=crop&amp;q=75&amp;w=${w}`;
function findPhoto(name) {
  for (const ext of ["jpg", "jpeg", "webp", "png"]) {
    const f = `${name}.${ext}`;
    if (fs.existsSync(path.join(PHOTOS, f))) return `assets/photos/${f}`;
  }
  return null;
}
function renderPhotos(body) {
  return body.replace(/\{\{photo\s+([^}]*)\}\}/g, (_, attrs) => {
    const a = {};
    attrs.replace(/(\w+)="([^"]*)"/g, (__, k, v) => { a[k] = v; });
    const cls = ["photo", `tone-${a.tone || "sand"}`].concat(a.class ? a.class.split(/\s+/) : []).join(" ");
    const src = a.name && findPhoto(a.name);
    const lazy = a.name === "home-hero" ? 'fetchpriority="high"' : 'loading="lazy"';
    if (src) return `<div class="${cls}"><img src="${src}" alt="${esc(a.alt || "")}" ${lazy}></div>`;
    const stock = a.name && STOCK[a.name];
    if (stock && stock.id) {
      const sizes = a.sizes || (a.name === "home-hero" ? "100vw" : "(max-width: 860px) 100vw, 50vw");
      const srcset = [640, 1080, 1600, 2400].map(w => `${stockUrl(stock.id, w)} ${w}w`).join(", ");
      return `<div class="${cls}"><img src="${stockUrl(stock.id, 1600)}" srcset="${srcset}" sizes="${sizes}" alt="${esc(stock.alt || a.alt || "")}" ${lazy}></div>`;
    }
    if (a.name) missingPhotos.add(`${a.name} — ${a.alt || ""}`);
    return `<div class="${cls}" role="img" aria-label="${esc(a.alt || "")}"><span class="ph">Photo · ${esc(a.note || a.alt || a.name)}</span></div>`;
  });
}

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "name": "Pierce County Cleaning Services LLC",
  "slogan": "Clean Spaces, Clear Minds.",
  "description": "Residential and small-business cleaning in Tacoma, Puyallup, Lakewood, Spanaway and nearby Pierce County communities.",
  "url": SITE_URL,
  "areaServed": ["Tacoma, WA", "Puyallup, WA", "Lakewood, WA", "Spanaway, WA", "University Place, WA", "Fife, WA"].map(n => ({ "@type": "City", "name": n })),
  "knowsAbout": ["House cleaning", "Deep cleaning", "Move-out cleaning", "Office cleaning"]
};

function layout(file, meta, body) {
  const nav = NAV.map(([href, label]) =>
    `<li><a href="${href}"${href === file ? ' aria-current="page"' : ""}>${label}</a></li>`).join("");
  const canonical = `${SITE_URL}/${file === "index.html" ? "" : file}`;
  const footCta = file === "quote.html" ? "" : `
<div class="wrap foot-cta">
  <span class="serif">Ready when you are</span>
  <a class="btn" href="quote.html">Request a quote</a>
</div>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
${file === "404.html" ? `<base href="${SITE_URL}/">` : ""}
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(meta.title)}</title>
<meta name="description" content="${esc(meta.description)}">
<link rel="canonical" href="${canonical}">
<meta property="og:title" content="${esc(meta.title)}">
<meta property="og:description" content="${esc(meta.description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${canonical}">
<meta property="og:site_name" content="Pierce County Cleaning Services">
<meta property="og:image" content="${SITE_URL}/assets/og-image.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
${meta.noindex ? '<meta name="robots" content="noindex">' : ""}
<link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="assets/apple-touch-icon.png">
<meta name="theme-color" content="#ECE8E2">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Serif&family=Jost:wght@300;400;500&display=swap">
<link rel="stylesheet" href="assets/site.css">
${file === "index.html" ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : ""}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-head">
  <div class="wrap">
    <a class="brand" href="index.html"><b>Pierce County Cleaning</b><span>Clean Spaces, Clear Minds.</span></a>
    <button class="menu-btn" type="button" aria-expanded="false" aria-controls="site-nav" aria-label="Open menu">
      <svg width="20" height="12" viewBox="0 0 20 12" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><path d="M0 1h20M0 6h20M0 11h20"/></svg>
    </button>
    <nav class="site-nav" id="site-nav" aria-label="Main"><ul>${nav}<li><a class="nav-cta" href="quote.html"${file === "quote.html" ? ' aria-current="page"' : ""}>Request a quote</a></li></ul></nav>
  </div>
</header>
<main id="main">
${renderPhotos(body.trim())}
</main>
<footer>${footCta}
<div class="site-foot">
  <div class="wrap">
    <ul>
      <li>&copy; <span data-year></span> Pierce County Cleaning Services LLC</li>
      <li data-contact="phone"><span data-value></span></li>
      <li data-contact="email"><span data-value></span></li>
    </ul>
    <ul>
      <li><a href="quote.html">Quote</a></li>
      <li><a href="privacy.html">Privacy</a></li>
      <li><a href="terms.html">Terms</a></li>
    </ul>
  </div>
</div>
</footer>
<script src="assets/config.js"></script>
<script src="assets/prices.js"></script>
<script src="assets/site.js"></script>
${meta.script ? `<script src="assets/${meta.script}"></script>` : ""}
</body>
</html>
`;
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const s = path.join(from, e.name), d = path.join(to, e.name);
    e.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  }
}

// apps-script/Code.gs = the email script template + the same prices and math the website uses.
function buildAppsScript() {
  const vm = require("vm");
  const ctx = { window: {}, module: undefined };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(SRC, "assets", "prices.js"), "utf8") +
    "\n;this.__shared = { pccsSizeId, pccsServiceKey, pccsEstimate };", ctx);
  const shared = [
    `const PRICES = ${JSON.stringify(ctx.window.PCCS_PRICES, null, 2)};`,
    ctx.__shared.pccsSizeId.toString(),
    ctx.__shared.pccsServiceKey.toString(),
    ctx.__shared.pccsEstimate.toString()
  ].join("\n\n");
  const template = fs.readFileSync(path.join(SRC, "apps-script", "Code.template.gs"), "utf8");
  if (!template.includes("/*__SHARED__*/")) throw new Error("Code.template.gs is missing the /*__SHARED__*/ marker");
  fs.mkdirSync(path.join(__dirname, "apps-script"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "apps-script", "Code.gs"), template.replace("/*__SHARED__*/", () => shared));
}

function build() {
  buildAppsScript();
  fs.rmSync(OUT, { recursive: true, force: true });
  copyDir(path.join(SRC, "assets"), path.join(OUT, "assets"));
  const pages = fs.readdirSync(path.join(SRC, "pages")).filter(f => f.endsWith(".html")).sort();
  const urls = [];
  for (const f of pages) {
    const { meta, body } = readMeta(fs.readFileSync(path.join(SRC, "pages", f), "utf8"));
    if (!meta.title || !meta.description) throw new Error(`${f}: missing title or description`);
    fs.writeFileSync(path.join(OUT, f), layout(f, meta, body));
    if (!meta.noindex) urls.push(`${SITE_URL}/${f === "index.html" ? "" : f}`);
  }
  fs.writeFileSync(path.join(OUT, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url><loc>${u}</loc></url>`).join("\n")}\n</urlset>\n`);
  fs.writeFileSync(path.join(OUT, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`);
  console.log(`Built ${pages.length} pages into site/`);
  if (missingPhotos.size) {
    console.log(`\n${missingPhotos.size} photo slot(s) still use placeholders. Add files to src/assets/photos/:`);
    for (const p of [...missingPhotos].sort()) console.log("  - " + p);
  }
}
build();
