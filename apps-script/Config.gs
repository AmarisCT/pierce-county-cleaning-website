/**
 * Pierce County Cleaning Services — quote & invoice emails
 * SETTINGS: fill these in once, in the Apps Script editor. See docs/quote-email-setup.md.
 * (Code.gs holds the prices and the logic. When prices change, replace Code.gs only;
 * this file keeps your settings.)
 */
const CONFIG = {
  businessName: "Pierce County Cleaning Services LLC",
  shortName: "Pierce County Cleaning",
  slogan: "Clean Spaces, Clear Minds.",

  phone: "",               // shown on quotes and invoices, e.g. "(253) 555-0142"
  website: "",             // e.g. "https://amarisct.github.io/pierce-county-cleaning-website/"
  replyTo: "",             // where customer replies go. Empty = this Google account's email
  notifyEmail: "",         // who gets new-request alerts. Empty = this Google account's email

  // Required before you can send invoices. Example:
  // "Pay by Zelle to (253) 555-0142, cash, or check payable to Pierce County Cleaning Services LLC."
  paymentInstructions: "",

  invoiceDueDays: 0,       // 0 = due on receipt; 15 = due in 15 days
  quoteValidDays: 30,
  timeZone: "America/Los_Angeles",

  // Free Gmail can send 100 emails a day; each website request sends 2 (customer + you).
  maxQuotesPerDay: 45,

  // Routine house cleaning isn't subject to WA retail sales tax. Confirm with your accountant.
  showSalesTaxLine: true
};
