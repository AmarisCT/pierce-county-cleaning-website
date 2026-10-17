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

function createEnv(configOverrides) {
  const mail = [];
  const alerts = [];
  const props = {};
  const cache = {};
  const sheet = new FakeSheet("Quotes");
  const ss = {
    getId: () => "sheet-123", getUrl: () => "https://docs.google.com/spreadsheets/d/sheet-123",
    getSheetByName: n => (n === "Quotes" ? sheet : null), insertSheet: () => sheet, getActiveSheet: () => sheet
  };
  const ui = {
    alert: (a, b) => { alerts.push(b ? a + " " + b : a); return ui.nextButton || "OK"; },
    ButtonSet: { YES_NO: "YES_NO" }, Button: { YES: "YES", NO: "NO" },
    createMenu: () => ({ addItem() { return this; }, addSeparator() { return this; }, addToUi() {} })
  };
  const errors = [];
  const ctx = {
    console: { log: console.log, warn: console.warn, error: (...a) => errors.push(a.map(String).join(" ")) },
    SpreadsheetApp: {
      openById: () => ss, getActiveSpreadsheet: () => ss, getUi: () => ui,
      newDataValidation: () => ({ requireValueInList() { return this; }, setAllowInvalid() { return this; }, build() { return {}; } })
    },
    MailApp: { sendEmail: o => { if (ctx.__failMail) throw new Error("mail down"); mail.push(o); } },
    CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; } }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: { formatDate },
    Session: { getEffectiveUser: () => ({ getEmail: () => "owner@example.com" }) },
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: s => ({ content: s, setMimeType() { return this; } }) }
  };
  vm.createContext(ctx);
  const src = fs.readFileSync(path.join(ROOT, "apps-script", "Config.gs"), "utf8") + "\n" +
    fs.readFileSync(path.join(ROOT, "apps-script", "Code.gs"), "utf8") +
    "\n;this.__api = { doPost, doGet, setup, sendInvoiceForSelectedRow, resendQuoteForSelectedRow, sendTestQuote, onOpen, CONFIG, COLS, renderQuoteEmail_, renderInvoiceEmail_, buildQuote_ };";
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
  return { api, ctx, errors, mail, alerts, props, cache, sheet, ui, post, record, setByHeader };
}

function sampleRequest(extra) {
  return Object.assign({
    name: "Jane Rivera", email: "jane@example.com", phone: "(253) 555-0142", address: "1201 Pacific Ave, Tacoma, WA", zip: "98402",
    propertyType: "house", service: "standard", frequency: "biweekly", bedrooms: "2", bathrooms: "1", sqft: "1100",
    addons: ["fridge", "oven"], date: "2026-10-23", notes: "Two cats. Parking in the alley.", website: "", elapsed: 42000
  }, extra || {});
}

module.exports = { createEnv, sampleRequest };
