#!/usr/bin/env node
// Builds the static site: src/pages/*.html (content fragments) + layout -> site/
// No dependencies. Run: node build.js
//
// Page settings go in comments at the top of each page:
//   <!-- title: ... -->           <title> and link previews (required)
//   <!-- description: ... -->     search result snippet (required)
//   <!-- script: quote.js -->     extra script for that page
//   <!-- noindex: true -->        keep the page out of search results and the sitemap
//   <!-- crumb: Puyallup -->      short name for breadcrumbs (defaults to the menu label)
//   <!-- parent: service-areas.html -->  breadcrumb parent
//   <!-- service: moveout -->     adds Service structured data with prices for that service
//   <!-- city: Puyallup -->       adds Service structured data for that city, and a footer link
//
// Photos: pages place photos with {{photo name="hero" tone="light" alt="..." note="..."}}.
// Drop a file named <name>.jpg / .jpeg / .png / .webp into src/assets/photos/ and rebuild:
// it replaces the stock photo or placeholder. Missing photos are listed when you build.
//
// Prices: {{prices service="moveout"}} prints a price table for one service. Elements with
// data-from, data-price-table and data-addon-list are filled in here too, so prices are in the
// HTML that search engines read (site.js fills them the same way in the browser).
//
// Search settings (verification codes, profile links) live in src/seo.json.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");

const SRC = path.join(__dirname, "src");
const OUT = path.join(__dirname, "site");
const PHOTOS = path.join(SRC, "assets", "photos");
const SITE_URL = (process.env.SITE_URL || "https://amarisct.github.io/pierce-county-cleaning-website").replace(/\/$/, ""); // change if you connect your own domain
const BUSINESS_ID = `${SITE_URL}/#business`;

// Prices and site settings, loaded exactly as the browser loads them.
const shared = { window: {}, module: undefined };
vm.createContext(shared);
vm.runInContext(fs.readFileSync(path.join(SRC, "assets", "prices.js"), "utf8") +
  "\n;this.__fns = { pccsSizeId, pccsServiceKey, pccsEstimate };", shared);
vm.runInContext(fs.readFileSync(path.join(SRC, "assets", "config.js"), "utf8"), shared);
const PRICES = shared.window.PCCS_PRICES;
const CONFIG = shared.window.PCCS_CONFIG || {};
const SEO = (() => { try { return JSON.parse(fs.readFileSync(path.join(SRC, "seo.json"), "utf8")); } catch { return {}; } })();

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
const FOOT_SERVICES = [
  ["residential.html", "House cleaning"],
  ["deep-cleaning.html", "Deep cleaning"],
  ["move-out-cleaning.html", "Move-out cleaning"],
  ["commercial.html", "Office cleaning"],
  ["services.html", "Prices"]
];
// Order of the service areas everywhere they are listed.
const AREAS = ["Tacoma", "Puyallup", "Lakewood", "Spanaway", "University Place", "Fife"];
const SERVICE_NAMES = {
  standard: "Standard house cleaning",
  recurring: "Recurring house cleaning (biweekly)",
  deep: "Deep cleaning",
  moveout: "Move-in and move-out cleaning"
};

const esc = s => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const textOf = html => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
  .replace(/&#39;|&rsquo;/g, "'").replace(/&mdash;/g, "—").replace(/\s+/g, " ").trim();

function readMeta(src) {
  const meta = {};
  const re = /^<!--\s*(\w+):\s*(.*?)\s*-->\s*\n/;
  let m;
  while ((m = src.match(re))) { meta[m[1]] = m[2]; src = src.slice(m[0].length); }
  return { meta, body: src };
}

// ---------- prices ----------
const priceList = key => Object.values(PRICES.services[key].prices);
const minPrice = key => Math.min(...priceList(key));
const maxPrice = key => Math.max(...priceList(key));
const fromLabel = key => `From $${minPrice(key)}${key === "recurring" ? " per visit" : ""}`;

function priceTable(key) {
  const svc = PRICES.services[key];
  if (!svc) throw new Error(`{{prices}}: unknown service "${key}"`);
  const rows = PRICES.sizes.map(s => `<tr><td>${s.label}</td><td class="num">$${svc.prices[s.id]}</td></tr>`).join("");
  const head = key === "recurring" ? "Per visit" : "Price";
  return `<div class="table-wrap compact"><table><caption class="sr-only">${esc(svc.label)} prices by home size</caption><thead><tr><th scope="col">Home</th><th scope="col" class="num">${head}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function prerenderPrices(html) {
  const show = !!CONFIG.showPrices;
  html = html.replace(/\{\{prices\s+service="(\w+)"\}\}/g, (_, key) => show ? priceTable(key) : "");
  if (show) {
    html = html.replace(/(<(\w+)\b[^>]*\sdata-from="(\w+)"[^>]*>)(<\/\2>)/g,
      (m, open, tag, key, close) => PRICES.services[key] ? open + fromLabel(key) + close : m);
    html = html.replace(/(<tbody\b[^>]*\sdata-price-table[^>]*>)(<\/tbody>)/g, (_, open, close) => open +
      PRICES.sizes.map(s => `<tr><td>${s.label}</td>` + ["standard", "recurring", "deep", "moveout"]
        .map(k => `<td class="num">$${PRICES.services[k].prices[s.id]}</td>`).join("") + "</tr>").join("") + close);
  }
  html = html.replace(/(<ul\b[^>]*\sdata-addon-list[^>]*>)(<\/ul>)/g, (_, open, close) => open +
    Object.values(PRICES.addons).map(a => `<li>${a.label}${show ? " — $" + a.price : ""}</li>`).join("") + close);
  return html;
}

// ---------- photos ----------
const missingPhotos = new Set();
const STOCK = (() => { try { return JSON.parse(fs.readFileSync(path.join(SRC, "photos.json"), "utf8")); } catch { return {}; } })();
const stockUrl = (id, w) => `https://images.unsplash.com/${id}?auto=format&amp;fit=crop&amp;q=75&amp;w=${w}`;
function findPhoto(name) {
  for (const ext of ["jpg", "jpeg", "webp", "png"]) {
    const f = `${name}.${ext}`;
    if (fs.existsSync(path.join(PHOTOS, f))) return f;
  }
  return null;
}
// Image width/height (JPEG and PNG) so the browser can reserve space before the photo loads.
function imageSize(file) {
  const b = fs.readFileSync(file);
  if (b.length > 24 && b.toString("ascii", 1, 4) === "PNG") return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b[0] !== 0xFF || b[1] !== 0xD8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xFF) { i++; continue; }
    const m = b[i + 1];
    if (m === 0xFF) { i++; continue; }
    const len = b.readUInt16BE(i + 2);
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  return null;
}
function renderPhotos(body) {
  return body.replace(/\{\{photo\s+([^}]*)\}\}/g, (_, attrs) => {
    const a = {};
    attrs.replace(/(\w+)="([^"]*)"/g, (__, k, v) => { a[k] = v; });
    const cls = ["photo", `tone-${a.tone || "sand"}`].concat(a.class ? a.class.split(/\s+/) : []).join(" ");
    const file = a.name && findPhoto(a.name);
    const lazy = a.name === "home-hero" ? 'fetchpriority="high"' : 'loading="lazy" decoding="async"';
    if (file) {
      const size = imageSize(path.join(PHOTOS, file));
      const dims = size ? ` width="${size.w}" height="${size.h}"` : "";
      return `<div class="${cls}"><img src="assets/photos/${file}"${dims} alt="${esc(a.alt || "")}" ${lazy}></div>`;
    }
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

// ---------- structured data (schema.org JSON-LD) ----------
const pageUrl = file => `${SITE_URL}/${file === "index.html" ? "" : file}`;
const cityPlace = name => ({ "@type": "City", "name": `${name}, WA` });
const areaServed = () => AREAS.map(cityPlace).concat({ "@type": "AdministrativeArea", "name": "Pierce County, WA" });
const providerRef = () => ({ "@type": "LocalBusiness", "@id": BUSINESS_ID, "name": "Pierce County Cleaning Services LLC", "url": `${SITE_URL}/` });
const aggregateOffer = keys => {
  if (!CONFIG.showPrices) return undefined;
  const all = keys.flatMap(priceList);
  return { "@type": "AggregateOffer", "priceCurrency": "USD", "lowPrice": Math.min(...all), "highPrice": Math.max(...all), "offerCount": all.length };
};

function businessNode() {
  const keys = Object.keys(SERVICE_NAMES);
  const all = keys.flatMap(priceList);
  return {
    "@type": "LocalBusiness",
    "@id": BUSINESS_ID,
    "name": "Pierce County Cleaning Services LLC",
    "alternateName": "Pierce County Cleaning Services",
    "slogan": "Clean Spaces, Clear Minds.",
    "description": "House cleaning and small-office cleaning in Tacoma, Puyallup, Lakewood, Spanaway, University Place and Fife, Washington. Standard, deep, move-out and recurring cleaning with prices shown before you book.",
    "url": `${SITE_URL}/`,
    "email": CONFIG.email || undefined,
    "telephone": CONFIG.phone || undefined,
    "logo": `${SITE_URL}/assets/apple-touch-icon.png`,
    "image": `${SITE_URL}/assets/og-image.jpg`,
    "priceRange": CONFIG.showPrices ? `$${Math.min(...all)}–$${Math.max(...all)}` : undefined,
    "currenciesAccepted": "USD",
    "paymentAccepted": "Credit card, Debit card, Zelle, Cash, Check",
    "address": { "@type": "PostalAddress", "addressLocality": SEO.addressLocality || undefined, "addressRegion": "WA", "addressCountry": "US" },
    "areaServed": areaServed(),
    "knowsAbout": ["House cleaning", "Deep cleaning", "Move-out cleaning", "Recurring house cleaning", "Office cleaning", "Rental turnover cleaning"],
    "hasOfferCatalog": {
      "@type": "OfferCatalog",
      "name": "Cleaning services",
      "itemListElement": keys.map(k => ({
        "@type": "Offer",
        "itemOffered": { "@type": "Service", "name": SERVICE_NAMES[k] },
        "priceSpecification": CONFIG.showPrices ? { "@type": "PriceSpecification", "priceCurrency": "USD", "minPrice": minPrice(k), "maxPrice": maxPrice(k) } : undefined
      })).concat({ "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Office and commercial cleaning" } })
    },
    "sameAs": Array.isArray(SEO.sameAs) && SEO.sameAs.filter(Boolean).length ? SEO.sameAs.filter(Boolean) : undefined
  };
}

function crumbName(file, meta) {
  if (meta.crumb) return meta.crumb;
  const nav = NAV.find(([f]) => f === file);
  return nav ? nav[1] : meta.title.split(" | ")[0];
}

function structuredData(file, meta, body, metas) {
  const graph = [];
  const url = pageUrl(file);
  if (file === "index.html") {
    graph.push(businessNode());
    graph.push({ "@type": "WebSite", "@id": `${SITE_URL}/#website`, "url": `${SITE_URL}/`, "name": "Pierce County Cleaning Services", "publisher": { "@id": BUSINESS_ID } });
  }
  if (meta.service) {
    const key = meta.service;
    if (!SERVICE_NAMES[key]) throw new Error(`${file}: unknown service "${key}"`);
    graph.push({ "@type": "Service", "@id": `${url}#service`, "name": SERVICE_NAMES[key], "serviceType": SERVICE_NAMES[key], "url": url,
      "provider": providerRef(), "areaServed": areaServed(), "offers": aggregateOffer([key]) });
  }
  if (meta.city) {
    graph.push({ "@type": "Service", "@id": `${url}#service`, "name": `House cleaning in ${meta.city}, WA`, "serviceType": "House cleaning", "url": url,
      "provider": providerRef(), "areaServed": cityPlace(meta.city), "offers": aggregateOffer(["standard", "recurring", "deep", "moveout"]) });
  }
  if (file !== "index.html" && file !== "404.html") {
    const trail = [["index.html", "Home"]];
    if (meta.parent && metas[meta.parent]) trail.push([meta.parent, crumbName(meta.parent, metas[meta.parent])]);
    trail.push([file, crumbName(file, meta)]);
    graph.push({ "@type": "BreadcrumbList", "itemListElement": trail.map(([f, name], i) => ({ "@type": "ListItem", "position": i + 1, "name": name, "item": pageUrl(f) })) });
  }
  const qa = [...body.matchAll(/<details[^>]*>\s*<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g)];
  if (qa.length) {
    graph.push({ "@type": "FAQPage", "@id": `${url}#faq`, "mainEntity": qa.map(([, q, a]) => ({
      "@type": "Question", "name": textOf(q), "acceptedAnswer": { "@type": "Answer", "text": textOf(a) } })) });
  }
  if (!graph.length) return "";
  const json = JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c");
  return `<script type="application/ld+json">${json}</script>`;
}

// ---------- layout ----------
function footNav(cityPages) {
  const li = ([href, label]) => `<li><a href="${href}">${label}</a></li>`;
  return `
  <div class="wrap foot-nav">
    <div><span class="caps">Services</span><ul>${FOOT_SERVICES.map(li).join("")}</ul></div>
    <div><span class="caps">House cleaning in</span><ul>${cityPages.map(li).join("")}</ul></div>
  </div>`;
}

function layout(file, meta, body, metas, cityPages) {
  const nav = NAV.map(([href, label]) =>
    `<li><a href="${href}"${href === file ? ' aria-current="page"' : ""}>${label}</a></li>`).join("");
  const canonical = pageUrl(file);
  const footCta = file === "quote.html" ? "" : `
<div class="wrap foot-cta">
  <span class="serif">Ready when you are</span>
  <a class="btn" href="quote.html">Request a quote</a>
</div>`;
  const verify = [
    SEO.googleSiteVerification ? `<meta name="google-site-verification" content="${esc(SEO.googleSiteVerification)}">` : "",
    SEO.bingSiteVerification ? `<meta name="msvalidate.01" content="${esc(SEO.bingSiteVerification)}">` : ""
  ].filter(Boolean).join("\n");
  const main = prerenderPrices(renderPhotos(body.trim()));
  return `<!doctype html>
<html lang="en-US">
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
<meta property="og:locale" content="en_US">
<meta property="og:image" content="${SITE_URL}/assets/og-image.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
${meta.noindex ? '<meta name="robots" content="noindex">' : '<meta name="robots" content="index, follow, max-image-preview:large">'}
${verify}
<link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="assets/apple-touch-icon.png">
<meta name="theme-color" content="#ECE8E2">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Serif&family=Jost:wght@300;400;500&display=swap">
<link rel="stylesheet" href="assets/site.css">
${structuredData(file, meta, body, metas)}
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
${main}
</main>
<footer>${footCta}
<div class="site-foot">${footNav(cityPages)}
  <div class="wrap">
    <ul>
      <li>&copy; <span data-year>${new Date().getFullYear()}</span> Pierce County Cleaning Services LLC</li>
      <li data-contact="phone"><span data-value></span></li>
      <li data-contact="email"><span data-value></span></li>
    </ul>
    <ul>
      <li><a href="quote.html">Quote</a></li>
      <li><a href="reviews.html">Reviews</a></li>
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
  const code = [
    `const PRICES = ${JSON.stringify(PRICES, null, 2)};`,
    shared.__fns.pccsSizeId.toString(),
    shared.__fns.pccsServiceKey.toString(),
    shared.__fns.pccsEstimate.toString()
  ].join("\n\n");
  const template = fs.readFileSync(path.join(SRC, "apps-script", "Code.template.gs"), "utf8");
  if (!template.includes("/*__SHARED__*/")) throw new Error("Code.template.gs is missing the /*__SHARED__*/ marker");
  fs.mkdirSync(path.join(__dirname, "apps-script"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "apps-script", "Code.gs"), template.replace("/*__SHARED__*/", () => code));
}

// Date a page's source last changed in git (YYYY-MM-DD), for the sitemap. null if unknown.
function lastModified(file) {
  try {
    const d = execFileSync("git", ["log", "-1", "--format=%cs", "--", path.join("src", "pages", file)],
      { cwd: __dirname, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
  } catch { return null; }
}

function build() {
  buildAppsScript();
  fs.rmSync(OUT, { recursive: true, force: true });
  copyDir(path.join(SRC, "assets"), path.join(OUT, "assets"));
  const files = fs.readdirSync(path.join(SRC, "pages")).filter(f => f.endsWith(".html")).sort();
  const pages = {}, metas = {};
  for (const f of files) {
    const parsed = readMeta(fs.readFileSync(path.join(SRC, "pages", f), "utf8"));
    if (!parsed.meta.title || !parsed.meta.description) throw new Error(`${f}: missing title or description`);
    pages[f] = parsed; metas[f] = parsed.meta;
  }
  const cityPages = AREAS.map(name => {
    const f = files.find(x => metas[x].city === name);
    return f && [f, name];
  }).filter(Boolean);
  const unknownCity = files.filter(f => metas[f].city && !AREAS.includes(metas[f].city));
  if (unknownCity.length) throw new Error(`Add these cities to AREAS in build.js: ${unknownCity.map(f => metas[f].city).join(", ")}`);

  const urls = [];
  for (const f of ["index.html", ...files.filter(x => x !== "index.html")]) {
    fs.writeFileSync(path.join(OUT, f), layout(f, pages[f].meta, pages[f].body, metas, cityPages));
    if (!metas[f].noindex) urls.push([pageUrl(f), lastModified(f)]);
  }
  fs.writeFileSync(path.join(OUT, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map(([u, d]) => `  <url><loc>${u}</loc>${d ? `<lastmod>${d}</lastmod>` : ""}</url>`).join("\n") + `\n</urlset>\n`);
  fs.writeFileSync(path.join(OUT, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`);
  console.log(`Built ${files.length} pages into site/`);
  if (missingPhotos.size) {
    console.log(`\n${missingPhotos.size} photo slot(s) still use placeholders. Add files to src/assets/photos/:`);
    for (const p of [...missingPhotos].sort()) console.log("  - " + p);
  }
}
build();
