// Tests for the quote & invoice email script (apps-script/Code.gs), using stand-in Google services.
const assert = require("assert");
const { createEnv, sampleRequest } = require("./apps-script-harness");

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
};
