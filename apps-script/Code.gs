/**
 * Pierce County Cleaning Services — quote & invoice emails (Google Apps Script)
 *
 * GENERATED FILE: build.js writes apps-script/Code.gs from src/apps-script/Code.template.gs
 * and the prices in src/assets/prices.js. Settings live in Config.gs.
 *
 * What it does
 *  - The website's quote form posts here (deployed as a web app).
 *  - The price is recalculated here from the price table below, so it can't be tampered with.
 *  - Each request is logged as a row in the "Quotes" sheet.
 *  - The customer is emailed a quote with the service, add-ons and total; you get an alert.
 *  - From the sheet's PCCS menu you can send an invoice for a finished job.
 *  - Optional card payments: once Stripe is connected (PCCS → Connect Stripe), each invoice gets
 *    its own Stripe payment link for the exact amount, and paid invoices are marked Paid.
 *  - The website's review form posts here too. Reviews land in the "Reviews" tab, hidden until
 *    you set "Show on website" to Yes. The website reads the shown ones back (GET ?reviews=1).
 */

// ===== Prices and shared math (copied from src/assets/prices.js) =====
const PRICES = {
  "sizes": [
    {
      "id": "studio",
      "label": "Studio, 1 bath"
    },
    {
      "id": "1-1",
      "label": "1 bed, 1 bath"
    },
    {
      "id": "2-1",
      "label": "2 bed, 1 bath"
    },
    {
      "id": "2-2",
      "label": "2 bed, 2 bath"
    },
    {
      "id": "3-2",
      "label": "3 bed, 2 bath"
    },
    {
      "id": "4-2.5",
      "label": "4 bed, 2.5 bath"
    }
  ],
  "services": {
    "standard": {
      "label": "Standard clean",
      "prices": {
        "studio": 165,
        "1-1": 190,
        "2-1": 210,
        "2-2": 245,
        "3-2": 275,
        "4-2.5": 320
      }
    },
    "recurring": {
      "label": "Recurring (biweekly)",
      "prices": {
        "studio": 155,
        "1-1": 170,
        "2-1": 190,
        "2-2": 220,
        "3-2": 240,
        "4-2.5": 280
      }
    },
    "deep": {
      "label": "Deep clean",
      "prices": {
        "studio": 215,
        "1-1": 250,
        "2-1": 285,
        "2-2": 335,
        "3-2": 375,
        "4-2.5": 450
      }
    },
    "moveout": {
      "label": "Move-in / move-out",
      "prices": {
        "studio": 230,
        "1-1": 270,
        "2-1": 310,
        "2-2": 365,
        "3-2": 415,
        "4-2.5": 495
      }
    }
  },
  "addons": {
    "fridge": {
      "label": "Inside fridge",
      "price": 35
    },
    "oven": {
      "label": "Inside oven",
      "price": 35
    },
    "cabinets": {
      "label": "Inside cabinets",
      "price": 45
    },
    "windows": {
      "label": "Interior windows",
      "price": 45
    },
    "baseboard": {
      "label": "Detailed baseboards",
      "price": 30
    },
    "laundry": {
      "label": "Laundry (1 load)",
      "price": 25
    }
  }
};

function pccsSizeId(beds, baths) {
  beds = Number(beds); baths = Number(baths);
  if (!(beds >= 0) || !(baths >= 1)) return null;
  if (beds === 0 && baths <= 1) return "studio";
  if (beds === 1 && baths <= 1) return "1-1";
  if (beds === 2 && baths <= 1) return "2-1";
  if (beds === 2 && baths <= 2) return "2-2";
  if (beds === 3 && baths <= 2) return "3-2";
  if (beds === 4 && baths <= 2.5) return "4-2.5";
  if (beds <= 1 && baths <= 2) return "2-2";   // small home with an extra bathroom
  if (beds === 3 && baths <= 2.5) return "4-2.5";
  return null;
}

function pccsServiceKey(service, frequency) {
  if (service === "recurring") return frequency === "biweekly" ? "recurring" : null;
  return service;
}

function pccsEstimate(prices, sizeId, serviceId, addonIds) {
  const svc = prices.services[serviceId];
  if (!svc || !(sizeId in svc.prices)) return null;
  const base = svc.prices[sizeId];
  const extras = (addonIds || []).reduce((s, k) => s + (prices.addons[k] ? prices.addons[k].price : 0), 0);
  return { base, extras, total: base + extras };
}

// ===== Sheet layout =====
const SHEET_NAME = "Quotes";
const COLS = [
  "Received", "Quote #", "Status", "Name", "Email", "Phone", "Address", "ZIP",
  "Property", "Bedrooms", "Bathrooms", "Sq ft", "Service", "Frequency", "Add-ons",
  "Preferred date", "Quote total", "Service date", "Final amount", "Invoice note",
  "Invoice #", "Invoice sent", "Card pay link", "Paid on", "Notes", "Data (do not edit)"
];
const STATUSES = ["New", "Contacted", "Booked", "Completed", "Invoiced", "Paid", "Lost", "Test"];
const MONEY_COLS = ["Quote total", "Final amount"];

const LABELS = {
  propertyType: { house: "House", apartment: "Apartment", condo: "Condo / townhome", commercial: "Office or commercial space", rental: "Short-term rental" },
  service: { standard: "Standard clean", deep: "Deep clean", moveout: "Move-in / move-out clean", recurring: "Recurring cleaning", commercial: "Commercial walkthrough" },
  frequency: { once: "One-time", weekly: "Weekly", biweekly: "Every two weeks", monthly: "Monthly" }
};

// Reviews tab. "Show on website" starts at No for reviews sent through the website.
const REVIEWS_SHEET = "Reviews";
const REVIEW_COLS = ["Date", "Show on website", "Rating", "Review", "Name shown", "City", "Service", "Source", "Link", "Full name", "Email", "Notes"];
const REVIEW_SOURCES = ["Website", "Google", "Other"];
const REVIEWS_CACHE_KEY = "reviews:v1";

// ===== Web app =====
function doGet(e) {
  const params = (e && e.parameter) || {};
  if (params.reviews) {
    try {
      return json_(publishedReviews_());
    } catch (err) {
      console.error(err);
      return json_({ ok: false, error: "server_error", reviews: [] });
    }
  }
  return json_({ ok: true, service: "Pierce County Cleaning quote form" });
}

function doPost(e) {
  let data;
  try {
    data = JSON.parse((e && e.postData && e.postData.contents) || "{}");
  } catch (err) {
    return json_({ ok: false, error: "bad_request" });
  }
  try {
    return json_(data && data.type === "review" ? handleReview_(data) : handleQuote_(data));
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: "server_error" });
  }
}

function handleQuote_(data) {
  // Spam traps. Answer "ok" so automated senders learn nothing.
  if (data.website) return { ok: true, quoteNumber: null };
  if (!(Number(data.elapsed) >= 3000)) return { ok: true, quoteNumber: null };

  const checked = validate_(data);
  if (checked.fields.length) return { ok: false, error: "invalid", fields: checked.fields };
  const req = checked.req;

  const cache = CacheService.getScriptCache();
  const throttleKey = "recent:" + req.email.toLowerCase();
  if (cache.get(throttleKey)) return { ok: false, error: "too_soon" };

  const props = PropertiesService.getScriptProperties();
  const now = new Date();
  const dayKey = "count:" + fmtDate_(now, "yyyyMMdd");
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let quoteNumber, quote;
  try {
    if (Number(props.getProperty(dayKey) || 0) >= CONFIG.maxQuotesPerDay) return { ok: false, error: "busy" };
    quote = buildQuote_(req);
    quoteNumber = nextNumber_("Q", now);
    const sheet = quotesSheet_();
    appendRecord_(sheet, {
      "Received": now, "Quote #": quoteNumber, "Status": "New",
      "Name": req.name, "Email": req.email, "Phone": req.phone, "Address": req.address, "ZIP": req.zip,
      "Property": LABELS.propertyType[req.propertyType], "Bedrooms": quote.commercial ? "" : req.bedrooms,
      "Bathrooms": quote.commercial ? "" : req.bathrooms, "Sq ft": req.sqft || "",
      "Service": LABELS.service[req.service], "Frequency": req.service === "recurring" ? LABELS.frequency[req.frequency] : "",
      "Add-ons": req.addons.map(function (k) { return PRICES.addons[k].label; }).join(", "),
      "Preferred date": req.date || "", "Quote total": quote.priced ? quote.total : "",
      "Notes": req.notes,
      "Data (do not edit)": JSON.stringify({ v: 1, req: withoutNotes_(req), quote: quote, issued: now.toISOString() })
    });
    props.setProperty(dayKey, String(Number(props.getProperty(dayKey) || 0) + 1));
  } finally {
    lock.releaseLock();
  }
  cache.put(throttleKey, "1", 600);

  let emailed = true;
  try {
    const msg = renderQuoteEmail_(req, quote, quoteNumber, now);
    MailApp.sendEmail({ to: req.email, subject: msg.subject, body: msg.text, htmlBody: msg.html, name: CONFIG.businessName, replyTo: replyTo_() });
  } catch (err) {
    console.error("Customer email failed", err);
    emailed = false;
  }
  try {
    const alert = renderOwnerAlert_(req, quote, quoteNumber, emailed);
    MailApp.sendEmail({ to: CONFIG.notifyEmail || ownerEmail_(), subject: alert.subject, body: alert.text, htmlBody: alert.html, name: CONFIG.shortName + " website", replyTo: req.email });
  } catch (err) {
    console.error("Owner alert failed", err);
  }
  return { ok: true, quoteNumber: quoteNumber, emailed: emailed, priced: quote.priced, total: quote.priced ? quote.total : null };
}

// ===== Reviews =====
function handleReview_(data) {
  if (data.website) return { ok: true };
  if (!(Number(data.elapsed) >= 3000)) return { ok: true };

  const checked = validateReview_(data);
  if (checked.fields.length) return { ok: false, error: "invalid", fields: checked.fields };
  const rv = checked.review;

  const cache = CacheService.getScriptCache();
  const throttleKey = "review:" + rv.email;
  if (cache.get(throttleKey)) return { ok: false, error: "too_soon" };

  const props = PropertiesService.getScriptProperties();
  const now = new Date();
  const dayKey = "reviews:" + fmtDate_(now, "yyyyMMdd");
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (Number(props.getProperty(dayKey) || 0) >= (CONFIG.maxReviewsPerDay || 20)) return { ok: false, error: "busy" };
    appendRecord_(reviewsSheet_(), {
      "Date": now, "Show on website": "No", "Rating": rv.rating, "Review": rv.text,
      "Name shown": shortName_(rv.name), "City": rv.city, "Service": rv.service ? LABELS.service[rv.service] : "",
      "Source": "Website", "Full name": rv.name, "Email": rv.email
    });
    props.setProperty(dayKey, String(Number(props.getProperty(dayKey) || 0) + 1));
  } finally {
    lock.releaseLock();
  }
  cache.put(throttleKey, "1", 600);

  try {
    const alert = renderReviewAlert_(rv);
    MailApp.sendEmail({ to: CONFIG.notifyEmail || ownerEmail_(), subject: alert.subject, body: alert.text, htmlBody: alert.html, name: CONFIG.shortName + " website", replyTo: rv.email });
  } catch (err) {
    console.error("Review alert failed", err);
  }
  return { ok: true };
}

function validateReview_(d) {
  const fields = [];
  const str = function (v, max) { return String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max); };
  const looksLikeLink = function (s) { return /https?:|www\.|<|>|\[url/i.test(s); };
  const review = {
    name: str(d.name, 80),
    email: str(d.email, 120).toLowerCase(),
    rating: Number(d.rating),
    text: String(d.text == null ? "" : d.text).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, 1500),
    city: str(d.city, 40),
    service: str(d.service, 20)
  };
  if (review.name.length < 2 || looksLikeLink(review.name)) fields.push("name");
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(review.email)) fields.push("email");
  if ([1, 2, 3, 4, 5].indexOf(review.rating) < 0) fields.push("rating");
  if (review.text.length < 10 || /https?:|www\./i.test(review.text)) fields.push("text");
  if (!(d.consent === true || d.consent === "on" || d.consent === "yes")) fields.push("consent");
  if (looksLikeLink(review.city)) review.city = "";
  if (!LABELS.service[review.service]) review.service = "";
  return { review: review, fields: fields };
}

// Reviews marked "Show on website: Yes", newest first, without names in full or emails.
function publishedReviews_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get(REVIEWS_CACHE_KEY);
  if (hit) return JSON.parse(hit);
  const out = { ok: true, reviews: [], count: 0, average: null };
  const sheet = SpreadsheetApp.openById(sheetId_()).getSheetByName(REVIEWS_SHEET);
  if (sheet && sheet.getLastRow() > 1) {
    const map = headerMap_(sheet);
    const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
    rows.forEach(function (r) {
      const get = function (c) { return map[c] ? r[map[c] - 1] : ""; };
      if (String(get("Show on website")).trim().toLowerCase() !== "yes") return;
      const rating = Math.round(Number(get("Rating")));
      const text = String(get("Review") || "").trim();
      if (!(rating >= 1 && rating <= 5) || !text) return;
      const d = get("Date");
      const isDate = Object.prototype.toString.call(d) === "[object Date]" && !isNaN(d.getTime());
      const link = String(get("Link") || "").trim();
      const source = String(get("Source") || "").trim();
      out.reviews.push({
        rating: rating,
        text: text.slice(0, 1500),
        name: String(get("Name shown") || "").trim() || shortName_(String(get("Full name") || "")),
        city: String(get("City") || "").trim().slice(0, 40),
        service: String(get("Service") || "").trim().slice(0, 40),
        source: REVIEW_SOURCES.indexOf(source) >= 0 ? source : "Website",
        link: /^https:\/\//i.test(link) ? link : "",
        date: isDate ? fmtDate_(d, "yyyy-MM-dd") : ""
      });
    });
    out.reviews.sort(function (a, b) { return b.date.localeCompare(a.date); });
    out.reviews = out.reviews.slice(0, 100);
    out.count = out.reviews.length;
    if (out.count) out.average = Math.round(out.reviews.reduce(function (s, x) { return s + x.rating; }, 0) / out.count * 10) / 10;
  }
  cache.put(REVIEWS_CACHE_KEY, JSON.stringify(out), 300);
  return out;
}

// "Jane Rivera" -> "Jane R."
function shortName_(full) {
  const parts = String(full || "").trim().split(/\s+/).filter(String);
  if (!parts.length) return "";
  return parts[0] + (parts.length > 1 ? " " + parts[parts.length - 1].charAt(0).toUpperCase() + "." : "");
}

function reviewLink_() {
  if (CONFIG.reviewUrl) return String(CONFIG.reviewUrl);
  return CONFIG.website ? String(CONFIG.website).replace(/\/?$/, "/") + "reviews.html#leave" : "";
}

// Clear the website's copy of the reviews as soon as the Reviews tab is edited.
function onEdit(e) {
  try {
    if (e && e.range && e.range.getSheet().getName() === REVIEWS_SHEET) CacheService.getScriptCache().remove(REVIEWS_CACHE_KEY);
  } catch (err) { /* ignore */ }
}

// ===== Validation =====
function validate_(d) {
  const fields = [];
  const str = function (v, max) { return String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max); };
  const looksLikeLink = function (s) { return /https?:|www\.|<|>|\[url/i.test(s); };
  const req = {
    name: str(d.name, 80),
    email: str(d.email, 120).toLowerCase(),
    phone: str(d.phone, 30),
    address: str(d.address, 160),
    zip: str(d.zip, 10),
    propertyType: str(d.propertyType, 20),
    service: str(d.service, 20),
    frequency: str(d.frequency, 20) || "once",
    bedrooms: Number(d.bedrooms),
    bathrooms: Number(d.bathrooms),
    sqft: d.sqft === "" || d.sqft == null ? null : Math.round(Number(d.sqft)),
    addons: [],
    date: str(d.date, 10),
    notes: String(d.notes == null ? "" : d.notes).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim().slice(0, 1000)
  };
  if (req.name.length < 2 || looksLikeLink(req.name)) fields.push("name");
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(req.email)) fields.push("email");
  const digits = req.phone.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) fields.push("phone");
  if (req.address.length < 5 || looksLikeLink(req.address)) fields.push("address");
  if (!/^\d{5}$/.test(req.zip)) fields.push("zip");
  if (!LABELS.propertyType[req.propertyType]) fields.push("propertyType");
  if (!LABELS.service[req.service]) fields.push("service");
  if (!LABELS.frequency[req.frequency]) fields.push("frequency");
  const commercial = req.service === "commercial" || req.propertyType === "commercial";
  if (!commercial) {
    if (!(req.bedrooms >= 0 && req.bedrooms <= 5 && Math.floor(req.bedrooms) === req.bedrooms)) fields.push("bedrooms");
    if ([1, 1.5, 2, 2.5, 3].indexOf(req.bathrooms) < 0) fields.push("bathrooms");
  }
  if (req.sqft != null && !(req.sqft >= 100 && req.sqft <= 50000)) req.sqft = null;
  if (req.date && !/^\d{4}-\d{2}-\d{2}$/.test(req.date)) req.date = "";
  const seen = {};
  (Array.isArray(d.addons) ? d.addons : []).forEach(function (k) {
    k = String(k);
    if (PRICES.addons[k] && !seen[k]) { seen[k] = true; req.addons.push(k); }
  });
  return { req: req, fields: fields };
}

// ===== Quote math =====
function buildQuote_(req) {
  const commercial = req.service === "commercial" || req.propertyType === "commercial";
  const svcKey = commercial ? null : pccsServiceKey(req.service, req.frequency);
  const size = commercial ? null : pccsSizeId(req.bedrooms, req.bathrooms);
  const est = svcKey && size ? pccsEstimate(PRICES, size, svcKey, req.addons) : null;
  const home = commercial ? LABELS.propertyType.commercial : homeLabel_(req);
  let serviceName = LABELS.service[req.service];
  if (req.service === "recurring") serviceName += " (" + LABELS.frequency[req.frequency].toLowerCase() + ")";
  const description = serviceName + " — " + home;
  const addonLines = req.addons.map(function (k) { return { label: "Add-on: " + PRICES.addons[k].label, amount: PRICES.addons[k].price }; });
  const extras = addonLines.reduce(function (s, l) { return s + l.amount; }, 0);
  return {
    commercial: commercial,
    priced: !!est,
    perVisit: svcKey === "recurring",
    description: description,
    lines: est ? [{ label: description, amount: est.base }].concat(addonLines) : addonLines,
    base: est ? est.base : null,
    extras: extras,
    total: est ? est.total : null
  };
}

function homeLabel_(req) {
  const beds = req.bedrooms === 0 ? "Studio" : (req.bedrooms >= 5 ? "5+" : req.bedrooms) + " bed";
  const baths = (req.bathrooms >= 3 ? "3+" : req.bathrooms) + " bath";
  return beds + ", " + baths + (req.sqft ? ", about " + req.sqft.toLocaleString("en-US") + " sq ft" : "");
}

// ===== Emails =====
const C_ = { stone: "#ECE8E2", paper: "#F5F2EE", ink: "#2B2926", body: "#4A4641", muted: "#66605A", rule: "#CFC8BF", dark: "#3A3632" };
const SERIF_ = "Georgia,'Times New Roman',serif";
const SANS_ = "'Helvetica Neue',Helvetica,Arial,sans-serif";

function renderQuoteEmail_(req, quote, quoteNumber, issued) {
  const validUntil = new Date(issued.getTime() + CONFIG.quoteValidDays * 86400000);
  const meta = [
    ["Quote", quoteNumber],
    ["Issued", fmtDate_(issued, "MMMM d, yyyy")],
    ["Valid until", fmtDate_(validUntil, "MMMM d, yyyy")]
  ];
  if (!quote.commercial) meta.push(["Visits", req.service === "recurring" ? LABELS.frequency[req.frequency] : "One-time"]);
  if (req.date) meta.push(["Preferred date", fmtYmd_(req.date)]);
  const who = [req.name, req.address + (req.zip ? " " + req.zip : ""), req.email, req.phone];

  let table, nextSteps, subject;
  if (quote.commercial) {
    subject = "Your walkthrough request " + quoteNumber + " — " + CONFIG.shortName;
    table = p_("Thank you for asking about commercial cleaning. Commercial prices are set after a short walkthrough of your space, so this request doesn't include a price yet.");
    nextSteps = ["We'll call or email within one business day to schedule a walkthrough.", "After the walkthrough you'll get a written scope and monthly price.", "Nothing is charged until you approve it."];
  } else if (quote.priced) {
    subject = "Your cleaning quote " + quoteNumber + " — " + money_(quote.total) + (quote.perVisit ? " per visit" : "");
    table = linesTable_(quote.lines, quote.total, quote.perVisit ? "Estimated total per visit" : "Estimated total");
    nextSteps = ["We'll contact you within one business day to confirm your price and appointment.", "This estimate assumes your home is in typical condition. If anything differs on arrival, we'll check with you before continuing.", "Nothing is charged until your appointment is confirmed."];
  } else {
    subject = "Your cleaning request " + quoteNumber + " — " + CONFIG.shortName;
    table = p_("Your home or schedule needs a custom price" + (req.service === "recurring" && req.frequency !== "biweekly" ? " (weekly and monthly visits are priced individually)" : "") + ". We'll reply with an exact price.") +
      (quote.lines.length ? linesTable_(quote.lines, null, "Add-ons selected") : "");
    nextSteps = ["We'll reply within one business day with your price.", "Nothing is charged until your appointment is confirmed."];
  }
  const details = quote.priced ? "" : detailRows_([["Service", quote.description]]);
  const html = shell_("Quote", meta, who, details + table + stepsBlock_(nextSteps) + p_("Questions? Just reply to this email" + (CONFIG.phone ? " or call " + esc_(CONFIG.phone) : "") + ".", true));
  const text = [
    CONFIG.businessName, CONFIG.slogan, "",
    "QUOTE " + quoteNumber, "Issued " + fmtDate_(issued, "MMMM d, yyyy") + " · valid until " + fmtDate_(validUntil, "MMMM d, yyyy"), "",
    "Prepared for: " + who.filter(String).join(", "), "",
    quote.description
  ].concat(quote.lines.map(function (l) { return "  " + l.label + ": " + money_(l.amount); }))
    .concat(quote.priced ? [(CONFIG.showSalesTaxLine ? "  WA sales tax: $0.00\n" : "") + "  TOTAL: " + money_(quote.total) + (quote.perVisit ? " per visit" : "")] : ["  Price: we'll confirm"])
    .concat(["", "Next steps:"]).concat(nextSteps.map(function (s) { return "- " + s; }))
    .concat(["", "Questions? Reply to this email" + (CONFIG.phone ? " or call " + CONFIG.phone : "") + "."]).join("\n");
  return { subject: subject, html: html, text: text };
}

function renderInvoiceEmail_(rec, invoiceNumber, lines, total, issued, serviceDate, payUrl) {
  const due = CONFIG.invoiceDueDays > 0 ? fmtDate_(new Date(issued.getTime() + CONFIG.invoiceDueDays * 86400000), "MMMM d, yyyy") : "Due on receipt";
  const meta = [["Invoice", invoiceNumber], ["Issued", fmtDate_(issued, "MMMM d, yyyy")], ["Due", due]];
  if (rec["Quote #"]) meta.push(["Quote", rec["Quote #"]]);
  if (serviceDate) meta.push(["Service date", serviceDate]);
  const who = [rec["Name"], rec["Address"] + (rec["ZIP"] ? " " + rec["ZIP"] : ""), rec["Email"], rec["Phone"]];
  const reviewUrl = reviewLink_();
  const payButton = payUrl
    ? '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 12px"><tr><td style="background:' + C_.ink + '">' +
      '<a href="' + esc_(payUrl) + '" style="display:inline-block;padding:15px 26px;font:500 12px ' + SANS_ + ';letter-spacing:2px;text-transform:uppercase;color:' + C_.paper + ';text-decoration:none">Pay ' + money_(total) + " by card</a></td></tr></table>" +
      p_("Secure checkout by Stripe. We never see your card number.", true)
    : "";
  const otherWays = CONFIG.paymentInstructions ? p_((payUrl ? "Other ways to pay: " : "") + esc_(CONFIG.paymentInstructions)) : "";
  const body = linesTable_(lines, total, "Amount due") +
    block_("How to pay", payButton + otherWays) +
    (reviewUrl ? block_("How did we do?", p_("A short review helps neighbors find us and tells us what to keep doing. " +
      '<a href="' + esc_(reviewUrl) + '" style="color:' + C_.ink + '">Leave a review</a>')) : "") +
    p_("Thank you for choosing " + esc_(CONFIG.businessName) + ". Questions about this invoice? Reply to this email" + (CONFIG.phone ? " or call " + esc_(CONFIG.phone) : "") + ".", true);
  const text = [
    CONFIG.businessName, "", "INVOICE " + invoiceNumber, "Issued " + fmtDate_(issued, "MMMM d, yyyy") + " · " + due, "",
    "Bill to: " + who.filter(String).join(", "), ""
  ].concat(lines.map(function (l) { return "  " + l.label + ": " + money_(l.amount); }))
    .concat([(CONFIG.showSalesTaxLine ? "  WA sales tax: $0.00\n" : "") + "  AMOUNT DUE: " + money_(total), ""])
    .concat(payUrl ? ["Pay by card (secure checkout by Stripe): " + payUrl] : [])
    .concat(CONFIG.paymentInstructions ? [(payUrl ? "Other ways to pay: " : "How to pay: ") + CONFIG.paymentInstructions] : [])
    .concat(reviewUrl ? ["", "How did we do? Leave a review: " + reviewUrl] : []).join("\n");
  return { subject: "Invoice " + invoiceNumber + " — " + money_(total) + " — " + CONFIG.shortName, html: shell_("Invoice", meta, who, body, "Bill to"), text: text };
}

function renderOwnerAlert_(req, quote, quoteNumber, emailed) {
  const rows = [
    ["Quote", quoteNumber + (quote.priced ? " · " + money_(quote.total) + (quote.perVisit ? " per visit" : "") : " · needs a custom price")],
    ["Customer emailed", emailed ? "Yes" : "NO — the quote email failed. Reply to the customer yourself."],
    ["Name", req.name], ["Phone", req.phone], ["Email", req.email], ["Address", req.address + " " + req.zip],
    ["Service", quote.description], ["Add-ons", req.addons.map(function (k) { return PRICES.addons[k].label; }).join(", ") || "None"],
    ["Preferred date", req.date ? fmtYmd_(req.date) : "Flexible"], ["Notes", req.notes || "—"]
  ];
  let sheetUrl = "";
  try { sheetUrl = SpreadsheetApp.openById(sheetId_()).getUrl(); } catch (e) { /* ignore */ }
  const html = '<div style="font-family:' + SANS_ + ';font-size:14px;color:' + C_.ink + '">' +
    '<p style="font-family:' + SERIF_ + ';font-size:20px;margin:0 0 12px">New quote request</p>' + detailRows_(rows) +
    (sheetUrl ? '<p><a href="' + esc_(sheetUrl) + '" style="color:' + C_.ink + '">Open the Quotes sheet</a></p>' : "") +
    '<p style="color:' + C_.muted + '">Reply to this email to answer the customer directly.</p></div>';
  const text = rows.map(function (r) { return r[0] + ": " + r[1]; }).join("\n") + (sheetUrl ? "\n\nSheet: " + sheetUrl : "");
  return { subject: "New quote request " + quoteNumber + " — " + req.name + (quote.priced ? " — " + money_(quote.total) : ""), html: html, text: text };
}

function renderReviewAlert_(rv) {
  const stars = "★★★★★".slice(0, rv.rating) + "☆☆☆☆☆".slice(0, 5 - rv.rating);
  const rows = [
    ["Rating", stars + " (" + rv.rating + " of 5)"], ["Review", rv.text], ["Shown as", shortName_(rv.name) + (rv.city ? ", " + rv.city : "")],
    ["Name", rv.name], ["Email", rv.email], ["Service", rv.service ? LABELS.service[rv.service] : "—"]
  ];
  let sheetUrl = "";
  try { sheetUrl = SpreadsheetApp.openById(sheetId_()).getUrl(); } catch (e) { /* ignore */ }
  const how = "To post it on the website, open the Reviews tab and set Show on website to Yes. Post every genuine customer review, including critical ones. Hide only spam, people who weren't customers, or reviews with private details.";
  const html = '<div style="font-family:' + SANS_ + ';font-size:14px;color:' + C_.ink + '">' +
    '<p style="font-family:' + SERIF_ + ';font-size:20px;margin:0 0 12px">New review to check</p>' + detailRows_(rows) +
    '<p style="color:' + C_.body + '">' + esc_(how) + "</p>" +
    (sheetUrl ? '<p><a href="' + esc_(sheetUrl) + '" style="color:' + C_.ink + '">Open the sheet</a></p>' : "") + "</div>";
  const text = rows.map(function (r) { return r[0] + ": " + r[1]; }).join("\n") + "\n\n" + how + (sheetUrl ? "\n\nSheet: " + sheetUrl : "");
  return { subject: "New review to check — " + rv.rating + " of 5 from " + shortName_(rv.name), html: html, text: text };
}

// --- email building blocks (table layout + inline styles for email clients) ---
function shell_(kind, meta, who, body, whoLabel) {
  const metaHtml = meta.map(function (m) {
    return '<tr><td valign="top" style="padding:5px 16px 5px 0;border-bottom:1px solid ' + C_.rule + ';font:10px/1.9 ' + SANS_ + ';letter-spacing:2px;text-transform:uppercase;color:' + C_.muted + ';white-space:nowrap">' + esc_(m[0]) +
      '</td><td style="padding:5px 0;border-bottom:1px solid ' + C_.rule + ';font:14px/1.5 ' + SANS_ + ';color:' + C_.ink + ';text-align:right">' + esc_(m[1]) + "</td></tr>";
  }).join("");
  const whoHtml = who.filter(function (w) { return w && String(w).trim(); }).map(esc_).join("<br>");
  const contact = [CONFIG.phone, CONFIG.replyTo || "", CONFIG.website].filter(String).map(esc_).join(" &nbsp;·&nbsp; ");
  return '<!doctype html><html><body style="margin:0;padding:0;background:' + C_.stone + '">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + C_.stone + '"><tr><td align="center" style="padding:28px 12px">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:' + C_.paper + ';border:1px solid ' + C_.ink + '">' +
    '<tr><td align="center" style="padding:28px 28px 20px;border-bottom:1px solid ' + C_.ink + '">' +
    '<div style="font:26px/1.1 ' + SERIF_ + ';letter-spacing:1px;text-transform:uppercase;color:' + C_.ink + '">' + esc_(CONFIG.shortName) + "</div>" +
    '<div style="font:10px ' + SANS_ + ';letter-spacing:3px;text-transform:uppercase;color:' + C_.muted + ';padding-top:6px">' + esc_(CONFIG.slogan) + "</div></td></tr>" +
    '<tr><td style="padding:26px 28px 6px">' +
    '<div style="font:34px/1 ' + SERIF_ + ';text-transform:uppercase;color:' + C_.ink + ';padding-bottom:14px">' + esc_(kind) + "</div>" +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px">' + metaHtml + "</table>" +
    "</td></tr>" +
    '<tr><td style="padding:0 28px 18px"><div style="font:10px ' + SANS_ + ';letter-spacing:2px;text-transform:uppercase;color:' + C_.muted + ';padding-bottom:6px">' + esc_(whoLabel || "Prepared for") + "</div>" +
    '<div style="font:14px/1.6 ' + SANS_ + ';color:' + C_.ink + '">' + whoHtml + "</div></td></tr>" +
    '<tr><td style="padding:0 28px 28px">' + body + "</td></tr>" +
    '<tr><td align="center" style="padding:18px 28px;border-top:1px solid ' + C_.ink + ';font:10px/1.8 ' + SANS_ + ';letter-spacing:1.5px;text-transform:uppercase;color:' + C_.muted + '">' +
    esc_(CONFIG.businessName) + (contact ? "<br>" + contact : "") + "</td></tr>" +
    "</table></td></tr></table></body></html>";
}

function linesTable_(lines, total, totalLabel) {
  const cell = "padding:11px 0;border-bottom:1px solid " + C_.rule + ";font:14px/1.4 " + SANS_ + ";color:" + C_.ink;
  let rows = '<tr><td style="padding:0 0 8px;border-bottom:1px solid ' + C_.ink + ';font:10px ' + SANS_ + ';letter-spacing:2px;text-transform:uppercase;color:' + C_.muted + '">Description</td>' +
    '<td align="right" style="padding:0 0 8px;border-bottom:1px solid ' + C_.ink + ';font:10px ' + SANS_ + ';letter-spacing:2px;text-transform:uppercase;color:' + C_.muted + '">Amount</td></tr>';
  rows += lines.map(function (l) {
    return '<tr><td style="' + cell + '">' + esc_(l.label) + '</td><td align="right" style="' + cell + ';white-space:nowrap">' + money_(l.amount) + "</td></tr>";
  }).join("");
  if (total != null) {
    if (CONFIG.showSalesTaxLine) {
      rows += '<tr><td style="' + cell + ';color:' + C_.muted + '">WA sales tax <span style="font-size:12px">(routine cleaning isn\'t taxable)</span></td><td align="right" style="' + cell + ';color:' + C_.muted + '">$0.00</td></tr>';
    }
    rows += '<tr><td style="padding:16px 0 0;font:10px ' + SANS_ + ';letter-spacing:2px;text-transform:uppercase;color:' + C_.ink + '">' + esc_(totalLabel) +
      '</td><td align="right" style="padding:14px 0 0;font:30px/1 ' + SERIF_ + ';color:' + C_.ink + ';white-space:nowrap">' + money_(total) + "</td></tr>";
  } else if (totalLabel && lines.length) {
    rows = '<tr><td colspan="2" style="padding:14px 0 6px;font:10px ' + SANS_ + ';letter-spacing:2px;text-transform:uppercase;color:' + C_.muted + '">' + esc_(totalLabel) + "</td></tr>" + rows.replace(/^<tr>.*?<\/tr>/, "");
  }
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 22px">' + rows + "</table>";
}

function detailRows_(rows) {
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px">' + rows.map(function (r) {
    return '<tr><td valign="top" style="padding:5px 12px 5px 0;width:130px;font:10px/1.8 ' + SANS_ + ';letter-spacing:2px;text-transform:uppercase;color:' + C_.muted + '">' + esc_(r[0]) +
      '</td><td style="padding:5px 0;font:14px/1.5 ' + SANS_ + ';color:' + C_.ink + ';white-space:pre-line">' + esc_(r[1]) + "</td></tr>";
  }).join("") + "</table>";
}

function stepsBlock_(steps) {
  return block_("What happens next", '<ol style="margin:0;padding-left:18px;font:14px/1.6 ' + SANS_ + ';color:' + C_.body + '">' +
    steps.map(function (s) { return '<li style="padding-bottom:6px">' + esc_(s) + "</li>"; }).join("") + "</ol>");
}

function block_(title, inner) {
  return '<div style="background:' + C_.stone + ';padding:18px 20px;margin:0 0 20px"><div style="font:16px ' + SERIF_ + ';text-transform:uppercase;letter-spacing:1px;color:' + C_.ink + ';padding-bottom:8px">' +
    esc_(title) + "</div>" + inner + "</div>";
}

function p_(html, muted) {
  return '<p style="margin:0 0 16px;font:14px/1.6 ' + SANS_ + ';color:' + (muted ? C_.muted : C_.body) + '">' + html + "</p>";
}

// ===== Sheet menu: invoices and tools =====
function onOpen() {
  SpreadsheetApp.getUi().createMenu("PCCS")
    .addItem("Send invoice for selected row", "sendInvoiceForSelectedRow")
    .addItem("Resend quote for selected row", "resendQuoteForSelectedRow")
    .addItem("Check for card payments", "checkCardPayments")
    .addSeparator()
    .addItem("Send a test quote to me", "sendTestQuote")
    .addItem("Connect Stripe (card payments)", "connectStripe")
    .addItem("Set up this sheet", "setup")
    .addToUi();
}

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getScriptProperties().setProperty("SHEET_ID", ss.getId());
  const sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME, 0);
  const existing = sheet.getLastColumn() ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0] : [];
  if (!existing.filter(String).length) sheet.getRange(1, 1, 1, COLS.length).setValues([COLS]);
  else ensureCols_(sheet, COLS); // an older sheet gets any new columns added at the end
  const map = headerMap_(sheet);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, sheet.getLastColumn()).setFontWeight("bold").setBackground(C_.stone);
  const rows = Math.max(sheet.getMaxRows() - 1, 1);
  const status = SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).setAllowInvalid(true).build();
  sheet.getRange(2, map["Status"], rows, 1).setDataValidation(status);
  MONEY_COLS.forEach(function (c) { sheet.getRange(2, map[c], rows, 1).setNumberFormat("$#,##0.00"); });
  sheet.getRange(2, map["Received"], rows, 1).setNumberFormat("yyyy-mm-dd h:mm am/pm");
  sheet.getRange(2, map["Paid on"], rows, 1).setNumberFormat("yyyy-mm-dd");
  sheet.hideColumns(map["Data (do not edit)"]);
  reviewsSheet_(ss);
  const missing = [];
  if (!CONFIG.phone) missing.push("phone");
  if (!CONFIG.paymentInstructions && !stripeKey_()) missing.push("paymentInstructions (needed for invoices unless Stripe is connected)");
  if (!CONFIG.website) missing.push("website (adds the review link to invoices)");
  SpreadsheetApp.getUi().alert("Sheet is ready.\n\nNext: Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone), then put the web app URL in the website's config.js." +
    (missing.length ? "\n\nStill empty in Config.gs: " + missing.join(", ") + "." : ""));
}

function sendInvoiceForSelectedRow() {
  const ui = SpreadsheetApp.getUi();
  if (!CONFIG.paymentInstructions && !stripeKey_()) { ui.alert("Add your payment instructions to paymentInstructions in Config.gs (or connect Stripe from the PCCS menu) first, so customers know how to pay."); return; }
  const sel = selectedRecord_();
  if (!sel) return;
  const rec = sel.rec;
  if (!/@/.test(String(rec["Email"]))) { ui.alert("This row has no customer email."); return; }
  const data = parseData_(rec);
  const quoted = data && data.quote && data.quote.priced ? Number(data.quote.total) : null;
  const final = rec["Final amount"] !== "" && rec["Final amount"] != null ? Number(rec["Final amount"]) : quoted;
  if (!(final > 0)) { ui.alert("Enter the job's Final amount in this row first."); return; }

  let lines;
  if (data && data.quote && data.quote.priced) {
    lines = data.quote.lines.slice();
    const diff = Math.round((final - quoted) * 100) / 100;
    if (diff !== 0) lines.push({ label: String(rec["Invoice note"] || "Adjustment").slice(0, 120), amount: diff });
  } else {
    const desc = (data && data.quote && data.quote.description) || String(rec["Service"] || "Cleaning service");
    const addons = String(rec["Add-ons"] || "");
    lines = [{ label: desc + (addons ? " (includes: " + addons + ")" : ""), amount: final }];
    if (rec["Invoice note"]) lines[0].label += " — " + String(rec["Invoice note"]).slice(0, 120);
  }
  if (rec["Invoice #"]) {
    const again = ui.alert("Invoice " + rec["Invoice #"] + " was already sent for this row.", "Send it again?", ui.ButtonSet.YES_NO);
    if (again !== ui.Button.YES) return;
  }
  const now = new Date();
  const invoiceNumber = rec["Invoice #"] || nextNumber_("INV", now);
  const serviceDate = rec["Service date"] instanceof Date ? fmtDate_(rec["Service date"], "MMMM d, yyyy") :
    (rec["Service date"] ? String(rec["Service date"]) : (rec["Preferred date"] ? fmtYmd_(String(rec["Preferred date"])) : ""));
  ensureCols_(sel.sheet, ["Card pay link", "Paid on"]);

  // Card payment link (only when Stripe is connected).
  let payUrl = "";
  if (stripeKey_()) {
    try {
      const link = cardPayLink_(invoiceNumber, final, rec);
      if (link && link.paidAt) {
        setCell_(sel.sheet, sel.row, "Status", "Paid");
        setCell_(sel.sheet, sel.row, "Paid on", link.paidAt);
        ui.alert("Invoice " + invoiceNumber + " was already paid by card (" + money_(link.paidAmount) + "). The row is now marked Paid, and nothing was sent.");
        return;
      }
      if (link) payUrl = payPageUrl_(link.url, String(rec["Email"]), invoiceNumber);
    } catch (err) {
      console.error(err);
      if (!CONFIG.paymentInstructions) { ui.alert("Couldn't create the card payment link, so the invoice wasn't sent.\n\n" + err.message); return; }
      const goOn = ui.alert("Couldn't create the card payment link.", err.message + "\n\nSend the invoice without a card link (your other payment instructions only)?", ui.ButtonSet.YES_NO);
      if (goOn !== ui.Button.YES) return;
    }
  }

  const msg = renderInvoiceEmail_(rec, invoiceNumber, lines, final, now, serviceDate, payUrl);
  MailApp.sendEmail({ to: String(rec["Email"]), subject: msg.subject, body: msg.text, htmlBody: msg.html, name: CONFIG.businessName, replyTo: replyTo_() });
  setCell_(sel.sheet, sel.row, "Invoice #", invoiceNumber);
  setCell_(sel.sheet, sel.row, "Invoice sent", now);
  setCell_(sel.sheet, sel.row, "Card pay link", payUrl);
  if (rec["Final amount"] === "" || rec["Final amount"] == null) setCell_(sel.sheet, sel.row, "Final amount", final);
  if (["Paid", "Lost"].indexOf(String(rec["Status"])) < 0) setCell_(sel.sheet, sel.row, "Status", "Invoiced");
  ui.alert("Invoice " + invoiceNumber + " for " + money_(final) + " sent to " + rec["Email"] + (payUrl ? ", with a card payment link" : "") + ".");
}

// ===== Card payments (Stripe) =====
// The Stripe key is kept in Script Properties (PCCS → Connect Stripe), never in Config.gs or the
// website. Each invoice gets one payment link for its exact amount that closes after one payment.
const STRIPE_KEY_PROP = "STRIPE_SECRET_KEY";
const STRIPE_PRODUCT_PROP = "stripe:product";
const PAYMENT_CHECK_HANDLER = "checkCardPaymentsHourly";

function stripeKey_() { return PropertiesService.getScriptProperties().getProperty(STRIPE_KEY_PROP) || ""; }
function stripeMode_(key) { return /_test_/.test(key) ? "test" : "live"; }

function stripe_(method, path, params, key) {
  const opts = { method: method, headers: { Authorization: "Bearer " + (key || stripeKey_()) }, muteHttpExceptions: true };
  let url = "https://api.stripe.com/v1/" + path;
  if (method === "get") {
    const qs = Object.keys(params || {}).map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(params[k]); }).join("&");
    if (qs) url += "?" + qs;
  } else {
    opts.payload = params || {};
  }
  const res = UrlFetchApp.fetch(url, opts);
  let body = {};
  try { body = JSON.parse(res.getContentText()); } catch (e) { /* not JSON */ }
  if (res.getResponseCode() >= 300) {
    throw new Error("Stripe said: " + ((body.error && body.error.message) || "error " + res.getResponseCode()));
  }
  return body;
}

// The first completed, paid checkout for a payment link, or null.
function paidSession_(linkId) {
  const list = stripe_("get", "checkout/sessions", { payment_link: linkId, status: "complete", limit: "10" });
  return (list.data || []).filter(function (s) { return s.payment_status === "paid"; })[0] || null;
}

// One reusable Stripe product for all invoices, so the product catalog stays tidy.
function stripeProduct_() {
  const props = PropertiesService.getScriptProperties();
  const saved = props.getProperty(STRIPE_PRODUCT_PROP);
  if (saved) return saved;
  const product = stripe_("post", "products", { name: CONFIG.businessName + " — cleaning invoice" });
  props.setProperty(STRIPE_PRODUCT_PROP, product.id);
  return product.id;
}

// Returns { url } for this invoice's payment link, creating or replacing it as needed, or
// { paidAt, paidAmount } if the invoice's current link has already been paid.
function cardPayLink_(invoiceNumber, amount, rec) {
  const cents = Math.round(Number(amount) * 100);
  if (!(cents >= 50)) return null; // Stripe's minimum charge is $0.50
  const props = PropertiesService.getScriptProperties();
  const key = "stripe:" + invoiceNumber;
  let saved = null;
  try { saved = JSON.parse(props.getProperty(key) || "null"); } catch (e) { saved = null; }
  if (saved && saved.id) {
    const paid = paidSession_(saved.id);
    if (paid) return { paidAt: new Date(paid.created * 1000), paidAmount: (paid.amount_total || 0) / 100 };
    if (saved.cents === cents) return saved; // same amount: reuse the link already sent
    stripe_("post", "payment_links/" + saved.id, { active: "false" }); // amount changed: retire the old link
  }
  const label = "Invoice " + invoiceNumber + " — " + CONFIG.businessName;
  const newPrice = function () { return stripe_("post", "prices", { currency: "usd", unit_amount: String(cents), product: stripeProduct_() }); };
  let price;
  try {
    price = newPrice();
  } catch (err) {
    if (!/no such product/i.test(err.message)) throw err;
    props.deleteProperty(STRIPE_PRODUCT_PROP); // the saved product was deleted in Stripe: make a new one
    price = newPrice();
  }
  const linkParams = {
    "line_items[0][price]": price.id,
    "line_items[0][quantity]": "1",
    "restrictions[completed_sessions][limit]": "1",
    "inactive_message": "Invoice " + invoiceNumber + " has been paid or replaced by a newer invoice. Questions? Reply to your invoice email.",
    "submit_type": "pay",
    "metadata[invoice]": invoiceNumber,
    "payment_intent_data[description]": label,
    "payment_intent_data[metadata][invoice]": invoiceNumber,
    "after_completion[type]": "hosted_confirmation",
    "after_completion[hosted_confirmation][custom_message]": "Thank you! Your payment for invoice " + invoiceNumber + " is complete."
  };
  if (rec && rec["Quote #"]) linkParams["metadata[quote]"] = String(rec["Quote #"]);
  const link = stripe_("post", "payment_links", linkParams);
  const out = { id: link.id, url: link.url, cents: cents };
  props.setProperty(key, JSON.stringify(out));
  return out;
}

// The link sent to the customer, with their email filled in and the invoice number attached.
function payPageUrl_(url, email, invoiceNumber) {
  const q = [];
  if (/@/.test(email)) q.push("prefilled_email=" + encodeURIComponent(email));
  q.push("client_reference_id=" + encodeURIComponent(invoiceNumber.replace(/[^A-Za-z0-9_-]/g, "")));
  return url + (url.indexOf("?") < 0 ? "?" : "&") + q.join("&");
}

// Marks rows Paid when their invoice's card payment link has been paid. Returns what changed.
function markCardPayments_() {
  const out = { paid: [], errors: [] };
  const sheet = quotesSheet_();
  ensureCols_(sheet, ["Card pay link", "Paid on"]);
  const map = headerMap_(sheet);
  const last = sheet.getLastRow();
  if (last < 2) return out;
  const values = sheet.getRange(2, 1, last - 1, sheet.getLastColumn()).getValues();
  const props = PropertiesService.getScriptProperties();
  values.forEach(function (v, i) {
    const inv = String(v[map["Invoice #"] - 1] || "");
    const status = String(v[map["Status"] - 1] || "");
    if (!inv || status === "Paid" || status === "Lost") return;
    let saved = null;
    try { saved = JSON.parse(props.getProperty("stripe:" + inv) || "null"); } catch (e) { saved = null; }
    if (!saved || !saved.id) return;
    try {
      const paid = paidSession_(saved.id);
      if (!paid) return;
      sheet.getRange(i + 2, map["Status"]).setValue("Paid");
      sheet.getRange(i + 2, map["Paid on"]).setValue(new Date(paid.created * 1000));
      out.paid.push(inv + " — " + money_((paid.amount_total || 0) / 100) + " — " + v[map["Name"] - 1]);
    } catch (err) {
      out.errors.push(inv + ": " + err.message);
    }
  });
  return out;
}

function checkCardPayments() {
  const ui = SpreadsheetApp.getUi();
  if (!stripeKey_()) { ui.alert("Stripe isn't connected yet. Use PCCS → Connect Stripe (card payments) first."); return; }
  const res = markCardPayments_();
  ui.alert((res.paid.length ? "Marked as Paid:\n" + res.paid.join("\n") : "No new card payments.") +
    (res.errors.length ? "\n\nCouldn't check:\n" + res.errors.join("\n") : ""));
}

// Runs every hour once Stripe is connected.
function checkCardPaymentsHourly() {
  if (!stripeKey_()) return;
  const res = markCardPayments_();
  if (res.errors.length) console.error("Card payment check: " + res.errors.join("; "));
}

function connectStripe() {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getScriptProperties();
  const current = stripeKey_();
  const intro = current
    ? "Stripe is connected (" + stripeMode_(current) + " mode). Paste a new key to replace it, or type DISCONNECT to turn card payments off.\n\n"
    : "Invoices will include a \"Pay by card\" button, and paid invoices are marked Paid every hour.\n\n";
  const res = ui.prompt("Connect Stripe", intro + "Paste your Stripe restricted key (it starts with rk_live_). docs/stripe-setup.md shows how to make one.", ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const input = String(res.getResponseText() || "").trim();
  if (current && input.toUpperCase() === "DISCONNECT") {
    props.deleteProperty(STRIPE_KEY_PROP);
    setPaymentCheck_(false);
    ui.alert("Stripe is disconnected. New invoices use only your payment instructions. Links already sent keep working until you turn them off in Stripe.");
    return;
  }
  if (!/^(rk|sk)_(live|test)_[A-Za-z0-9]{10,}$/.test(input)) { ui.alert("That doesn't look like a Stripe key. Restricted keys start with rk_live_ (or rk_test_ for practice)."); return; }
  if (/^sk_/.test(input)) {
    const ok = ui.alert("That's a full secret key.", "A restricted key (rk_...) can only do what invoices need, so it's safer if anything goes wrong. Use this key anyway?", ui.ButtonSet.YES_NO);
    if (ok !== ui.Button.YES) return;
  }
  try {
    stripe_("get", "payment_links", { limit: "1" }, input);
    stripe_("get", "checkout/sessions", { limit: "1" }, input);
  } catch (err) {
    ui.alert("Stripe didn't accept that key, so nothing was saved.\n\n" + err.message + "\n\nThe key needs: Products, Prices and Payment Links set to Write, and Checkout Sessions set to Read.");
    return;
  }
  if (current && stripeMode_(current) !== stripeMode_(input)) props.deleteProperty(STRIPE_PRODUCT_PROP); // test and live have separate catalogs
  props.setProperty(STRIPE_KEY_PROP, input);
  setPaymentCheck_(true);
  ui.alert("Stripe connected (" + stripeMode_(input) + " mode).\n\nNew invoices include a \"Pay by card\" button for the exact amount. Paid invoices are marked Paid every hour, or right away with PCCS → Check for card payments." +
    (stripeMode_(input) === "test" ? "\n\nThis is a test key: no real money moves. Connect your rk_live_ key before sending real invoices." : ""));
}

function setPaymentCheck_(on) {
  const existing = ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === PAYMENT_CHECK_HANDLER; });
  if (on && !existing.length) ScriptApp.newTrigger(PAYMENT_CHECK_HANDLER).timeBased().everyHours(1).create();
  if (!on) existing.forEach(function (t) { ScriptApp.deleteTrigger(t); });
}

function resendQuoteForSelectedRow() {
  const ui = SpreadsheetApp.getUi();
  const sel = selectedRecord_();
  if (!sel) return;
  const data = parseData_(sel.rec);
  if (!data) { ui.alert("This row wasn't created by the website form, so there's no quote to resend."); return; }
  const msg = renderQuoteEmail_(data.req, data.quote, sel.rec["Quote #"], new Date(data.issued));
  MailApp.sendEmail({ to: data.req.email, subject: msg.subject, body: msg.text, htmlBody: msg.html, name: CONFIG.businessName, replyTo: replyTo_() });
  ui.alert("Quote " + sel.rec["Quote #"] + " sent again to " + data.req.email + ".");
}

function sendTestQuote() {
  const me = ownerEmail_();
  const req = { name: "Test Customer", email: me, phone: CONFIG.phone || "(253) 555-0100", address: "123 Example St, Tacoma, WA", zip: "98402",
    propertyType: "house", service: "standard", frequency: "once", bedrooms: 2, bathrooms: 1, sqft: 1100, addons: ["fridge", "oven"], date: "", notes: "" };
  const msg = renderQuoteEmail_(req, buildQuote_(req), "Q-TEST", new Date());
  MailApp.sendEmail({ to: me, subject: "[Test] " + msg.subject, body: msg.text, htmlBody: msg.html, name: CONFIG.businessName, replyTo: replyTo_() });
  SpreadsheetApp.getUi().alert("Test quote sent to " + me + ".");
}

// ===== Helpers =====
function quotesSheet_() {
  const ss = SpreadsheetApp.openById(sheetId_());
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error("Run setup first: the Quotes sheet is missing.");
  return sheet;
}

// The Reviews tab, created with its headers and dropdowns the first time it's needed.
function reviewsSheet_(ss) {
  ss = ss || SpreadsheetApp.openById(sheetId_());
  let sheet = ss.getSheetByName(REVIEWS_SHEET);
  if (!sheet) sheet = ss.insertSheet(REVIEWS_SHEET);
  const existing = sheet.getLastColumn() ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0] : [];
  if (!existing.filter(String).length) {
    sheet.getRange(1, 1, 1, REVIEW_COLS.length).setValues([REVIEW_COLS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, REVIEW_COLS.length).setFontWeight("bold").setBackground(C_.stone);
    const rows = Math.max(sheet.getMaxRows() - 1, 1);
    const list = function (values) { return SpreadsheetApp.newDataValidation().requireValueInList(values, true).setAllowInvalid(true).build(); };
    sheet.getRange(2, REVIEW_COLS.indexOf("Show on website") + 1, rows, 1).setDataValidation(list(["Yes", "No"]));
    sheet.getRange(2, REVIEW_COLS.indexOf("Rating") + 1, rows, 1).setDataValidation(list(["5", "4", "3", "2", "1"]));
    sheet.getRange(2, REVIEW_COLS.indexOf("Source") + 1, rows, 1).setDataValidation(list(REVIEW_SOURCES));
    sheet.getRange(2, REVIEW_COLS.indexOf("Date") + 1, rows, 1).setNumberFormat("yyyy-mm-dd");
  }
  return sheet;
}

function sheetId_() {
  const id = PropertiesService.getScriptProperties().getProperty("SHEET_ID");
  if (!id) throw new Error("Run setup first.");
  return id;
}

function headerMap_(sheet) {
  const head = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const map = {};
  head.forEach(function (h, i) { if (h) map[String(h)] = i + 1; });
  return map;
}

// Adds any of these column headings that the sheet doesn't have yet, at the end of the header row.
function ensureCols_(sheet, names) {
  const map = headerMap_(sheet);
  let next = sheet.getLastColumn() + 1;
  names.forEach(function (n) {
    if (!map[n]) { sheet.getRange(1, next).setValue(n); next++; }
  });
}

function appendRecord_(sheet, rec) {
  const map = headerMap_(sheet);
  const width = Math.max.apply(null, Object.keys(map).map(function (k) { return map[k]; }));
  const row = [];
  for (let i = 0; i < width; i++) row.push("");
  Object.keys(rec).forEach(function (k) { if (map[k]) row[map[k] - 1] = rec[k]; });
  sheet.appendRow(row);
}

function selectedRecord_() {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  if (sheet.getName() !== SHEET_NAME) { ui.alert("Open the " + SHEET_NAME + " tab and click a customer's row first."); return null; }
  const row = sheet.getActiveRange().getRow();
  if (row < 2) { ui.alert("Click a customer's row first (not the header)."); return null; }
  const map = headerMap_(sheet);
  const values = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
  const rec = {};
  Object.keys(map).forEach(function (k) { rec[k] = values[map[k] - 1]; });
  return { sheet: sheet, row: row, rec: rec };
}

function setCell_(sheet, row, col, value) {
  const map = headerMap_(sheet);
  if (map[col]) sheet.getRange(row, map[col]).setValue(value);
}

function parseData_(rec) {
  try { return JSON.parse(String(rec["Data (do not edit)"] || "")); } catch (e) { return null; }
}

function withoutNotes_(req) {
  const copy = {};
  Object.keys(req).forEach(function (k) { if (k !== "notes") copy[k] = req[k]; });
  return copy;
}

function nextNumber_(prefix, date) {
  const year = fmtDate_(date, "yyyy");
  const props = PropertiesService.getScriptProperties();
  const key = "seq:" + prefix + ":" + year;
  const n = Number(props.getProperty(key) || 0) + 1;
  props.setProperty(key, String(n));
  return prefix + "-" + year + "-" + ("000" + n).slice(-4);
}

function ownerEmail_() { return Session.getEffectiveUser().getEmail(); }
function replyTo_() { return CONFIG.replyTo || ownerEmail_(); }

function fmtDate_(d, pattern) { return Utilities.formatDate(d, CONFIG.timeZone, pattern); }
function fmtYmd_(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  return Utilities.formatDate(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)), "UTC", "EEEE, MMMM d, yyyy");
}

function money_(n) {
  const v = Number(n) || 0;
  const s = Math.abs(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (v < 0 ? "−$" : "$") + s;
}

function esc_(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
