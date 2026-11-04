// Runs apps-script/Config.gs + Code.gs in Node with stand-ins for the Google services
// it uses (Sheets, Gmail, cache, properties, lock). Used by tests and to preview emails.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");

function formatDate(date, tz, pattern) {
  const parts = {};
  new Intl.DateTimeFormat("en-US", {
    timeZone: tz, year: "numeric", month: "long", day: "numeric", weekday: "long",
    hour: "2-digit", minute: "2-digit", hour12: false
  }).formatToParts(date).forEach(p => { parts[p.type] = p.value; });
  const mm = String(new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "numeric" }).format(date)).padStart(2, "0");
  return pattern
    .replace(/yyyy/g, parts.year)
    .replace(/EEEE/g, parts.weekday)
    .replace(/MMMM/g, "\u0001")
    .replace(/MM/g, mm)
    .replace(/dd/g, String(parts.day).padStart(2, "0"))
    .replace(/\bd\b/g, String(parts.day))
    .replace(/HH/g, parts.hour === "24" ? "00" : parts.hour)
    .replace(/mm/g, parts.minute)
    .replace(/\u0001/g, parts.month);
}

class FakeRange {
  constructor(sheet, row, col, rows, cols) { Object.assign(this, { sheet, row, col, rows: rows || 1, cols: cols || 1 }); }
  getValues() {
    const out = [];
    for (let r = 0; r < this.rows; r++) {
      const line = this.sheet.data[this.row - 1 + r] || [];
      const vals = [];
      for (let c = 0; c < this.cols; c++) vals.push(line[this.col - 1 + c] === undefined ? "" : line[this.col - 1 + c]);
      out.push(vals);
    }
    return out;
  }
  setValues(v) { v.forEach((line, r) => line.forEach((val, c) => this.sheet.set(this.row + r, this.col + c, val))); return this; }
  setValue(v) { this.sheet.set(this.row, this.col, v); return this; }
  getRow() { return this.row; }
  getSheet() { return this.sheet; }
  // formatting calls are accepted and ignored
  setFontWeight() { return this; } setBackground() { return this; } setDataValidation() { return this; } setNumberFormat() { return this; }
}

class FakeSheet {
  constructor(name) { this.name = name; this.data = []; this.activeRow = 2; }
  getName() { return this.name; }
  set(r, c, v) { while (this.data.length < r) this.data.push([]); this.data[r - 1][c - 1] = v; }
  getLastRow() { return this.data.length; }
  getLastColumn() { return this.data.reduce((m, r) => Math.max(m, r.length), 0); }
  getMaxRows() { return 1000; }
  getRange(r, c, rows, cols) { return new FakeRange(this, r, c, rows, cols); }
  appendRow(row) { this.data.push(row.slice()); return this; }
  setFrozenRows() {} hideColumns() {}
  getActiveRange() { return new FakeRange(this, this.activeRow, 1); }
}

// A small stand-in for the Stripe API, answering the calls Code.gs makes through UrlFetchApp.
function fakeStripe() {
  const s = { products: {}, prices: {}, links: {}, sessions: [], calls: [], n: 0, fail: null };
  const reply = (code, body) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(body) });
  s.fetch = (url, opts) => {
    const u = new URL(url);
    const p = (opts.method || "get") === "get" ? Object.fromEntries(u.searchParams) : Object.assign({}, opts.payload);
    const method = (opts.method || "get").toLowerCase();
    const route = u.pathname.replace(/^\/v1\//, "");
    s.calls.push({ method, route, params: p, auth: opts.headers && opts.headers.Authorization });
    if (!opts.muteHttpExceptions) throw new Error("Code.gs should mute HTTP exceptions");
    if (s.fail && s.fail(method, route, p)) return reply(400, { error: { message: s.failMessage || "Something went wrong" } });
    if (!/^Bearer (rk|sk)_(live|test)_/.test((opts.headers || {}).Authorization || "")) return reply(401, { error: { message: "Invalid API Key provided" } });
    let m;
    if (method === "post" && route === "products") { const id = "prod_" + (++s.n); s.products[id] = p; return reply(200, { id }); }
    if (method === "post" && route === "prices") {
      if (!s.products[p.product]) return reply(400, { error: { message: "No such product: '" + p.product + "'" } });
      const id = "price_" + (++s.n); s.prices[id] = p; return reply(200, { id });
    }
    if (method === "post" && route === "payment_links") {
      const id = "plink_" + (++s.n); s.links[id] = Object.assign({ active: true, url: "https://buy.stripe.com/test_" + id }, p);
      return reply(200, { id, url: s.links[id].url });
    }
    if (method === "post" && (m = route.match(/^payment_links\/(.+)$/))) { s.links[m[1]].active = p.active !== "false"; return reply(200, { id: m[1] }); }
    if (method === "get" && route === "payment_links") return reply(200, { data: [] });
    if (method === "get" && route === "checkout/sessions") {
      let d = s.sessions;
      if (p.payment_link) d = d.filter(x => x.payment_link === p.payment_link);
      if (p.status) d = d.filter(x => x.status === p.status);
      return reply(200, { data: d });
    }
    return reply(404, { error: { message: "Unrecognized request URL" } });
  };
  // Simulate a customer paying a link.
  s.pay = (linkId, extra) => {
    const price = s.prices[s.links[linkId]["line_items[0][price]"]];
    s.sessions.push(Object.assign({ id: "cs_" + (++s.n), payment_link: linkId, status: "complete", payment_status: "paid",
      amount_total: Number(price.unit_amount), created: Math.floor(Date.UTC(2026, 10, 2, 18) / 1000) }, extra || {}));
  };
  s.lastLink = () => s.links[Object.keys(s.links).pop()];
  return s;
}

function fakeTriggers() {
  const list = [];
  return {
    list,
    getProjectTriggers: () => list.slice(),
    deleteTrigger: t => { const i = list.indexOf(t); if (i >= 0) list.splice(i, 1); },
    newTrigger: handler => ({ timeBased: () => ({ everyHours: hours => ({ create: () => { const t = { getHandlerFunction: () => handler, hours }; list.push(t); return t; } }) }) })
  };
}

function createEnv(configOverrides) {
  const mail = [];
  const alerts = [];
  const props = {};
  const cache = {};
  const sheet = new FakeSheet("Quotes");
  const sheets = { Quotes: sheet };
  const ss = {
    getId: () => "sheet-123", getUrl: () => "https://docs.google.com/spreadsheets/d/sheet-123",
    getSheetByName: n => sheets[n] || null,
    insertSheet: n => (sheets[n] = sheets[n] || new FakeSheet(n)),
    getActiveSheet: () => sheet
  };
  const ui = {
    alert: (a, b) => { alerts.push(b ? a + " " + b : a); return ui.nextButton || "OK"; },
    // Set ui.nextPrompt = { text, button } before calling something that asks for input.
    prompt: (title, msg) => { alerts.push(title + " " + msg); const n = ui.nextPrompt || { text: "", button: "CANCEL" }; return { getSelectedButton: () => n.button || "OK", getResponseText: () => n.text }; },
    ButtonSet: { YES_NO: "YES_NO", OK_CANCEL: "OK_CANCEL" }, Button: { YES: "YES", NO: "NO", OK: "OK", CANCEL: "CANCEL" },
    createMenu: () => ({ addItem() { return this; }, addSeparator() { return this; }, addToUi() {} })
  };
  const errors = [];
  const stripe = fakeStripe();
  const triggers = fakeTriggers();
  const ctx = {
    UrlFetchApp: { fetch: (url, opts) => stripe.fetch(url, opts) },
    ScriptApp: triggers,
    console: { log: console.log, warn: console.warn, error: (...a) => errors.push(a.map(String).join(" ")) },
    SpreadsheetApp: {
      openById: () => ss, getActiveSpreadsheet: () => ss, getUi: () => ui,
      newDataValidation: () => ({ requireValueInList() { return this; }, setAllowInvalid() { return this; }, build() { return {}; } })
    },
    MailApp: { sendEmail: o => { if (ctx.__failMail) throw new Error("mail down"); mail.push(o); } },
    CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; } }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); }, deleteProperty: k => { delete props[k]; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: { formatDate },
    Session: { getEffectiveUser: () => ({ getEmail: () => "owner@example.com" }) },
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: s => ({ content: s, setMimeType() { return this; } }) }
  };
  vm.createContext(ctx);
  const src = fs.readFileSync(path.join(ROOT, "apps-script", "Config.gs"), "utf8") + "\n" +
    fs.readFileSync(path.join(ROOT, "apps-script", "Code.gs"), "utf8") +
    "\n;this.__api = { doPost, doGet, onEdit, setup, sendInvoiceForSelectedRow, resendQuoteForSelectedRow, sendTestQuote, onOpen, connectStripe, checkCardPayments, checkCardPaymentsHourly, CONFIG, COLS, REVIEW_COLS, renderQuoteEmail_, renderInvoiceEmail_, buildQuote_ };";
  vm.runInContext(src, ctx);
  const api = ctx.__api;
  Object.assign(api.CONFIG, configOverrides || {});
  api.setup(); // creates headers, stores SHEET_ID
  alerts.length = 0;

  const post = body => JSON.parse(api.doPost({ postData: { contents: JSON.stringify(body) } }).content);
  const record = row => {
    const head = sheet.data[0];
    const rec = {};
    head.forEach((h, i) => { rec[h] = sheet.data[row - 1][i] === undefined ? "" : sheet.data[row - 1][i]; });
    return rec;
  };
  const setByHeader = (row, col, value) => sheet.set(row, sheet.data[0].indexOf(col) + 1, value);
  const get = params => JSON.parse(api.doGet(params ? { parameter: params } : undefined).content);
  // Add a row to the Reviews tab by column name, the way an owner would paste one in.
  const addReview = rec => {
    const tab = sheets.Reviews;
    tab.appendRow(tab.data[0].map(h => (h in rec ? rec[h] : "")));
  };
  return { api, ctx, errors, mail, alerts, props, cache, sheet, sheets, ui, post, get, record, setByHeader, addReview, stripe, triggers };
}

function sampleRequest(extra) {
  return Object.assign({
    name: "Jane Rivera", email: "jane@example.com", phone: "(253) 555-0142", address: "1201 Pacific Ave, Tacoma, WA", zip: "98402",
    propertyType: "house", service: "standard", frequency: "biweekly", bedrooms: "2", bathrooms: "1", sqft: "1100",
    addons: ["fridge", "oven"], date: "2026-10-23", notes: "Two cats. Parking in the alley.", website: "", elapsed: 42000
  }, extra || {});
}

function sampleReview(extra) {
  return Object.assign({
    type: "review", name: "Jane Rivera", email: "jane@example.com", rating: "5", city: "Tacoma", service: "deep",
    text: "Our kitchen has never looked this good. On time and thorough.", consent: true, website: "", elapsed: 30000
  }, extra || {});
}

module.exports = { createEnv, sampleRequest, sampleReview };
