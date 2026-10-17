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
  "Invoice #", "Invoice sent", "Notes", "Data (do not edit)"
];
const STATUSES = ["New", "Contacted", "Booked", "Completed", "Invoiced", "Paid", "Lost", "Test"];
const MONEY_COLS = ["Quote total", "Final amount"];

const LABELS = {
  propertyType: { house: "House", apartment: "Apartment", condo: "Condo / townhome", commercial: "Office or commercial space", rental: "Short-term rental" },
  service: { standard: "Standard clean", deep: "Deep clean", moveout: "Move-in / move-out clean", recurring: "Recurring cleaning", commercial: "Commercial walkthrough" },
  frequency: { once: "One-time", weekly: "Weekly", biweekly: "Every two weeks", monthly: "Monthly" }
};

// ===== Web app =====
function doGet() {
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
    return json_(handleQuote_(data));
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

function renderInvoiceEmail_(rec, invoiceNumber, lines, total, issued, serviceDate) {
  const due = CONFIG.invoiceDueDays > 0 ? fmtDate_(new Date(issued.getTime() + CONFIG.invoiceDueDays * 86400000), "MMMM d, yyyy") : "Due on receipt";
  const meta = [["Invoice", invoiceNumber], ["Issued", fmtDate_(issued, "MMMM d, yyyy")], ["Due", due]];
  if (rec["Quote #"]) meta.push(["Quote", rec["Quote #"]]);
  if (serviceDate) meta.push(["Service date", serviceDate]);
  const who = [rec["Name"], rec["Address"] + (rec["ZIP"] ? " " + rec["ZIP"] : ""), rec["Email"], rec["Phone"]];
  const body = linesTable_(lines, total, "Amount due") +
    block_("How to pay", p_(esc_(CONFIG.paymentInstructions))) +
    p_("Thank you for choosing " + esc_(CONFIG.businessName) + ". Questions about this invoice? Reply to this email" + (CONFIG.phone ? " or call " + esc_(CONFIG.phone) : "") + ".", true);
  const text = [
    CONFIG.businessName, "", "INVOICE " + invoiceNumber, "Issued " + fmtDate_(issued, "MMMM d, yyyy") + " · " + due, "",
    "Bill to: " + who.filter(String).join(", "), ""
  ].concat(lines.map(function (l) { return "  " + l.label + ": " + money_(l.amount); }))
    .concat([(CONFIG.showSalesTaxLine ? "  WA sales tax: $0.00\n" : "") + "  AMOUNT DUE: " + money_(total), "", "How to pay: " + CONFIG.paymentInstructions]).join("\n");
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
    .addSeparator()
    .addItem("Send a test quote to me", "sendTestQuote")
    .addItem("Set up this sheet", "setup")
    .addToUi();
}

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getScriptProperties().setProperty("SHEET_ID", ss.getId());
  const sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME, 0);
  const existing = sheet.getLastColumn() ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0] : [];
  if (!existing.filter(String).length) sheet.getRange(1, 1, 1, COLS.length).setValues([COLS]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, COLS.length).setFontWeight("bold").setBackground(C_.stone);
  const rows = Math.max(sheet.getMaxRows() - 1, 1);
  const status = SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).setAllowInvalid(true).build();
  sheet.getRange(2, COLS.indexOf("Status") + 1, rows, 1).setDataValidation(status);
  MONEY_COLS.forEach(function (c) { sheet.getRange(2, COLS.indexOf(c) + 1, rows, 1).setNumberFormat("$#,##0.00"); });
  sheet.getRange(2, COLS.indexOf("Received") + 1, rows, 1).setNumberFormat("yyyy-mm-dd h:mm am/pm");
  sheet.hideColumns(COLS.indexOf("Data (do not edit)") + 1);
  const missing = [];
  if (!CONFIG.phone) missing.push("phone");
  if (!CONFIG.paymentInstructions) missing.push("paymentInstructions (needed for invoices)");
  SpreadsheetApp.getUi().alert("Sheet is ready.\n\nNext: Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone), then put the web app URL in the website's config.js." +
    (missing.length ? "\n\nStill empty in Config.gs: " + missing.join(", ") + "." : ""));
}

function sendInvoiceForSelectedRow() {
  const ui = SpreadsheetApp.getUi();
  if (!CONFIG.paymentInstructions) { ui.alert("Add your payment instructions to paymentInstructions in Config.gs first, so customers know how to pay."); return; }
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
  const msg = renderInvoiceEmail_(rec, invoiceNumber, lines, final, now, serviceDate);
  MailApp.sendEmail({ to: String(rec["Email"]), subject: msg.subject, body: msg.text, htmlBody: msg.html, name: CONFIG.businessName, replyTo: replyTo_() });
  setCell_(sel.sheet, sel.row, "Invoice #", invoiceNumber);
  setCell_(sel.sheet, sel.row, "Invoice sent", now);
  if (rec["Final amount"] === "" || rec["Final amount"] == null) setCell_(sel.sheet, sel.row, "Final amount", final);
  if (["Paid", "Lost"].indexOf(String(rec["Status"])) < 0) setCell_(sel.sheet, sel.row, "Status", "Invoiced");
  ui.alert("Invoice " + invoiceNumber + " for " + money_(final) + " sent to " + rec["Email"] + ".");
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
