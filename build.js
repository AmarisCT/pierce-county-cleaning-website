#!/usr/bin/env node
// Builds the static site: src/pages/*.html (content fragments) + layout -> site/
// No dependencies. Run: node build.js
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "src");
const OUT = path.join(__dirname, "site");
const SITE_URL = process.env.SITE_URL || "https://piercecountycleaning.com"; // TODO(owner): set once the domain is confirmed

const NAV = [
  ["index.html", "Home"],
  ["residential.html", "Residential"],
  ["commercial.html", "Commercial"],
  ["services.html", "Services & Pricing"],
  ["service-areas.html", "Service Areas"],
  ["about.html", "About"],
  ["faq.html", "FAQ"],
  ["contact.html", "Contact"]
];

function readMeta(src) {
  const meta = {};
  const re = /^<!--\s*(\w+):\s*(.*?)\s*-->\s*\n/;
  let m;
  while ((m = src.match(re))) { meta[m[1]] = m[2]; src = src.slice(m[0].length); }
  return { meta, body: src };
}

const esc = s => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

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
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(meta.title)}</title>
<meta name="description" content="${esc(meta.description)}">
<link rel="canonical" href="${canonical}">
<meta property="og:title" content="${esc(meta.title)}">
<meta property="og:description" content="${esc(meta.description)}">
<meta property="og:type" content="website">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=Figtree:wght@400;500;600&display=swap">
<link rel="stylesheet" href="assets/site.css">
${file === "index.html" ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : ""}
${meta.noindex ? '<meta name="robots" content="noindex">' : ""}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-head">
  <div class="wrap">
    <a class="brand" href="index.html"><b>Pierce County Cleaning Services</b><span>Clean Spaces, Clear Minds.</span></a>
    <button class="menu-btn" type="button" aria-expanded="false" aria-controls="site-nav">Menu</button>
    <nav class="site-nav" id="site-nav" aria-label="Main"><ul>${nav}<li><a class="btn" href="quote.html">Request a quote</a></li></ul></nav>
  </div>
</header>
<main id="main">
${body.trim()}
</main>
<footer class="site-foot">
  <div class="wrap">
    <div><b>Pierce County Cleaning Services LLC</b><br>Clean Spaces, Clear Minds.<br>Serving Tacoma, Puyallup, Lakewood, Spanaway and nearby Pierce County communities.</div>
    <ul>
      <li data-contact="phone">Phone: <span data-value></span></li>
      <li data-contact="email">Email: <span data-value></span></li>
      <li><a href="quote.html">Request a quote</a></li>
    </ul>
    <ul>
      <li><a href="privacy.html">Privacy policy</a></li>
      <li><a href="terms.html">Terms of service</a></li>
      <li>&copy; <span data-year></span> Pierce County Cleaning Services LLC</li>
    </ul>
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

function build() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, "assets"), { recursive: true });
  for (const f of fs.readdirSync(path.join(SRC, "assets"))) {
    fs.copyFileSync(path.join(SRC, "assets", f), path.join(OUT, "assets", f));
  }
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
}
build();
