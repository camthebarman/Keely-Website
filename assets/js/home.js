/* Home page: hero copy, the Tuesday stub, the section index, a catalog pull. */
(function () {
  "use strict";
  var K = window.KHOC;

  K.chrome().then(function (ctx) {
    var site = ctx.site;
    var opens = ctx.opens;

    /* -- hero ------------------------------------------------------------ */
    K.qs("[data-hero-kicker]").innerHTML = K.esc(site.heroKicker || "");
    K.qs("[data-hero-script]").textContent = site.brand.wordmarkLine1;
    K.qs("[data-hero-title]").textContent = site.brand.wordmarkLine2;
    K.qs("[data-hero-statement]").innerHTML = "<p>" + K.copy(site.statement, "one sentence on what this is") + "</p>";
    K.qs("[data-hero-sub]").innerHTML = K.copy(site.heroSub, "two short lines under the wordmark");

    var promise = site.signedPromise || {};
    K.qs("[data-signed-head]").textContent = "Signed, " + (promise.signature || "Keely");
    K.qs("[data-signed-body]").innerHTML = K.copy(promise.long, "the longer version of the signed-card promise");

    /* -- section index --------------------------------------------------- */
    K.qs("[data-section-index]").innerHTML = (site.sections || []).map(function (section) {
      return '<a class="index-row" href="' + K.esc(section.href) + '">' +
        '<span class="index-row__num">' + K.esc(section.num) + "</span>" +
        '<span class="index-row__title">' + K.esc(section.title) + "</span>" +
        '<span class="index-row__blurb">' + K.copy(section.blurb, "blurb for " + section.title) + "</span>" +
        '<span class="index-row__arrow" aria-hidden="true">&rarr;</span>' +
      "</a>";
    }).join("");

    /* -- Tuesday stub ---------------------------------------------------- */
    renderStub(site, opens);
    renderHeroStats(opens);

    /* -- featured cards -------------------------------------------------- */
    K.load("cards").then(function (data) {
      var featured = (data.cards || []).filter(function (card) {
        return card.featured && card.status === "available";
      }).slice(0, 3);
      if (!featured.length) {
        featured = (data.cards || []).filter(function (c) { return c.status === "available"; }).slice(0, 3);
      }
      var grid = K.qs("[data-featured-grid]");
      grid.innerHTML = featured.length
        ? featured.map(K.card.pocket).join("")
        : '<p class="empty-state">Nothing listed right now. Check back, or watch a Tuesday open.</p>';
      K.initTilt(grid);

      /* The hero slab shows the priciest available card as the case piece. */
      var headline = (data.cards || []).filter(function (c) { return c.status === "available"; })
        .sort(function (a, b) { return (b.price || 0) - (a.price || 0); })[0];
      if (headline) {
        K.qs("[data-slab-desc]").innerHTML =
          K.esc(headline.year + " " + headline.set) + "<br>" + K.esc(headline.player);
        K.qs("[data-slab-grader]").textContent = headline.graded ? (headline.grader || "Graded") : "Raw";
        K.qs("[data-slab-grade]").textContent = headline.graded ? (headline.grade || "—") : "NM";
        K.qs("[data-slab-window]").innerHTML =
          K.frame(headline.photoFront, K.card.altText(headline), headline.player + " front");
        K.qs("[data-slab-caption]").innerHTML =
          "In the case: " + K.esc(headline.player) + " · " + K.money(headline.price) +
          ' · <a href="product.html?id=' + encodeURIComponent(headline.id) + '">Details</a>';
      } else {
        K.qs("[data-slab-desc]").textContent = "Case is empty";
        K.qs("[data-slab-grader]").textContent = "House of Cards";
        K.qs("[data-slab-grade]").textContent = "—";
        K.qs("[data-slab-window]").innerHTML = K.frame(null, "No card listed", "Nothing listed");
      }
    }).catch(function (err) { K.dataError(K.qs("[data-featured-grid]"), err); });
  }).catch(function (err) {
    K.dataError(document.querySelector("main"), err);
  });

  /* Plain facts under the hero, straight out of the data files. */
  function renderHeroStats(opens) {
    var host = K.qs("[data-hero-stats]");
    var open = K.nextOpen(opens);
    var schedule = (opens && opens.schedule) || {};

    K.load("cards").then(function (data) {
      var available = (data.cards || []).filter(function (c) { return c.status === "available"; });
      var sports = available.map(function (c) { return c.sport; })
        .filter(function (v, i, list) { return list.indexOf(v) === i; });
      var cheapest = available.reduce(function (low, c) {
        return low == null || c.price < low ? c.price : low;
      }, null);

      var rows = [
        ["Singles listed", available.length + (sports.length ? " · " + sports.join(", ") : "")],
        ["Next pack open", open
          ? K.fmtDate(open.date, { weekday: "short", month: "short", day: "numeric" }) + " · " +
            (open.time || schedule.time || "")
          : "To be posted"],
        ["Starting at", cheapest != null ? K.money(cheapest) : "—"]
      ];

      host.innerHTML = rows.map(function (row) {
        return "<div><dt>" + K.esc(row[0]) + '</dt><span class="leader__fill"></span><dd>' +
          K.esc(row[1]) + "</dd></div>";
      }).join("");
    }).catch(function () { host.innerHTML = ""; });
  }

  function renderStub(site, opens) {
    var host = K.qs("[data-tuesday-stub]");
    if (!opens) {
      host.innerHTML = '<p class="notice notice--error">Couldn\'t load the pack open schedule.</p>';
      return;
    }
    var schedule = opens.schedule || {};
    var open = K.nextOpen(opens);
    if (!open) {
      host.innerHTML = '<div class="stub"><div class="stub__main">' +
        '<p class="label">' + K.esc(schedule.weekday || "Tuesday") + " pack opens</p>" +
        '<p class="stub__date">Next date<br>coming soon</p>' +
        '<p class="muted">Add the next few Tuesdays to <code>data/live-opens.json</code>.</p>' +
        "</div></div>";
      return;
    }

    var days = K.daysUntil(open.date);
    var countdown = days === 0 ? "Tonight" : days === 1 ? "Tomorrow" : "In " + days + " days";
    var spots = open.spotsLeft != null && open.spotsTotal != null
      ? open.spotsLeft + " of " + open.spotsTotal + " spots left"
      : "Spots not posted yet";
    var buyable = open.status === "open" && open.buyIn != null && (open.spotsLeft == null || open.spotsLeft > 0);

    host.innerHTML =
      '<div class="stub">' +
        '<div class="stub__main">' +
          '<p class="label">' + K.esc(schedule.weekday || "Tuesday") + ' pack open &middot; every week</p>' +
          '<p class="stub__date">' + K.fmtDate(open.date, { weekday: "long", month: "long", day: "numeric" }) + "</p>" +
          '<div class="stub__meta">' +
            '<p class="statline mb-0"><span>' + K.esc(open.sport || "") + "</span><span>" +
              K.esc(open.breakType || "") + "</span><span>" +
              K.esc((open.time || schedule.time || "") + " " + (open.timezone || schedule.timezone || "")) + "</span></p>" +
            "<p class=\"mb-0\"><strong>" + K.copy(open.product, "what's in this week's box") + "</strong></p>" +
            '<p class="label mb-0">' + K.esc(spots) + "</p>" +
          "</div>" +
          '<div class="flex-row">' +
            '<a class="btn" href="live-opens.html">' + (buyable ? "Buy a spot" : "See the schedule") + "</a>" +
            '<a class="btn btn--ghost" href="live-opens.html#how">How a pack open works</a>' +
          "</div>" +
        "</div>" +
        '<div class="stub__tear">' +
          '<p class="label">Buy-in</p>' +
          '<p class="stub__countdown">' + (open.buyIn != null ? K.money(open.buyIn) : "TBD") + "</p>" +
          '<p class="label mb-0">' + K.esc(countdown) + "</p>" +
        "</div>" +
      "</div>";
  }
})();
