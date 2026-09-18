/* Baked: the show schedule, and the gallery grouped by the show each item
   went to. In-person sales only — no cart involvement here. */
(function () {
  "use strict";
  var K = window.KHOC;

  K.chrome().then(function () {
    return K.load("baked");
  }).then(function (data) {
    K.qs("[data-baked-intro]").innerHTML = "<p>" + K.copy(data.intro, "two lines on the baking, and that it's at-show only") + "</p>";
    renderShows(data.upcomingShows || []);
    renderGallery(data.items || []);
  }).catch(function (err) { K.dataError(K.qs("[data-bake-groups]"), err); });

  function renderShows(shows) {
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var upcoming = shows.filter(function (show) {
      var d = K.parseDate(show.date);
      return d && d >= today;
    }).sort(function (a, b) { return K.parseDate(a.date) - K.parseDate(b.date); });

    var host = K.qs("[data-shows]");
    if (!upcoming.length) {
      host.innerHTML = '<p class="empty-state">No shows on the calendar right now. Next dates go up as she books them.</p>';
      return;
    }

    host.innerHTML = upcoming.map(function (show) {
      var days = K.daysUntil(show.date);
      var when = days === 0 ? "Today" : days === 1 ? "Tomorrow" : "In " + days + " days";
      return '<article class="show-row">' +
        '<p class="show-row__date">' + K.fmtDate(show.date, { month: "short", day: "numeric" }) +
          "<small>" + K.esc(when) + "</small></p>" +
        "<div>" +
          '<h3 class="show-row__name">' + K.copy(show.name, "show name") + "</h3>" +
          '<p class="show-row__meta mb-0">' + K.copy(show.location, "venue") +
            (show.time ? " &middot; " + K.esc(show.time) : "") + "</p>" +
          (show.note ? '<p class="show-row__meta mb-0">' + K.copy(show.note, "note") + "</p>" : "") +
        "</div>" +
      "</article>";
    }).join("");
  }

  function renderGallery(items) {
    var host = K.qs("[data-bake-groups]");
    if (!items.length) {
      host.innerHTML = '<p class="empty-state">Nothing in the gallery yet.</p>';
      return;
    }

    /* Group by show, newest show first, using each group's latest date. */
    var groups = {};
    items.forEach(function (item) {
      var key = item.show || "Unsorted";
      if (!groups[key]) groups[key] = { show: key, date: item.date, items: [] };
      groups[key].items.push(item);
      if (K.parseDate(item.date) > K.parseDate(groups[key].date)) groups[key].date = item.date;
    });

    var ordered = Object.keys(groups).map(function (key) { return groups[key]; })
      .sort(function (a, b) { return (K.parseDate(b.date) || 0) - (K.parseDate(a.date) || 0); });

    host.innerHTML = ordered.map(function (group) {
      return '<section class="bake-group">' +
        '<div class="bake-group__head">' +
          '<h3 class="bake-group__show">' + K.esc(group.show) + "</h3>" +
          '<p class="label mb-0">' + K.fmtDate(group.date, { month: "long", day: "numeric", year: "numeric" }) +
            " &middot; " + group.items.length + (group.items.length === 1 ? " item" : " items") + "</p>" +
        "</div>" +
        '<div class="bake-grid">' + group.items.map(function (item) {
          return '<article class="bake-item">' +
            K.frame(item.photo, item.name + " at " + group.show, item.name) +
            '<div><h4 class="bake-item__name">' + K.esc(item.name) + "</h4>" +
            '<p class="bake-item__desc">' + K.copy(item.description, "description for " + item.name) + "</p></div>" +
          "</article>";
        }).join("") + "</div>" +
      "</section>";
    }).join("");
  }
})();
