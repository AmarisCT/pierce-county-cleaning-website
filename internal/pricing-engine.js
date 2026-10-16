// Pierce County Cleaning Services — pricing engine (pure functions, no DOM)
const TYPES = {
  standard:  { label: "Standard clean",        mult: 1.0, tax: "janitorial" },
  deep:      { label: "Deep clean",            mult: 1.6, tax: "janitorial" },
  moveout:   { label: "Move-in / move-out",    mult: 1.8, tax: "janitorial" },
  turnover:  { label: "Rental turnover",       mult: 1.2, tax: "janitorial" },
  postcon:   { label: "Post-construction",     mult: 2.2, tax: "retail" }
};
const FREQ = {
  once:     { label: "One-time",  hoursMult: 1.0,  discount: 0 },
  monthly:  { label: "Monthly",   hoursMult: 1.0,  discount: 0.05 },
  biweekly: { label: "Biweekly",  hoursMult: 0.9,  discount: 0.10 },
  weekly:   { label: "Weekly",    hoursMult: 0.8,  discount: 0.15 }
};
const ADDONS = {
  fridge:    { label: "Inside fridge",        price: 35, hours: 0.5 },
  oven:      { label: "Inside oven",          price: 35, hours: 0.5 },
  cabinets:  { label: "Inside cabinets",      price: 45, hours: 0.75 },
  windows:   { label: "Interior windows",     price: 45, hours: 0.75 },
  baseboard: { label: "Detailed baseboards",  price: 30, hours: 0.5 },
  laundry:   { label: "Laundry (1 load)",     price: 25, hours: 0.25 }
};
const DEFAULTS = {
  bedrooms: 2, bathrooms: 1, sqft: 900, type: "standard", freq: "once",
  hoursOverride: null, addons: [],
  wage: 22, burdenPct: 12.5, lniPerHour: 1.68,
  travelMin: 30, miles: 10, mileageRate: 0.70,
  supplies: 8, procPct: 2.9, procFixed: 0.30,
  monthlyOverhead: 1500, jobsPerMonth: 40,
  bnoPct: 1.75, salesTaxPct: 10.3,
  targetMargin: 30, priceOverride: null
};
function estHours(i) {
  const base = 1.0 + 0.5 * i.bedrooms + 0.75 * i.bathrooms + 0.5 * (i.sqft / 1000);
  const recurringOk = i.type === "standard";
  const fm = recurringOk ? FREQ[i.freq].hoursMult : 1.0;
  return base * TYPES[i.type].mult * fm;
}
const r5 = x => Math.ceil(x / 5) * 5;
const money = x => Math.round(x * 100) / 100;
function quote(input) {
  const i = Object.assign({}, DEFAULTS, input);
  const addons = (i.addons || []).map(k => ADDONS[k]).filter(Boolean);
  const cleanHours = i.hoursOverride ? Number(i.hoursOverride) : estHours(i);
  const addonHours = addons.reduce((s, a) => s + a.hours, 0);
  const labHours = cleanHours + addonHours;
  const paidHours = labHours + i.travelMin / 60;
  const loadedRate = i.wage * (1 + i.burdenPct / 100) + i.lniPerHour;
  const labor = paidHours * loadedRate;
  const mileage = i.miles * i.mileageRate;
  const overhead = i.monthlyOverhead / Math.max(1, i.jobsPerMonth);
  const directCost = labor + mileage + i.supplies;
  const isRetail = TYPES[i.type].tax === "retail";
  // price solve: P = (directCost + overhead + procFixed) / (1 - margin - procPct - bno)
  const varPct = (i.procPct + i.bnoPct) / 100;
  const denom = 1 - i.targetMargin / 100 - varPct;
  const recommended = r5((directCost + overhead + i.procFixed) / denom);
  const discount = i.type === "standard" ? FREQ[i.freq].discount : 0;
  const addonPrice = addons.reduce((s, a) => s + a.price, 0);
  const price = i.priceOverride ? Number(i.priceOverride) : recommended;
  const processing = price * i.procPct / 100 + i.procFixed;
  const bno = price * i.bnoPct / 100;
  const gross = price - directCost;
  const net = gross - processing - bno - overhead;
  return {
    hours: money(labHours), paidHours: money(paidHours), loadedRate: money(loadedRate),
    labor: money(labor), mileage: money(mileage), supplies: money(i.supplies),
    processing: money(processing), bno: money(bno), overhead: money(overhead),
    directCost: money(directCost), price: money(price), recommended,
    gross: money(gross), grossPct: money(gross / price * 100),
    net: money(net), netPct: money(net / price * 100),
    salesTax: isRetail ? money(price * i.salesTaxPct / 100) : 0,
    taxClass: isRetail ? "Retail sales tax + retailing B&O" : "Service & other B&O (no sales tax)",
    recurringDiscountHint: discount, addonPrice
  };
}
if (typeof module !== "undefined") module.exports = { quote, TYPES, FREQ, ADDONS, DEFAULTS };
