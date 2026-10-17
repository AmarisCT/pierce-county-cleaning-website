// Site settings — edit these, then run `node build.js`.
// Leave a value empty ("") to hide it on the site rather than show a placeholder.
window.PCCS_CONFIG = {
  businessName: "Pierce County Cleaning Services LLC",
  slogan: "Clean Spaces, Clear Minds.",

  // TODO(owner): add the business phone and email once they are set up.
  phone: "",            // e.g. "(253) 555-0142"
  email: "",            // e.g. "hello@piercecountycleaning.com"

  // Your Google Apps Script web app URL (ends in /exec). See docs/quote-email-setup.md.
  // When set, requests go to your Google Sheet and the customer is emailed their quote.
  // While empty, the quote page still shows an estimate and lets the customer copy their request.
  quoteEndpoint: "",

  // Show "starting at" prices on the site. Prices below are DRAFT launch prices
  // pending owner approval — see docs/pricing.md.
  showPrices: true
};
