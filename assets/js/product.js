/* Product detail. Reads ?id= out of the URL and finds that card in cards.json. */
(function () {
  "use strict";
  var K = window.KHOC;
  var host = K.qs("[data-product]");
  var site;

  K.chrome().then(function (ctx) {
    site = ctx.site;
    return K.load("cards");
  }).then(function (data) {
    var id = new URLSearchParams(window.location.search).get("id");
    var cards = data.cards || [];
    var card = cards.filter(function (c) { return c.id === id; })[0];

    if (!card) {
      host.innerHTML =
        '<div class="section"><h1 class="display page-head__title">Not here</h1>' +
        '<p class="lede">That card isn\'t in the catalog — it may have sold and been taken down.</p>' +
        '<p><a class="btn" href="shop.html">Back to the shop</a></p></div>';
      return;
    }

    document.title = card.player + " · " + card.year + " " + card.set;
    render(card);
    renderRelated(card, cards);
  }).catch(function (err) { K.dataError(host, err); });

  function render(card) {
    var available = card.status === "available";
    var promise = site.signedPromise || {};

    var specs = [
      ["Player", K.esc(card.player)],
      ["Team", K.esc(card.team)],
      ["Sport", K.esc(card.sport)],
      ["Year / set", K.esc(card.year + " " + card.set)],
      ["Card no.", K.esc(card.cardNumber || "—")],
      ["Parallel", K.esc(card.parallel || "Base")],
      [card.graded ? "Grade" : "Condition", K.esc(K.card.gradeLabel(card))],
      ["Status", K.esc(String(card.status || "").replace(/^./, function (ch) { return ch.toUpperCase(); }))]
    ].map(function (row) {
      return "<div><dt>" + row[0] + "</dt><dd>" + row[1] + "</dd></div>";
    }).join("");

    var action = available
      ? '<button class="btn btn--block" type="button" data-add>Add to cart &middot; ' + K.money(card.price) + "</button>"
      : '<button class="btn btn--block" type="button" disabled>' +
        (card.status === "reserved" ? "Reserved" : "Sold") + "</button>";

    host.innerHTML =
      '<div class="product">' +
        '<div class="product__media">' +
          K.frame(card.photoFront, K.card.altText(card), card.player + " front") +
          K.frame(card.photoBack, K.card.backAltText(card), card.player + " back") +
        "</div>" +
        "<div>" +
          '<div class="flex-row" style="margin-bottom:.75rem">' + statusChips(card) + "</div>" +
          '<h1 class="display product__title">' + K.esc(card.player) + "</h1>" +
          '<p class="product__team">' + K.esc(card.team) + " &middot; " + K.esc(card.sport) + "</p>" +
          (card.notes ? '<p class="lede" style="margin-top:1rem">' + K.copy(card.notes, "a line about this card") + "</p>" : "") +
          '<dl class="spec-table">' + specs + "</dl>" +
          '<p class="product__price">' + K.money(card.price) + "</p>" +
          '<p class="label" style="margin:.35rem 0 1rem">' + K.esc(shippingLine()) + "</p>" +
          action +
          '<p class="muted" style="font-family:var(--narrow);font-size:.85rem;margin-top:.75rem">' +
            'Cart and checkout work end to end; the payment step is not wired up yet.' +
          "</p>" +
          '<div class="signed-note" style="margin-top:1.25rem">' +
            '<p class="signed-note__head">Signed, ' + K.esc(promise.signature || "Keely") + "</p>" +
            "<p>" + K.copy(promise.long, "the longer version of the signed-card promise") + "</p>" +
          "</div>" +
        "</div>" +
      "</div>";

    var addButton = K.qs("[data-add]", host);
    if (addButton) {
      addButton.addEventListener("click", function () {
        if (K.cart.has("card", card.id)) {
          K.toast("Already in your cart — there's only one of these.");
          return;
        }
        var result = K.cart.add({
          kind: "card",
          id: card.id,
          title: card.player,
          subtitle: card.year + " " + card.set + (card.parallel && card.parallel !== "Base" ? " " + card.parallel : ""),
          price: card.price,
          max: 1,
          href: "product.html?id=" + encodeURIComponent(card.id),
          photo: card.photoFront,
          meta: K.card.gradeLabel(card)
        });
        K.toast(result.ok ? "Added — " + card.player : "Only one of these exists.");
      });
    }
  }

  function statusChips(card) {
    var chips = [];
    if (card.graded) chips.push('<span class="chip chip--foil">' + K.esc((card.grader || "") + " " + (card.grade || "")).trim() + "</span>");
    else chips.push('<span class="chip">Raw &middot; ' + K.esc(card.condition || "Ungraded") + "</span>");
    if (card.status === "sold") chips.push('<span class="chip chip--sold">Sold</span>');
    if (card.status === "reserved") chips.push('<span class="chip chip--reserved">Reserved</span>');
    chips.push('<span class="chip">Listed ' + K.fmtDate(card.addedOn, { month: "short", day: "numeric" }) + "</span>");
    return chips.join("");
  }

  function shippingLine() {
    var rules = (site.shipping || {});
    if (rules.freeOver != null && rules.domesticFlat != null) {
      return "Shipping " + K.money(rules.domesticFlat) + " · free over " + K.money(rules.freeOver);
    }
    return rules.note || "";
  }

  function renderRelated(card, cards) {
    var related = cards.filter(function (other) {
      return other.id !== card.id && other.status === "available" && other.sport === card.sport;
    }).slice(0, 3);
    if (!related.length) return;
    K.qs("[data-related-wrap]").hidden = false;
    var grid = K.qs("[data-related]");
    grid.innerHTML = related.map(K.card.pocket).join("");
    K.initTilt(grid);
  }
})();
