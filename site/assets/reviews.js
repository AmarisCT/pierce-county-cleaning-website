// Reviews: shows the reviews marked "Show on website: Yes" in the sheet's Reviews tab, and sends
// new reviews from the Reviews page. Both go through the same Google Apps Script web app as the
// quote form (PCCS_CONFIG.quoteEndpoint). Nothing is shown until at least one real review exists.
(function () {
  var cfg = window.PCCS_CONFIG || {};
  var $ = function (id) { return document.getElementById(id); };
  var all = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

  // Google links appear once they're set in config.js
  if (cfg.googleReviewUrl) {
    all("[data-google-review]").forEach(function (el) { el.hidden = false; });
    all("[data-google-review-link]").forEach(function (a) { a.href = cfg.googleReviewUrl; });
  }
  if (cfg.googleProfileUrl) {
    all("[data-google-profile]").forEach(function (a) { a.href = cfg.googleProfileUrl; a.hidden = false; });
  }

  // ----- published reviews -----
  var lists = all("[data-reviews]");
  if (lists.length && cfg.quoteEndpoint) {
    fetch(cfg.quoteEndpoint + (cfg.quoteEndpoint.indexOf("?") < 0 ? "?" : "&") + "reviews=1")
      .then(function (res) { return res.json(); })
      .then(render)
      .catch(function () { /* leave the section hidden */ });
  }

  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  function monthYear(ymd) {
    var m = /^(\d{4})-(\d{2})-\d{2}$/.exec(ymd || "");
    return m ? MONTHS[Number(m[2]) - 1] + " " + m[1] : "";
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function card(r) {
    var rating = Math.max(1, Math.min(5, Math.round(Number(r.rating) || 0)));
    var art = el("article", "review");
    var stars = el("div", "review-stars", "★★★★★".slice(0, rating) + "☆☆☆☆☆".slice(0, 5 - rating));
    stars.setAttribute("role", "img");
    stars.setAttribute("aria-label", "Rated " + rating + " out of 5");
    art.appendChild(stars);
    art.appendChild(el("p", "review-text", r.text));
    art.appendChild(el("p", "caps", [r.name, r.city].filter(Boolean).join(" · ")));
    var meta = el("p", "note");
    var when = monthYear(r.date);
    if (r.source === "Google" && r.link) {
      meta.appendChild(document.createTextNode((r.service ? r.service + " · " : "") + (when ? when + " · " : "")));
      var a = el("a", null, "on Google");
      a.href = r.link; a.target = "_blank"; a.rel = "noopener";
      meta.appendChild(a);
    } else {
      meta.textContent = [r.service, when, r.source === "Google" ? "on Google" : "on our website"].filter(Boolean).join(" · ");
    }
    art.appendChild(meta);
    return art;
  }
  function render(data) {
    if (!data || !Array.isArray(data.reviews) || !data.reviews.length) return;
    lists.forEach(function (list) {
      var limit = Number(list.getAttribute("data-limit")) || 60;
      list.innerHTML = "";
      data.reviews.slice(0, limit).forEach(function (r) { list.appendChild(card(r)); });
      var section = list.closest("[data-reviews-section]");
      if (!section) return;
      var summary = section.querySelector("[data-reviews-summary]");
      if (summary && data.count) {
        summary.textContent = data.average + " out of 5 · " + data.count + (data.count === 1 ? " review" : " reviews") +
          (data.count > limit ? " · showing the newest " + limit : "");
      }
      section.hidden = false;
    });
  }

  // ----- leave a review -----
  var form = $("review-form");
  if (!form) return;
  var loadedAt = Date.now();
  var FIELD_IDS = { name: "rv-name", email: "rv-email", rating: "rv-rating", text: "rv-text", consent: "rv-consent" };
  var NAMES = { name: "Name", email: "Email", rating: "Your rating", text: "Your review", consent: "Permission to post" };

  function values() {
    var d = {};
    new FormData(form).forEach(function (v, k) { d[k] = String(v).trim(); });
    d.consent = $("rv-consent").checked;
    return d;
  }
  function problems(d) {
    var out = [];
    if (!d.rating) out.push("rating");
    if ((d.text || "").length < 10) out.push("text");
    if ((d.name || "").length < 2) out.push("name");
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(d.email || "")) out.push("email");
    if (!d.consent) out.push("consent");
    return out;
  }
  function showError(fields, msg) {
    var err = $("rv-error");
    err.textContent = msg || "Please check: " + fields.map(function (f) { return NAMES[f] || f; }).join(", ") + ".";
    err.hidden = false;
    var first = fields.length && $(FIELD_IDS[fields[0]]);
    if (first) (first.querySelector("input") || first).focus();
  }
  function googleButton() {
    if (!cfg.googleReviewUrl) return null;
    var a = el("a", "btn ghost", "Also post it on Google");
    a.href = cfg.googleReviewUrl; a.target = "_blank"; a.rel = "noopener";
    return a;
  }
  function showThanks() {
    var box = $("rv-result");
    box.innerHTML = "";
    box.appendChild(el("b", "serif", "Thank you"));
    box.lastChild.style.fontSize = "26px";
    box.appendChild(el("p", null, "We've received your review. We read every one and post genuine customer reviews on this page, usually within a few days."));
    var g = googleButton();
    if (g) {
      box.appendChild(el("p", "note", "Reviews on Google help neighbors find us too. If you have a minute:"));
      box.appendChild(g);
    }
    box.hidden = false;
    form.hidden = true;
    box.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function showFallback(d, intro) {
    var box = $("rv-result");
    var to = cfg.email || "";
    var body = "Rating: " + d.rating + " out of 5\n" + (d.service ? "Service: " + d.service + "\n" : "") + (d.city ? "City: " + d.city + "\n" : "") + "\n" + d.text + "\n\n— " + d.name;
    box.innerHTML = "";
    box.appendChild(el("b", null, "Send it by email instead"));
    box.appendChild(el("p", "note", intro));
    if (to) {
      var a = el("a", "btn ghost", "Email my review");
      a.href = "mailto:" + to + "?subject=" + encodeURIComponent("My review") + "&body=" + encodeURIComponent(body);
      box.appendChild(a);
    }
    box.hidden = false;
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    $("rv-error").hidden = true;
    var d = values();
    var bad = problems(d);
    if (bad.length) { showError(bad); return; }
    if (!cfg.quoteEndpoint) { showFallback(d, "Online reviews aren't connected yet."); return; }
    var btn = $("rv-submit"); btn.disabled = true; btn.textContent = "Sending…";
    var payload = Object.assign({ type: "review" }, d, { elapsed: Date.now() - loadedAt });
    fetch(cfg.quoteEndpoint, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) })
      .then(function (res) { return res.json(); })
      .then(function (res) {
        if (res.ok) { showThanks(); return; }
        var known = res.fields && res.fields.length && res.fields.every(function (f) { return f in FIELD_IDS; });
        if (res.error === "invalid" && known) showError(res.fields);
        else if (res.error === "too_soon") showError([], "We just received a review from this email. Please wait a few minutes before sending another.");
        else showFallback(d, "We couldn't send your review right now.");
      })
      .catch(function () { showFallback(d, "Your review didn't send. Check your connection, or email it to us."); })
      .then(function () { btn.disabled = false; btn.textContent = "Send my review"; });
  });
})();
