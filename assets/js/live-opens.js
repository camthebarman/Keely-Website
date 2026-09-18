/* Live pack opens: this week's board, the recurring schedule, how it works,
   and an optional results archive. Spots go through the same cart as the shop. */
(function () {
  "use strict";
  var K = window.KHOC;
  var site;

  K.chrome().then(function (ctx) {
    site = ctx.site;
    return K.load("opens");
  }).then(function (data) {
    var schedule = data.schedule || {};
    K.qs("[data-schedule-note]").innerHTML = K.copy(schedule.recurringNote, "the one-liner about the weekly schedule");
    renderWatch(data.watch);
    renderNext(data, schedule);
    renderSteps(data.howItWorks || []);
    renderList(data, schedule);
    renderArchive(data.archive);
  }).catch(function (err) { K.dataError(K.qs("[data-next-open]"), err); });

  /* Where to watch is configurable — she moves between platforms. */
  function renderWatch(watch) {
    var platforms = (watch && watch.platforms) || [];
    K.qs("[data-watch-chips]").innerHTML = platforms.length
      ? platforms.map(function (item) {
          return '<a class="chip' + (item.primary ? " chip--live" : "") + '" href="' + K.esc(item.url) + '" rel="noopener">' +
            (item.primary ? '<span class="dot"></span>' : "") + "Watch on " + K.esc(item.platform) + "</a>";
        }).join("")
      : '<span class="copy-needed">[COPY NEEDED — where she streams]</span>';
  }

  function renderNext(data, schedule) {
    var host = K.qs("[data-next-open]");
    var open = K.nextOpen(data);
    if (!open) {
      host.innerHTML = '<div class="board"><p class="label board__eyebrow">Next open</p>' +
        '<p class="board__date">Not posted<br>yet</p>' +
        '<p class="board__time">Add the next Tuesday to data/live-opens.json.</p></div>';
      return;
    }

    var days = K.daysUntil(open.date);
    var when = K.openDateTime(open, schedule);
    var eyebrow = days === 0 ? "Tonight" : days === 1 ? "Tomorrow" : "In " + days + " days";
    var timeText = (open.time || schedule.time || "") + " " + (open.timezone || schedule.timezone || "");
    var soldOut = open.spotsLeft === 0;
    var buyable = open.status === "open" && open.buyIn != null && !soldOut;
    var closesText = when
      ? "Spot sales close " + new Date(when.getTime() - 30 * 60000).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) +
        " " + (open.timezone || schedule.timezone || "")
      : "";

    var rows = [
      ["Sport", open.sport],
      ["Product", open.product],
      ["Format", open.breakType],
      ["Spots", open.spotsTotal != null ? open.spotsLeft + " left of " + open.spotsTotal : "Not posted"]
    ].map(function (row) {
      return '<div class="board__row leader"><dt>' + K.esc(row[0]) + '</dt><span class="leader__fill"></span><dd>' +
        (K.isPlaceholder(row[1]) ? K.copy(row[1]) : K.esc(row[1] == null ? "TBD" : row[1])) + "</dd></div>";
    }).join("");

    host.innerHTML =
      '<div class="board">' +
        '<p class="label board__eyebrow">' + K.esc(eyebrow) + " &middot; " + K.esc(schedule.weekday || "Tuesday") + " open</p>" +
        '<p class="board__date">' + K.fmtDate(open.date, { weekday: "long", month: "long", day: "numeric" }) + "</p>" +
        '<p class="board__time">' + K.esc(timeText) + (closesText ? " &middot; " + K.esc(closesText) : "") + "</p>" +
        '<div class="board__grid">' +
          "<dl class=\"board__rows\">" + rows + "</dl>" +
          '<div class="board__buyin">' +
            '<p class="label" style="color:rgba(242,236,223,.6)">Buy in</p>' +
            '<p class="board__price">' + (open.buyIn != null ? K.money(open.buyIn) : "TBD") + "</p>" +
            meter(open) +
            (buyable
              ? '<button class="btn btn--block" type="button" data-buy-spot>Buy a spot</button>'
              : '<button class="btn btn--block" type="button" disabled>' +
                (soldOut ? "Sold out" : "Not on sale yet") + "</button>") +
            '<p class="label" style="color:rgba(242,236,223,.55);line-height:1.5">Spots are added to the same cart as the shop. Payment isn\'t wired up yet.</p>' +
          "</div>" +
        "</div>" +
        (open.description ? '<p style="margin:1.25rem 0 0;max-width:34rem;color:rgba(242,236,223,.8)">' + K.copy(open.description, "what's in this box") + "</p>" : "") +
      "</div>";

    var button = K.qs("[data-buy-spot]", host);
    if (button) button.addEventListener("click", function () { addSpot(open, schedule); });
  }

  /* Tick-mark meter: filled ticks are spots already taken. */
  function meter(open) {
    if (open.spotsTotal == null || open.spotsLeft == null) return "";
    var total = Math.min(open.spotsTotal, 32);
    var takenRatio = (open.spotsTotal - open.spotsLeft) / open.spotsTotal;
    var taken = Math.round(takenRatio * total);
    var ticks = "";
    for (var i = 0; i < total; i++) {
      ticks += '<span class="meter__tick" data-taken="' + (i < taken ? "true" : "false") + '"></span>';
    }
    return '<div class="meter"><div class="meter__bar" role="img" aria-label="' +
      K.esc(open.spotsLeft + " of " + open.spotsTotal + " spots still available") + '">' + ticks + "</div>" +
      '<p class="meter__text">' + K.esc(open.spotsLeft + " of " + open.spotsTotal + " left") + "</p></div>";
  }

  function addSpot(open, schedule) {
    var result = K.cart.add({
      kind: "spot",
      id: open.id,
      title: "Pack open spot · " + K.fmtDate(open.date, { month: "short", day: "numeric" }),
      subtitle: open.product,
      price: open.buyIn,
      max: Math.max(1, open.spotsLeft || 1),
      href: "live-opens.html",
      photo: null,
      meta: (open.sport || "") + " · " + (open.breakType || "") + " · " +
        (open.time || schedule.time || "") + " " + (open.timezone || schedule.timezone || "")
    });
    K.toast(result.ok ? "Spot added to your cart." : "That's every remaining spot already in your cart.");
  }

  function renderSteps(steps) {
    K.qs("[data-how-it-works]").innerHTML = steps.map(function (step) {
      return "<li><div><h3>" + K.copy(step.step, "step name") + "</h3><p>" + K.copy(step.text, "step explanation") + "</p></div></li>";
    }).join("");
  }

  function renderList(data, schedule) {
    var next = K.nextOpen(data);
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var upcoming = (data.opens || []).filter(function (open) {
      var d = K.parseDate(open.date);
      return d && d >= today && (!next || open.id !== next.id);
    }).sort(function (a, b) { return K.parseDate(a.date) - K.parseDate(b.date); });

    var host = K.qs("[data-opens-list]");
    if (!upcoming.length) {
      host.innerHTML = '<p class="empty-state">Nothing else on the books past this week yet.</p>';
      return;
    }

    host.innerHTML = upcoming.map(function (open) {
      var announced = open.status !== "open";
      var soldOut = open.spotsLeft === 0;
      var buyable = !announced && open.buyIn != null && !soldOut;
      return '<article class="open-row' + (announced ? " open-row--announced" : "") + '">' +
        '<p class="open-row__date">' + K.fmtDate(open.date, { month: "short", day: "numeric" }) +
          "<small>" + K.esc(schedule.weekday || "Tuesday") + " &middot; " + K.esc(open.time || schedule.time || "") + "</small></p>" +
        "<div>" +
          '<p class="open-row__product mb-0">' + K.copy(open.product, "product for this date") + "</p>" +
          '<p class="statline">' + [open.sport, open.breakType,
            open.spotsTotal != null ? open.spotsLeft + "/" + open.spotsTotal + " spots" : "spots TBD"]
            .filter(Boolean).map(function (bit) { return "<span>" + K.esc(bit) + "</span>"; }).join("") + "</p>" +
        "</div>" +
        "<div>" + (buyable
          ? '<button class="btn btn--sm" type="button" data-open-id="' + K.esc(open.id) + '">Buy a spot &middot; ' + K.money(open.buyIn) + "</button>"
          : '<span class="chip">' + (soldOut ? "Sold out" : "Announced") + "</span>") + "</div>" +
      "</article>";
    }).join("");

    K.qsa("[data-open-id]", host).forEach(function (button) {
      button.addEventListener("click", function () {
        var open = (data.opens || []).filter(function (o) { return o.id === button.getAttribute("data-open-id"); })[0];
        if (open) addSpot(open, schedule);
      });
    });
  }

  function renderArchive(archive) {
    if (!archive || !archive.enabled || !(archive.results || []).length) return;
    K.qs("[data-archive-wrap]").hidden = false;
    K.qs("[data-archive-note]").textContent = archive.note || "";
    K.qs("[data-archive]").innerHTML =
      "<thead><tr><th>Date</th><th>Product</th><th>Spot</th><th>Pulled</th></tr></thead><tbody>" +
      archive.results.slice().sort(function (a, b) {
        return K.parseDate(b.date) - K.parseDate(a.date);
      }).map(function (row) {
        return "<tr><td>" + K.fmtDate(row.date, { month: "short", day: "numeric", year: "numeric" }) + "</td>" +
          "<td>" + K.esc(row.product) + "</td>" +
          "<td>" + K.esc(row.buyer) + "</td>" +
          "<td><strong>" + K.esc(row.pulled) + "</strong></td></tr>";
      }).join("") + "</tbody>";
  }
})();
