/* Shop: filter, sort and search the catalog. State is mirrored into the URL
   so a filtered view can be shared or bookmarked. */
(function () {
  "use strict";
  var K = window.KHOC;
  var form = K.qs("[data-filters]");
  var grid = K.qs("[data-shop-grid]");
  var countNode = K.qs("[data-result-count]");
  var countChip = K.qs("[data-count-chip]");
  var all = [];

  K.chrome().then(function (ctx) {
    var promise = ctx.site.signedPromise || {};
    K.qs("[data-signed-head]").textContent = "Signed, " + (promise.signature || "Keely");
    K.qs("[data-signed-body]").innerHTML = K.copy(promise.long, "the longer version of the signed-card promise");
    return K.load("cards");
  }).then(function (data) {
    all = data.cards || [];
    populateSelect("sport", unique(all.map(function (c) { return c.sport; })));
    populateSelect("team", unique(all.map(function (c) { return c.team; })));
    readUrl();
    render();
  }).catch(function (err) { K.dataError(grid, err); });

  function unique(values) {
    return values.filter(function (value, index, list) {
      return value && list.indexOf(value) === index;
    }).sort();
  }

  function populateSelect(name, values) {
    var select = form.elements[name];
    values.forEach(function (value) {
      var option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
  }

  /* -- url <-> form ----------------------------------------------------- */
  var FIELDS = ["q", "sport", "team", "sort", "price", "status", "grade"];

  function readUrl() {
    var params = new URLSearchParams(window.location.search);
    FIELDS.forEach(function (name) {
      if (!params.has(name)) return;
      var field = form.elements[name];
      var value = params.get(name);
      if (!field) return;
      if (field.tagName === "SELECT") {
        var allowed = Array.prototype.some.call(field.options, function (o) { return o.value === value; });
        if (allowed) field.value = value;
      } else {
        field.value = value;
      }
    });
  }

  function writeUrl() {
    var params = new URLSearchParams();
    FIELDS.forEach(function (name) {
      var field = form.elements[name];
      if (!field) return;
      var value = field.value.trim();
      /* "available only" is the default view, so keep it out of the URL. */
      var isDefault = (name === "status" && value === "available") ||
        (name === "sort" && value === "newest") || value === "";
      if (!isDefault) params.set(name, value);
    });
    var query = params.toString();
    var url = window.location.pathname + (query ? "?" + query : "");
    window.history.replaceState(null, "", url);
  }

  /* -- filtering -------------------------------------------------------- */
  function matches(card, state) {
    if (state.sport && card.sport !== state.sport) return false;
    if (state.team && card.team !== state.team) return false;
    if (state.status && card.status !== state.status) return false;
    if (state.grade === "graded" && !card.graded) return false;
    if (state.grade === "raw" && card.graded) return false;

    if (state.price) {
      var bounds = state.price.split("-");
      var min = bounds[0] === "" ? -Infinity : Number(bounds[0]);
      var max = bounds[1] === "" || bounds[1] == null ? Infinity : Number(bounds[1]);
      var price = Number(card.price);
      if (!(price >= min && price < (max === Infinity ? Infinity : max))) return false;
    }

    if (state.q) {
      var haystack = [
        card.player, card.team, card.sport, card.set, card.parallel,
        card.cardNumber, card.year, card.grader, card.condition
      ].filter(Boolean).join(" ").toLowerCase();
      var terms = state.q.toLowerCase().split(/\s+/).filter(Boolean);
      if (!terms.every(function (term) { return haystack.indexOf(term) !== -1; })) return false;
    }
    return true;
  }

  var SORTS = {
    "newest": function (a, b) { return String(b.addedOn || "").localeCompare(String(a.addedOn || "")); },
    "price-asc": function (a, b) { return (a.price || 0) - (b.price || 0); },
    "price-desc": function (a, b) { return (b.price || 0) - (a.price || 0); },
    "year-desc": function (a, b) { return (b.year || 0) - (a.year || 0); },
    "year-asc": function (a, b) { return (a.year || 0) - (b.year || 0); },
    "player": function (a, b) { return String(a.player).localeCompare(String(b.player)); }
  };

  function render() {
    var state = {};
    FIELDS.forEach(function (name) {
      var field = form.elements[name];
      state[name] = field ? field.value.trim() : "";
    });

    var results = all.filter(function (card) { return matches(card, state); });
    results.sort(SORTS[state.sort] || SORTS.newest);

    grid.innerHTML = results.length
      ? results.map(K.card.pocket).join("")
      : '<p class="empty-state">No cards match that. Try clearing a filter, or <a href="shop.html">reset the whole thing</a>.</p>';
    K.initTilt(grid);

    var label = results.length === 1 ? "1 card" : results.length + " cards";
    countNode.textContent = label + (results.length === all.length ? " listed" : " of " + all.length);
    if (countChip) countChip.textContent = label;
    writeUrl();
  }

  form.addEventListener("input", function (event) {
    if (event.target.type === "search") {
      window.clearTimeout(form._debounce);
      form._debounce = window.setTimeout(render, 180);
    } else {
      render();
    }
  });
  form.addEventListener("change", render);
  form.addEventListener("submit", function (event) { event.preventDefault(); render(); });

  K.qs("[data-reset]").addEventListener("click", function () {
    form.reset();
    render();
  });
})();
