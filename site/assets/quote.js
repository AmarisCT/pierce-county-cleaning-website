// Quote page: live estimate + submission.
// Submits JSON to PCCS_CONFIG.quoteEndpoint when set. Without an endpoint, it shows the
// request summary so the customer can copy it (no data is sent anywhere).
(function () {
  var cfg = window.PCCS_CONFIG || {};
  var P = window.PCCS_PRICES;
  var $ = function (id) { return document.getElementById(id); };
  var form = $("quote-form");
  if (!form || !P) return;

  // Map bedroom/bathroom choices to a price-table size; null = custom quote.
  function sizeId(beds, baths) {
    beds = Number(beds); baths = Number(baths);
    if (beds === 0 && baths <= 1) return "studio";
    if (beds === 1 && baths <= 1) return "1-1";
    if (beds === 2 && baths <= 1) return "2-1";
    if (beds === 2 && baths <= 2) return "2-2";
    if (beds === 3 && baths <= 2) return "3-2";
    if (beds === 4 && baths <= 2.5) return "4-2.5";
    if (beds <= 1 && baths <= 2) return "2-2";   // small home, extra bathroom
    if (beds === 3 && baths <= 2.5) return "4-2.5";
    return null;
  }

  $("q-addons").innerHTML = Object.keys(P.addons).map(function (k) {
    var a = P.addons[k];
    return '<label for="ad-' + k + '"><input type="checkbox" id="ad-' + k + '" name="addons" value="' + k + '">' +
      a.label + (cfg.showPrices ? " · $" + a.price : "") + "</label>";
  }).join("");

  var params = new URLSearchParams(location.search);
  if (params.get("type") === "commercial") { $("q-type").value = "commercial"; $("q-service").value = "commercial"; }

  function values() {
    var data = {};
    new FormData(form).forEach(function (v, k) {
      if (k === "addons") (data.addons = data.addons || []).push(v); else data[k] = String(v).trim();
    });
    data.addons = data.addons || [];
    return data;
  }

  function serviceKey(d) {
    if (d.service === "recurring") return d.frequency === "biweekly" ? "recurring" : null; // weekly/monthly quoted individually
    return d.service;
  }

  function update() {
    var d = values();
    var commercial = d.service === "commercial" || d.propertyType === "commercial";
    $("home-fields").hidden = commercial;
    $("q-frequency").closest("label").hidden = d.service !== "recurring" && !commercial;
    var est = null, svc = serviceKey(d), size = sizeId(d.bedrooms, d.bathrooms);
    if (!commercial && svc && size && cfg.showPrices) est = pccsEstimate(P, size, svc, d.addons);
    if (est) {
      $("q-total").textContent = "$" + est.total;
      $("q-detail").textContent = P.services[svc].label + " $" + est.base + (est.extras ? " + add-ons $" + est.extras : "") + (svc === "recurring" ? " per visit" : "");
    } else {
      $("q-total").textContent = "Custom quote";
      $("q-detail").textContent = commercial ? "We'll set a price after a walkthrough." :
        (d.service === "recurring" ? "Weekly and monthly prices are quoted individually." : "Your home needs a custom quote. We'll reply with a price.");
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

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var err = $("q-error");
    var bad = Array.prototype.filter.call(form.querySelectorAll("[required]"), function (el) { return !el.value.trim() || !el.checkValidity(); });
    if (bad.length) {
      err.textContent = "Please fill in: " + bad.map(function (el) { return el.closest("label").childNodes[0].textContent.trim(); }).join(", ") + ".";
      err.hidden = false; bad[0].focus(); return;
    }
    err.hidden = true;
    var r = update();
    var box = $("q-result");
    if (!cfg.quoteEndpoint) {
      box.innerHTML = "<b>Your request is ready</b><p class=\"note\">Online submission isn't connected yet. Copy this and send it to us by text or email.</p><pre></pre><button class=\"btn ghost\" type=\"button\" id=\"q-copy\">Copy request</button>";
      box.querySelector("pre").textContent = summary(r);
      box.hidden = false;
      $("q-copy").addEventListener("click", function () {
        var t = summary(r), b = this;
        (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { b.textContent = "Copied"; })
          .catch(function () { var range = document.createRange(); range.selectNodeContents(box.querySelector("pre")); var s = getSelection(); s.removeAllRanges(); s.addRange(range); });
      });
      return;
    }
    var btn = $("q-submit"); btn.disabled = true; btn.textContent = "Sending…";
    fetch(cfg.quoteEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(Object.assign({}, r.data, { estimate: r.estimate ? r.estimate.total : null, summary: summary(r) }))
    }).then(function (res) {
      if (!res.ok) throw new Error(res.status);
      form.reset(); update();
      box.innerHTML = "<b>Request sent</b><p>Thanks! We'll confirm your price and appointment within one business day.</p>";
      box.hidden = false;
    }).catch(function () {
      err.textContent = "Your request didn't send. Check your connection and try again.";
      err.hidden = false;
    }).then(function () { btn.disabled = false; btn.textContent = "Send my request"; });
  });

})();
