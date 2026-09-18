/* Projections by Vibes — two separate content types on one page:
   the ticker (a dated feed of short takes) and the picks board (a standing
   list of award calls, edited in place with the old picks left visible). */
(function () {
  "use strict";
  var K = window.KHOC;

  K.chrome().then(function () {
    return K.load("projections");
  }).then(function (data) {
    renderTicker((data.ticker && data.ticker.entries) || []);
    renderPicks(data.picksBoard || {});
  }).catch(function (err) { K.dataError(K.qs("[data-ticker]"), err); });

  function renderTicker(entries) {
    var host = K.qs("[data-ticker]");
    if (!entries.length) {
      host.innerHTML = '<p class="empty-state">Nothing posted yet.</p>';
      return;
    }
    var sorted = entries.slice().sort(function (a, b) {
      return (K.parseDate(b.date) || 0) - (K.parseDate(a.date) || 0);
    });

    host.innerHTML = sorted.map(function (entry) {
      var when = K.parseDate(entry.date);
      var stamp = when
        ? "<b>" + when.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + "</b>" +
          when.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
        : "<b>&mdash;</b>";
      return '<article class="ticker__item">' +
        '<p class="ticker__stamp"><time datetime="' + K.esc(entry.date || "") + '">' + stamp + "</time></p>" +
        "<div>" +
          '<p class="ticker__text">' + K.copy(entry.text, "her take") + "</p>" +
          (entry.tag ? '<span class="ticker__tag">' + K.esc(entry.tag) + "</span>" : "") +
        "</div>" +
      "</article>";
    }).join("");
  }

  function renderPicks(board) {
    if (board.title) K.qs("[data-picks-title]").textContent = board.title;
    K.qs("[data-picks-sub]").innerHTML = board.subtitle ? "<span>" + K.esc(board.subtitle) + "</span>" : "";
    K.qs("[data-picks-stamp]").textContent = board.lastUpdated
      ? "Last updated " + K.fmtDate(board.lastUpdated, { month: "short", day: "numeric", year: "numeric" })
      : "Not dated yet";

    var rows = board.rows || [];
    K.qs("[data-picks-rows]").innerHTML = rows.length
      ? rows.map(function (row) {
          var history = (row.history || []).map(function (past) {
            return "<li>" + K.esc(past.pick) +
              "<span>was, until " + K.fmtDate(past.changedOn, { month: "short", day: "numeric" }) + "</span></li>";
          }).join("");
          return '<div class="pick-row">' +
            '<p class="pick-row__award">' + K.esc(row.award) +
              (row.league ? " &middot; " + K.esc(row.league) : "") + "</p>" +
            '<p class="pick-row__pick">' + K.copy(row.pick, "pick for " + row.award) + "</p>" +
            (row.note ? '<p class="pick-row__note">' + K.copy(row.note, "note on this pick") + "</p>" : "") +
            (history ? '<ul class="pick-row__history">' + history + "</ul>" : "") +
          "</div>";
        }).join("")
      : '<p class="empty-state">No picks on the board yet.</p>';
  }
})();
