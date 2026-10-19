// Quote page: live estimate + sending the request.
// With PCCS_CONFIG.quoteEndpoint set (your Google Apps Script web app URL), the request is
// logged in your Google Sheet and the customer is emailed their quote. Without it, the
// customer sees their request formatted to copy and send to you (nothing is sent anywhere).
(function () {
  var cfg = window.PCCS_CONFIG || {};
  var P = window.PCCS_PRICES;
  var $ = function (id) { return document.getElementById(id); };
  var form = $("quote-form");
  if (!form || !P) return;
  var loadedAt = Date.now();

  $("q-addons").innerHTML = Object.keys(P.addons).map(function (k) {
    var a = P.addons[k];
    return '<label for="ad-' + k + '"><input type="checkbox" id="ad-' + k + '" name="addons" value="' + k + '">' +
      a.label + (cfg.showPrices ? " · $" + a.price : "") + "</label>";
  }).join("");

  var params = new URLSearchParams(location.search);
  if (params.get("type") === "commercial") { $("q-type").value = "commercial"; $("q-service").value = "commercial"; }

  function values() {
    var data = { addons: [] };
    new FormData(form).forEach(function (v, k) {
      if (k === "addons") data.addons.push(v); else data[k] = String(v).trim();
    });
    return data;
  }

  function update() {
    var d = values();
    var commercial = d.service === "commercial" || d.propertyType === "commercial";
    $("home-fields").hidden = commercial;
    $("q-frequency").closest("label").hidden = d.service !== "recurring";
    var est = null;
    var svc = commercial ? null : pccsServiceKey(d.service, d.frequency);
    var size = commercial ? null : pccsSizeId(d.bedrooms, d.bathrooms);
    if (svc && size && cfg.showPrices) est = pccsEstimate(P, size, svc, d.addons);
    if (est) {
      $("q-total").textContent = "$" + est.total;
      $("q-detail").textContent = P.services[svc].label + " $" + est.base + (est.extras ? " + add-ons $" + est.extras : "") + (svc === "recurring" ? " per visit" : "");
    } else {
      $("q-total").textContent = "Custom quote";
      $("q-detail").textContent = commercial ? "We'll set a price after a walkthrough." :
        (d.service === "recurring" ? "Weekly and monthly visits are priced individually." : "We'll reply with an exact price.");
    }
    return { data: d, estimate: est };
  }

  function summary(r) {
    var d = r.data;
    return [
      "Quote request — Pierce County Cleaning Services",
      "Name: " + d.name, "Phone: " + d.phone, "Email: " + d.email,
      "Address: " + d.address + " " + d.zip,
      "Property: " + d.propertyType + (d.bedrooms ? ", " + d.bedrooms + " bed / " + d.bathrooms + " bath" : "") + (d.sqft ? ", " + d.sqft + " sq ft" : ""),
      "Service: " + d.service + (d.service === "recurring" ? " (" + d.frequency + ")" : ""),
      "Add-ons: " + (d.addons.length ? d.addons.map(function (k) { return P.addons[k].label; }).join(", ") : "none"),
      "Preferred date: " + (d.date || "flexible"),
      "Estimate shown: " + (r.estimate ? "$" + r.estimate.total : "custom quote"),
      "Notes: " + (d.notes || "—")
    ].join("\n");
  }

  form.addEventListener("input", update);
  form.addEventListener("change", update);
  update();

  var FIELD_IDS = { name: "q-name", email: "q-email", phone: "q-phone", address: "q-address", zip: "q-zip", propertyType: "q-type", service: "q-service", frequency: "q-frequency", bedrooms: "q-beds", bathrooms: "q-baths" };

  function labelOf(el) { return el.closest("label").childNodes[0].textContent.trim(); }

  function showError(msg) { var err = $("q-error"); err.textContent = msg; err.hidden = false; }

  function showCopyFallback(r, intro) {
    var box = $("q-result");
    box.innerHTML = "<b>Your request is ready</b><p class=\"note\"></p><pre></pre><button class=\"btn ghost\" type=\"button\" id=\"q-copy\">Copy request</button>";
    box.querySelector("p").textContent = intro;
    box.querySelector("pre").textContent = summary(r);
    box.hidden = false;
    $("q-copy").addEventListener("click", function () {
      var t = summary(r), b = this;
      (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { b.textContent = "Copied"; })
        .catch(function () { var range = document.createRange(); range.selectNodeContents(box.querySelector("pre")); var s = getSelection(); s.removeAllRanges(); s.addRange(range); });
    });
  }

  function showSent(res, email) {
    var box = $("q-result");
    var priced = res.priced && res.total != null;
    box.innerHTML = "<b class=\"serif\" style=\"font-size:26px\">Request sent</b>" +
      "<p></p><p class=\"note\"></p><p class=\"note\">Didn't get it? Check your spam folder, or reply to us with your quote number.</p>" +
      "<button class=\"btn ghost\" type=\"button\" id=\"q-again\">Start a new request</button>";
    var ps = box.querySelectorAll("p");
    ps[0].textContent = res.emailed === false
      ? "We received your request (" + res.quoteNumber + "). We'll email your quote within one business day."
      : "Your quote " + res.quoteNumber + (priced ? " for $" + res.total : "") + " is on its way to " + email + ".";
    ps[1].textContent = "We'll contact you within one business day to confirm your price and appointment. Nothing is charged until then.";
    box.hidden = false;
    form.hidden = true;
    $("q-again").addEventListener("click", function () { location.reload(); });
    box.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    $("q-error").hidden = true;
    var bad = Array.prototype.filter.call(form.querySelectorAll("[required]"), function (el) { return !el.closest("[hidden]") && (!el.value.trim() || !el.checkValidity()); });
    if (bad.length) {
      showError("Please fill in: " + bad.map(labelOf).join(", ") + ".");
      bad[0].focus(); return;
    }
    var r = update();
    if (!cfg.quoteEndpoint) {
      showCopyFallback(r, "Online sending isn't connected yet. Copy this and send it to us by text or email.");
      return;
    }
    var btn = $("q-submit"); btn.disabled = true; btn.textContent = "Sending…";
    var payload = Object.assign({}, r.data, { elapsed: Date.now() - loadedAt });
    // text/plain keeps this a "simple" request, which Google Apps Script web apps accept.
    fetch(cfg.quoteEndpoint, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) })
      .then(function (res) { return res.json(); })
      .then(function (res) {
        if (res.ok && res.quoteNumber) { showSent(res, r.data.email); return; }
        if (res.ok) { showSent({ quoteNumber: "received", emailed: false }, r.data.email); return; }
        if (res.error === "invalid" && res.fields) {
          var els = res.fields.map(function (f) { return $(FIELD_IDS[f]); }).filter(Boolean);
          showError("Please check: " + els.map(labelOf).join(", ") + ".");
          if (els[0]) els[0].focus();
        } else if (res.error === "too_soon") {
          showError("We just sent a quote to this email. Please wait a few minutes before sending another.");
        } else {
          showError("We couldn't send your request right now.");
          showCopyFallback(r, "Copy your request and text or email it to us instead.");
        }
      })
      .catch(function () {
        showError("Your request didn't send. Check your connection and try again.");
        showCopyFallback(r, "Or copy your request and text or email it to us.");
      })
      .then(function () { btn.disabled = false; btn.textContent = "Send my request"; });
  });
})();
