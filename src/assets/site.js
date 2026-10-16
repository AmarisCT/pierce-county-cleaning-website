// Shared behavior: mobile menu, contact details from config, "starting at" prices.
(function () {
  var cfg = window.PCCS_CONFIG || {};
  var P = window.PCCS_PRICES;

  var btn = document.querySelector(".menu-btn");
  var nav = document.querySelector("nav.site-nav");
  if (btn && nav) btn.addEventListener("click", function () {
    var open = nav.classList.toggle("open");
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  });

  // Contact details: shown only when set in config.js
  document.querySelectorAll("[data-contact]").forEach(function (el) {
    var kind = el.getAttribute("data-contact");
    var val = cfg[kind];
    if (!val) { el.hidden = true; return; }
    var a = document.createElement("a");
    a.textContent = val;
    a.href = kind === "phone" ? "tel:" + val.replace(/[^0-9+]/g, "") : "mailto:" + val;
    el.querySelector("[data-value]") ? el.querySelector("[data-value]").replaceWith(a) : el.appendChild(a);
  });
  document.querySelectorAll("[data-contact-missing]").forEach(function (el) {
    el.hidden = !!(cfg.phone || cfg.email);
  });

  // "From $X" labels: data-from="standard" shows the smallest price for that service
  document.querySelectorAll("[data-from]").forEach(function (el) {
    if (!cfg.showPrices || !P) { el.hidden = true; return; }
    var svc = P.services[el.getAttribute("data-from")];
    if (!svc) { el.hidden = true; return; }
    var min = Math.min.apply(null, Object.keys(svc.prices).map(function (k) { return svc.prices[k]; }));
    el.textContent = "From $" + min + (el.getAttribute("data-from") === "recurring" ? " per visit" : "");
  });

  // Price tables: <tbody data-price-table> rows built from prices.js
  document.querySelectorAll("[data-price-table]").forEach(function (tb) {
    var wrap = tb.closest(".table-wrap");
    if (!cfg.showPrices || !P) { if (wrap) wrap.hidden = true; return; }
    tb.innerHTML = P.sizes.map(function (s) {
      return "<tr><td>" + s.label + "</td>" + ["standard", "recurring", "deep", "moveout"].map(function (k) {
        return '<td class="num">$' + P.services[k].prices[s.id] + "</td>";
      }).join("") + "</tr>";
    }).join("");
  });
  document.querySelectorAll("[data-addon-list]").forEach(function (ul) {
    if (!P) return;
    ul.innerHTML = Object.keys(P.addons).map(function (k) {
      var a = P.addons[k];
      return "<li>" + a.label + (cfg.showPrices ? " — $" + a.price : "") + "</li>";
    }).join("");
  });
  var y = document.querySelector("[data-year]"); if (y) y.textContent = new Date().getFullYear();
})();
