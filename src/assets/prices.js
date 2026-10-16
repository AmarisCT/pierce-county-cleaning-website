// DRAFT launch prices (USD) — pending owner approval. Source: docs/pricing.md
// Keys are home sizes; values are per-visit prices.
window.PCCS_PRICES = {
  sizes: [
    { id: "studio", label: "Studio, 1 bath" },
    { id: "1-1",    label: "1 bed, 1 bath" },
    { id: "2-1",    label: "2 bed, 1 bath" },
    { id: "2-2",    label: "2 bed, 2 bath" },
    { id: "3-2",    label: "3 bed, 2 bath" },
    { id: "4-2.5",  label: "4 bed, 2.5 bath" }
  ],
  services: {
    standard: { label: "Standard clean",       prices: { "studio":165, "1-1":190, "2-1":210, "2-2":245, "3-2":275, "4-2.5":320 } },
    recurring:{ label: "Recurring (biweekly)", prices: { "studio":155, "1-1":170, "2-1":190, "2-2":220, "3-2":240, "4-2.5":280 } },
    deep:     { label: "Deep clean",           prices: { "studio":215, "1-1":250, "2-1":285, "2-2":335, "3-2":375, "4-2.5":450 } },
    moveout:  { label: "Move-in / move-out",   prices: { "studio":230, "1-1":270, "2-1":310, "2-2":365, "3-2":415, "4-2.5":495 } }
  },
  addons: {
    fridge:    { label: "Inside fridge",       price: 35 },
    oven:      { label: "Inside oven",         price: 35 },
    cabinets:  { label: "Inside cabinets",     price: 45 },
    windows:   { label: "Interior windows",    price: 45 },
    baseboard: { label: "Detailed baseboards", price: 30 },
    laundry:   { label: "Laundry (1 load)",    price: 25 }
  }
};

// Estimate for a quote request. Pure function — tested in tests/estimate.test.js.
// Returns null when the home is larger than the table covers (manual quote).
function pccsEstimate(prices, sizeId, serviceId, addonIds) {
  const svc = prices.services[serviceId];
  if (!svc || !(sizeId in svc.prices)) return null;
  const base = svc.prices[sizeId];
  const extras = (addonIds || []).reduce((s, k) => s + (prices.addons[k] ? prices.addons[k].price : 0), 0);
  return { base, extras, total: base + extras };
}
if (typeof module !== "undefined") module.exports = { pccsEstimate };
