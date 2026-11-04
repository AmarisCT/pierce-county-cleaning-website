// Tests for the quote & invoice email script (apps-script/Code.gs), using stand-in Google services.
const assert = require("assert");
const { createEnv, sampleRequest, sampleReview } = require("./apps-script-harness");

module.exports = function run(check) {
  check("quote: valid request is logged and emailed with add-ons and total", () => {
    const env = createEnv();
    const res = env.post(sampleRequest());
    assert.strictEqual(res.ok, true);
    assert.match(res.quoteNumber, /^Q-\d{4}-0001$/);
    assert.strictEqual(res.total, 280);
    assert.strictEqual(env.sheet.data.length, 2);
    const rec = env.record(2);
    assert.strictEqual(rec["Quote total"], 280);
    assert.strictEqual(rec["Add-ons"], "Inside fridge, Inside oven");
    assert.strictEqual(rec["Status"], "New");
    assert.strictEqual(env.mail.length, 2);
    const [customer, owner] = env.mail;
    assert.strictEqual(customer.to, "jane@example.com");
    for (const s of ["$210.00", "Inside fridge", "$35.00", "Inside oven", "$280.00", res.quoteNumber, "Standard clean"]) assert.ok(customer.htmlBody.includes(s), "customer email missing " + s);
    assert.ok(customer.body.includes("TOTAL: $280.00"));
    assert.ok(!customer.htmlBody.includes("Two cats"), "customer email must not include private notes");
    assert.strictEqual(owner.to, "owner@example.com");
    assert.strictEqual(owner.replyTo, "jane@example.com");
    assert.ok(owner.htmlBody.includes("Two cats"));
  });

  check("quote: price is recalculated, extra fields ignored", () => {
    const env = createEnv();
    const res = env.post(sampleRequest({ total: 1, addons: ["fridge", "fridge", "bogus"] }));
    assert.strictEqual(res.total, 245);
    assert.ok(env.mail[0].htmlBody.includes("$245.00"));
  });

  check("quote: biweekly recurring shows per-visit price", () => {
    const env = createEnv();
    const res = env.post(sampleRequest({ service: "recurring", frequency: "biweekly", addons: [] }));
    assert.strictEqual(res.total, 190);
    assert.ok(env.mail[0].subject.includes("per visit"));
  });

  check("quote: weekly recurring becomes a custom quote listing add-ons", () => {
    const env = createEnv();
    const res = env.post(sampleRequest({ service: "recurring", frequency: "weekly" }));
    assert.strictEqual(res.priced, false);
    assert.strictEqual(env.record(2)["Quote total"], "");
    assert.ok(env.mail[0].htmlBody.includes("custom price"));
    assert.ok(env.mail[0].htmlBody.includes("Inside fridge"));
  });

  check("quote: commercial request asks for a walkthrough, no price", () => {
    const env = createEnv();
    const res = env.post(sampleRequest({ propertyType: "commercial", service: "commercial", bedrooms: "", bathrooms: "", addons: [] }));
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.priced, false);
    assert.ok(env.mail[0].htmlBody.includes("walkthrough"));
  });

  check("quote: names with special characters are escaped", () => {
    const env = createEnv();
    env.post(sampleRequest({ name: "Ana O'Brien & Co" }));
    assert.ok(env.mail[0].htmlBody.includes("Ana O&#39;Brien &amp; Co"));
  });

  check("spam: hidden field filled → no email, no row", () => {
    const env = createEnv();
    const res = env.post(sampleRequest({ website: "http://spam.example" }));
    assert.strictEqual(res.ok, true);
    assert.strictEqual(env.mail.length, 0);
    assert.strictEqual(env.sheet.data.length, 1);
  });

  check("spam: form sent in under 3 seconds → ignored", () => {
    const env = createEnv();
    env.post(sampleRequest({ elapsed: 800 }));
    assert.strictEqual(env.mail.length, 0);
  });

  check("spam: links in the name are rejected", () => {
    const env = createEnv();
    const res = env.post(sampleRequest({ name: "Cheap pills www.spam.example" }));
    assert.strictEqual(res.ok, false);
    assert.deepStrictEqual(res.fields, ["name"]);
    assert.strictEqual(env.mail.length, 0);
  });

  check("limits: same email twice within 10 minutes", () => {
    const env = createEnv();
    env.post(sampleRequest());
    const res = env.post(sampleRequest());
    assert.strictEqual(res.error, "too_soon");
    assert.strictEqual(env.mail.length, 2);
  });

  check("limits: daily cap stops new requests", () => {
    const env = createEnv({ maxQuotesPerDay: 1 });
    env.post(sampleRequest());
    const res = env.post(sampleRequest({ email: "other@example.com" }));
    assert.strictEqual(res.error, "busy");
  });

  check("validation: bad email, phone and ZIP are reported", () => {
    const env = createEnv();
    const res = env.post(sampleRequest({ email: "nope", phone: "12", zip: "9840" }));
    assert.deepStrictEqual(res.fields.sort(), ["email", "phone", "zip"]);
  });

  check("quote numbers count up", () => {
    const env = createEnv();
    const a = env.post(sampleRequest());
    const b = env.post(sampleRequest({ email: "b@example.com" }));
    assert.strictEqual(Number(b.quoteNumber.slice(-4)), Number(a.quoteNumber.slice(-4)) + 1);
  });

  check("quote: if the customer email fails, the request is still logged", () => {
    const env = createEnv();
    env.ctx.__failMail = true;
    const res = env.post(sampleRequest());
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.emailed, false);
    assert.strictEqual(env.sheet.data.length, 2);
    assert.strictEqual(env.errors.length, 2);
  });

  check("invoice: blocked until payment instructions are set", () => {
    const env = createEnv();
    env.post(sampleRequest());
    env.mail.length = 0;
    env.api.sendInvoiceForSelectedRow();
    assert.strictEqual(env.mail.length, 0);
    assert.match(env.alerts[0], /payment instructions/i);
  });

  check("invoice: uses quote lines, adds adjustment, updates the row", () => {
    const env = createEnv({ paymentInstructions: "Pay by Zelle to (253) 555-0142." });
    env.post(sampleRequest());
    env.mail.length = 0;
    env.setByHeader(2, "Final amount", 300);
    env.setByHeader(2, "Invoice note", "Extra bathroom");
    env.api.sendInvoiceForSelectedRow();
    assert.strictEqual(env.mail.length, 1);
    const inv = env.mail[0];
    assert.strictEqual(inv.to, "jane@example.com");
    for (const s of ["INV-", "$210.00", "Inside fridge", "Extra bathroom", "$20.00", "$300.00", "Pay by Zelle"]) assert.ok(inv.htmlBody.includes(s), "invoice missing " + s);
    const rec = env.record(2);
    assert.match(rec["Invoice #"], /^INV-\d{4}-0001$/);
    assert.strictEqual(rec["Status"], "Invoiced");
    assert.strictEqual(Object.prototype.toString.call(rec["Invoice sent"]), "[object Date]");
  });

  check("invoice: defaults to the quoted total when no final amount is entered", () => {
    const env = createEnv({ paymentInstructions: "Cash or check." });
    env.post(sampleRequest());
    env.mail.length = 0;
    env.api.sendInvoiceForSelectedRow();
    assert.ok(env.mail[0].subject.includes("$280.00"));
    assert.strictEqual(env.record(2)["Final amount"], 280);
  });

  check("invoice: custom-quote rows need a final amount", () => {
    const env = createEnv({ paymentInstructions: "Cash or check." });
    env.post(sampleRequest({ service: "commercial", propertyType: "commercial", addons: [] }));
    env.mail.length = 0;
    env.api.sendInvoiceForSelectedRow();
    assert.strictEqual(env.mail.length, 0);
    env.setByHeader(2, "Final amount", 640);
    env.api.sendInvoiceForSelectedRow();
    assert.ok(env.mail[0].htmlBody.includes("$640.00"));
  });

  check("resend quote and test quote work", () => {
    const env = createEnv();
    env.post(sampleRequest());
    env.mail.length = 0;
    env.api.resendQuoteForSelectedRow();
    env.api.sendTestQuote();
    assert.strictEqual(env.mail.length, 2);
    assert.strictEqual(env.mail[1].to, "owner@example.com");
  });

  check("web app GET answers", () => {
    const env = createEnv();
    assert.strictEqual(JSON.parse(env.api.doGet().content).ok, true);
  });

  // ----- reviews -----
  check("reviews: setup creates the Reviews tab", () => {
    const env = createEnv();
    assert.ok(env.sheets.Reviews, "Reviews tab missing");
    assert.strictEqual(JSON.stringify(env.sheets.Reviews.data[0]), JSON.stringify(env.api.REVIEW_COLS));
  });

  check("reviews: a website review is saved hidden, and only the owner is emailed", () => {
    const env = createEnv();
    const res = env.post(sampleReview());
    assert.strictEqual(res.ok, true);
    const tab = env.sheets.Reviews;
    assert.strictEqual(tab.data.length, 2);
    const row = Object.fromEntries(tab.data[0].map((h, i) => [h, tab.data[1][i]]));
    assert.strictEqual(row["Show on website"], "No");
    assert.strictEqual(row["Rating"], 5);
    assert.strictEqual(row["Name shown"], "Jane R.");
    assert.strictEqual(row["Source"], "Website");
    assert.strictEqual(row["Service"], "Deep clean");
    assert.strictEqual(env.sheet.data.length, 1, "no row in Quotes");
    assert.strictEqual(env.mail.length, 1);
    assert.strictEqual(env.mail[0].to, "owner@example.com");
    assert.match(env.mail[0].subject, /New review to check — 5 of 5 from Jane R\./);
    assert.ok(env.mail[0].htmlBody.includes("including critical ones"));
  });

  check("reviews: hidden reviews are not published", () => {
    const env = createEnv();
    env.post(sampleReview());
    const res = env.get({ reviews: "1" });
    assert.strictEqual(res.ok, true);
    assert.deepStrictEqual(res.reviews, []);
    assert.strictEqual(res.average, null);
  });

  check("reviews: shown reviews are published newest first, without emails or full names", () => {
    const env = createEnv();
    env.addReview({ "Date": new Date("2026-11-02T18:00:00Z"), "Show on website": "Yes", "Rating": 4, "Review": "Good move-out clean, landlord was happy.",
      "Full name": "Sam Lee", "Email": "sam@example.com", "City": "Lakewood", "Source": "Website" });
    env.addReview({ "Date": new Date("2026-11-20T18:00:00Z"), "Show on website": "Yes", "Rating": 5, "Review": "Thorough and on time.",
      "Name shown": "Maria G.", "Source": "Google", "Link": "https://maps.google.com/review-link" });
    env.addReview({ "Date": new Date("2026-11-25T18:00:00Z"), "Show on website": "No", "Rating": 1, "Review": "Spam spam spam" });
    const res = env.get({ reviews: "1" });
    assert.strictEqual(res.count, 2);
    assert.strictEqual(res.average, 4.5);
    assert.deepStrictEqual(res.reviews.map(r => r.name), ["Maria G.", "Sam L."]);
    assert.strictEqual(res.reviews[0].source, "Google");
    assert.strictEqual(res.reviews[0].link, "https://maps.google.com/review-link");
    assert.strictEqual(res.reviews[1].date, "2026-11-02");
    const raw = JSON.stringify(res);
    assert.ok(!raw.includes("sam@example.com") && !raw.includes("Sam Lee"), "private details leaked");
  });

  check("reviews: editing the Reviews tab refreshes the website's copy", () => {
    const env = createEnv();
    assert.strictEqual(env.get({ reviews: "1" }).count, 0);
    env.addReview({ "Date": new Date(), "Show on website": "Yes", "Rating": 5, "Review": "Lovely work, thank you!", "Name shown": "Ann P." });
    assert.strictEqual(env.get({ reviews: "1" }).count, 0, "cached copy until an edit");
    env.api.onEdit({ range: env.sheets.Reviews.getRange(2, 2) });
    assert.strictEqual(env.get({ reviews: "1" }).count, 1);
  });

  check("reviews: invalid rating, missing consent and links are rejected", () => {
    const env = createEnv();
    const res = env.post(sampleReview({ rating: "9", consent: false, text: "great, visit www.spam.example" }));
    assert.strictEqual(res.ok, false);
    assert.deepStrictEqual(res.fields.sort(), ["consent", "rating", "text"]);
    assert.strictEqual(env.sheets.Reviews.data.length, 1);
    assert.strictEqual(env.mail.length, 0);
  });

  check("reviews: spam traps and repeat sends", () => {
    const env = createEnv();
    env.post(sampleReview({ website: "http://spam.example" }));
    env.post(sampleReview({ elapsed: 500 }));
    assert.strictEqual(env.sheets.Reviews.data.length, 1);
    env.post(sampleReview());
    assert.strictEqual(env.post(sampleReview()).error, "too_soon");
    assert.strictEqual(env.sheets.Reviews.data.length, 2);
  });

  check("reviews: invoices link to the review page when the website is set", () => {
    const env = createEnv({ paymentInstructions: "Cash or check.", website: "https://example.github.io/site" });
    env.post(sampleRequest());
    env.mail.length = 0;
    env.api.sendInvoiceForSelectedRow();
    assert.ok(env.mail[0].htmlBody.includes("https://example.github.io/site/reviews.html#leave"));
    assert.ok(env.mail[0].body.includes("Leave a review: https://example.github.io/site/reviews.html#leave"));
  });

  check("reviews: no review link in invoices until the website is set", () => {
    const env = createEnv({ paymentInstructions: "Cash or check." });
    env.post(sampleRequest());
    env.mail.length = 0;
    env.api.sendInvoiceForSelectedRow();
    assert.ok(!env.mail[0].htmlBody.includes("How did we do"));
  });

  // ===== Card payments (Stripe) =====
  const KEY = "rk_live_" + "a1B2c3D4e5F6g7H8i9J0k1L2";
  const connected = (config) => {
    const env = createEnv(Object.assign({ paymentInstructions: "Zelle to (253) 555-0142, cash or check." }, config || {}));
    env.ui.nextPrompt = { text: KEY, button: "OK" };
    env.api.connectStripe();
    env.alerts.length = 0;
    return env;
  };

  check("stripe: connecting checks the key, stores it privately and turns on the hourly check", () => {
    const env = createEnv();
    env.ui.nextPrompt = { text: "not a key", button: "OK" };
    env.api.connectStripe();
    assert.ok(!env.props.STRIPE_SECRET_KEY);
    env.ui.nextPrompt = { text: KEY, button: "OK" };
    env.api.connectStripe();
    assert.strictEqual(env.props.STRIPE_SECRET_KEY, KEY);
    assert.match(env.alerts.pop(), /Stripe connected \(live mode\)/);
    assert.deepStrictEqual(env.triggers.list.map(t => t.getHandlerFunction()), ["checkCardPaymentsHourly"]);
    env.ui.nextPrompt = { text: KEY, button: "OK" };
    env.api.connectStripe();
    assert.strictEqual(env.triggers.list.length, 1, "reconnecting must not add a second hourly check");
    env.ui.nextPrompt = { text: "disconnect", button: "OK" };
    env.api.connectStripe();
    assert.ok(!env.props.STRIPE_SECRET_KEY);
    assert.strictEqual(env.triggers.list.length, 0);
  });

  check("stripe: a key Stripe rejects is not saved", () => {
    const env = createEnv();
    env.stripe.fail = (m, route) => route === "checkout/sessions";
    env.stripe.failMessage = "The provided key does not have the required permissions for this endpoint.";
    env.ui.nextPrompt = { text: KEY, button: "OK" };
    env.api.connectStripe();
    assert.ok(!env.props.STRIPE_SECRET_KEY);
    assert.match(env.alerts.pop(), /required permissions[\s\S]*Checkout Sessions set to Read/);
    assert.strictEqual(env.triggers.list.length, 0);
  });

  check("stripe: invoice has a Pay by card button for the exact amount, plus other ways to pay", () => {
    const env = connected();
    env.post(sampleRequest());
    env.mail.length = 0;
    env.setByHeader(2, "Final amount", 300);
    env.api.sendInvoiceForSelectedRow();
    assert.strictEqual(env.mail.length, 1);
    const inv = env.mail[0];
    const rec = env.record(2);
    const link = env.stripe.lastLink();
    assert.strictEqual(env.stripe.prices[link["line_items[0][price]"]].unit_amount, "30000");
    assert.strictEqual(link["restrictions[completed_sessions][limit]"], "1");
    assert.strictEqual(link["metadata[invoice]"], rec["Invoice #"]);
    assert.ok(rec["Card pay link"].startsWith(link.url + "?prefilled_email=jane%40example.com&client_reference_id=INV-"));
    for (const s of ["Pay $300.00 by card", rec["Card pay link"].replace(/&/g, "&amp;"), "Other ways to pay: Zelle"]) assert.ok(inv.htmlBody.includes(s), "invoice missing " + s);
    assert.ok(inv.body.includes("Pay by card (secure checkout by Stripe): " + rec["Card pay link"]));
    assert.strictEqual(rec["Status"], "Invoiced");
    const everything = JSON.stringify(env.mail) + JSON.stringify(env.sheet.data);
    assert.ok(!everything.includes(KEY), "the Stripe key must never appear in emails or the sheet");
  });

  check("stripe: invoices share one Stripe product and work without other payment instructions", () => {
    const env = connected({ paymentInstructions: "" });
    env.post(sampleRequest());
    env.post(sampleRequest({ email: "sam@example.com", name: "Sam Lee" }));
    env.mail.length = 0;
    env.sheet.activeRow = 2; env.api.sendInvoiceForSelectedRow();
    env.sheet.activeRow = 3; env.api.sendInvoiceForSelectedRow();
    assert.strictEqual(env.mail.length, 2);
    assert.strictEqual(Object.keys(env.stripe.products).length, 1);
    assert.strictEqual(Object.keys(env.stripe.links).length, 2);
    assert.ok(!env.mail[0].htmlBody.includes("Other ways to pay"));
    assert.ok(!env.mail[0].body.includes("How to pay:"));
  });

  check("stripe: resending keeps the same link, and a changed amount retires the old one", () => {
    const env = connected();
    env.post(sampleRequest());
    env.api.sendInvoiceForSelectedRow();
    const first = env.record(2)["Card pay link"];
    env.ui.nextButton = "YES";
    env.api.sendInvoiceForSelectedRow();
    assert.strictEqual(env.record(2)["Card pay link"], first);
    assert.strictEqual(Object.keys(env.stripe.links).length, 1);
    env.setByHeader(2, "Final amount", 320);
    env.api.sendInvoiceForSelectedRow();
    const ids = Object.keys(env.stripe.links);
    assert.strictEqual(ids.length, 2);
    assert.strictEqual(env.stripe.links[ids[0]].active, false);
    assert.notStrictEqual(env.record(2)["Card pay link"], first);
    assert.ok(env.mail.pop().htmlBody.includes("Pay $320.00 by card"));
  });

  check("stripe: an invoice already paid by card isn't sent again", () => {
    const env = connected();
    env.post(sampleRequest());
    env.api.sendInvoiceForSelectedRow();
    env.stripe.pay(Object.keys(env.stripe.links)[0]);
    env.mail.length = 0;
    env.ui.nextButton = "YES";
    env.api.sendInvoiceForSelectedRow();
    assert.strictEqual(env.mail.length, 0);
    assert.strictEqual(env.record(2)["Status"], "Paid");
    assert.match(env.alerts.pop(), /already paid by card \(\$280\.00\)/);
  });

  check("stripe: paid invoices are marked Paid; unpaid and pending ones are left alone", () => {
    const env = connected();
    env.post(sampleRequest());
    env.post(sampleRequest({ email: "sam@example.com", name: "Sam Lee" }));
    env.post(sampleRequest({ email: "kim@example.com", name: "Kim Park" }));
    for (const row of [2, 3, 4]) { env.sheet.activeRow = row; env.api.sendInvoiceForSelectedRow(); }
    const ids = Object.keys(env.stripe.links);
    env.stripe.pay(ids[0]);
    env.stripe.pay(ids[2], { payment_status: "unpaid" }); // e.g. a bank payment still processing
    env.alerts.length = 0;
    env.api.checkCardPayments();
    assert.match(env.alerts[0], /Marked as Paid:\nINV-\d{4}-0001 — \$280\.00 — Jane Rivera/);
    assert.deepStrictEqual([2, 3, 4].map(r => env.record(r)["Status"]), ["Paid", "Invoiced", "Invoiced"]);
    assert.strictEqual(Object.prototype.toString.call(env.record(2)["Paid on"]), "[object Date]");
    env.stripe.pay(ids[1]);
    env.api.checkCardPaymentsHourly();
    assert.strictEqual(env.record(3)["Status"], "Paid");
  });

  check("stripe: if Stripe fails, you choose whether to send without the card link", () => {
    const env = connected();
    env.post(sampleRequest());
    env.mail.length = 0;
    env.stripe.fail = (m, route) => route === "payment_links" && m === "post";
    env.ui.nextButton = "NO";
    env.api.sendInvoiceForSelectedRow();
    assert.strictEqual(env.mail.length, 0);
    env.ui.nextButton = "YES";
    env.api.sendInvoiceForSelectedRow();
    assert.strictEqual(env.mail.length, 1);
    assert.ok(!env.mail[0].htmlBody.includes("by card</a>"));
    assert.ok(env.mail[0].htmlBody.includes("Zelle"));
    const noBackup = connected({ paymentInstructions: "" });
    noBackup.post(sampleRequest());
    noBackup.mail.length = 0;
    noBackup.stripe.fail = () => true;
    noBackup.api.sendInvoiceForSelectedRow();
    assert.strictEqual(noBackup.mail.length, 0);
    assert.match(noBackup.alerts.pop(), /wasn't sent/);
  });

  check("setup: an older sheet gets the new columns added at the end, keeping its rows", () => {
    const env = createEnv({ paymentInstructions: "Cash or check." });
    env.post(sampleRequest());
    const old = env.sheet.data[0].filter(h => h !== "Card pay link" && h !== "Paid on");
    env.sheet.data = env.sheet.data.map(row => row.filter((v, i) => !["Card pay link", "Paid on"].includes(env.sheet.data[0][i])));
    assert.deepStrictEqual(env.sheet.data[0], old);
    env.api.setup();
    assert.deepStrictEqual(env.sheet.data[0].slice(-2), ["Card pay link", "Paid on"]);
    assert.strictEqual(env.record(2)["Name"], "Jane Rivera");
    env.api.sendInvoiceForSelectedRow();
    assert.strictEqual(env.record(2)["Status"], "Invoiced");
  });
};
