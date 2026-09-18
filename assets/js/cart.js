/* Cart and checkout. One flow for both shop singles and pack-open spots.
   Everything lives in localStorage — there is no backend yet, and the payment
   step is deliberately stubbed (see startPayment at the bottom of this file). */
(function () {
  "use strict";
  var K = window.KHOC;
  var site;
  var form = K.qs("[data-checkout-form]");
  var statusNode = K.qs("[data-form-status]");

  K.chrome().then(function (ctx) {
    site = ctx.site;
    var promise = site.signedPromise || {};
    K.qs("[data-signed-head]").textContent = "Signed, " + (promise.signature || "Keely");
    K.qs("[data-signed-body]").innerHTML = K.copy(promise.short, "the signed-card promise");
    restoreDetails();
    render();
  }).catch(function (err) { K.dataError(K.qs("[data-lines]"), err); });

  document.addEventListener("khoc:cartchange", render);

  /* -- lines and summary ------------------------------------------------- */
  function render() {
    var items = K.cart.read();
    var lines = K.qs("[data-lines]");

    if (!items.length) {
      lines.innerHTML = '<p class="empty-state">Nothing in the cart yet. ' +
        '<a href="shop.html">Browse the singles</a> or <a href="live-opens.html">buy into Tuesday</a>.</p>';
      K.qs("[data-ship-section]").hidden = true;
    } else {
      K.qs("[data-ship-section]").hidden = false;
      lines.innerHTML = items.map(lineItem).join("");
      bindLineControls();
    }

    var subtotal = K.cart.subtotal();
    var shipping = K.shippingFor(subtotal, site);
    var hasPhysical = items.some(function (line) { return line.kind === "card"; });
    var shippingDue = hasPhysical ? shipping : 0;
    var total = subtotal + shippingDue;

    K.qs("[data-summary-rows]").innerHTML =
      row("Items", String(K.cart.count())) +
      row("Subtotal", K.money(subtotal)) +
      row("Shipping", items.length
        ? (shippingDue === 0 ? (hasPhysical ? "Free" : "Ships with your pull") : K.money(shippingDue))
        : "—") +
      row("Signed thank-you card", "Included");

    K.qs("[data-summary-total]").textContent = K.money(total);
    K.qs("[data-submit]").disabled = !items.length;
  }

  function row(label, value) {
    return '<div class="summary__row leader"><dt>' + K.esc(label) + '</dt><span class="leader__fill"></span><dd>' +
      K.esc(value) + "</dd></div>";
  }

  function lineItem(line) {
    var qtyControl = (line.max || 1) > 1
      ? '<label class="visually-hidden" for="qty-' + K.esc(line.id) + '">Quantity of ' + K.esc(line.title) + "</label>" +
        '<input class="line-item__qty" id="qty-' + K.esc(line.id) + '" type="number" min="1" max="' + (line.max || 1) +
        '" value="' + (line.qty || 1) + '" data-qty data-kind="' + K.esc(line.kind) + '" data-id="' + K.esc(line.id) +
        '" style="width:4.5rem;min-height:2.4rem;padding:.3rem .4rem;border:1px solid var(--rule-firm);background:var(--paper)">'
      : '<span class="label">Qty 1</span>';

    var thumb = line.kind === "card"
      ? K.frame(line.photo, line.title + " card", line.title)
      : '<div class="frame frame--empty" role="img" aria-label="Pack open spot"><p class="frame__note">Pack<br>spot</p></div>';

    return '<article class="line-item">' +
      '<div class="line-item__thumb">' + thumb + "</div>" +
      "<div>" +
        '<h3 class="line-item__title">' +
          (line.href ? '<a href="' + K.esc(line.href) + '" style="text-decoration:none">' + K.esc(line.title) + "</a>" : K.esc(line.title)) +
        "</h3>" +
        '<p class="statline">' +
          [line.kind === "spot" ? "Pack open spot" : "Single", line.subtitle, line.meta]
            .filter(Boolean).map(function (bit) { return "<span>" + K.esc(bit) + "</span>"; }).join("") +
        "</p>" +
        '<div class="flex-row" style="margin-top:.4rem">' + qtyControl +
          '<button class="line-item__remove" type="button" data-remove data-kind="' + K.esc(line.kind) +
          '" data-id="' + K.esc(line.id) + '">Remove</button>' +
        "</div>" +
      "</div>" +
      '<div class="line-item__side"><span class="price">' + K.money((line.price || 0) * (line.qty || 1)) + "</span></div>" +
    "</article>";
  }

  function bindLineControls() {
    K.qsa("[data-remove]").forEach(function (button) {
      button.addEventListener("click", function () {
        K.cart.remove(button.getAttribute("data-kind"), button.getAttribute("data-id"));
      });
    });
    K.qsa("[data-qty]").forEach(function (input) {
      input.addEventListener("change", function () {
        K.cart.setQty(input.getAttribute("data-kind"), input.getAttribute("data-id"), input.value);
      });
    });
  }

  K.qs("[data-clear]").addEventListener("click", function () {
    if (!K.cart.count()) return;
    if (window.confirm("Empty the cart?")) {
      K.cart.clear();
      status("");
    }
  });

  /* -- shipping details -------------------------------------------------- */
  var DETAIL_FIELDS = ["name", "email", "address1", "address2", "city", "state", "zip", "notes"];

  function restoreDetails() {
    var saved;
    try {
      saved = JSON.parse(window.localStorage.getItem(K.CHECKOUT_KEY) || "{}");
    } catch (err) { saved = {}; }
    DETAIL_FIELDS.forEach(function (name) {
      if (saved[name] && form.elements[name]) form.elements[name].value = saved[name];
    });
  }

  function saveDetails() {
    var payload = {};
    DETAIL_FIELDS.forEach(function (name) {
      if (form.elements[name]) payload[name] = form.elements[name].value;
    });
    try {
      window.localStorage.setItem(K.CHECKOUT_KEY, JSON.stringify(payload));
    } catch (err) { /* private mode — nothing to do */ }
  }

  form.addEventListener("input", function () {
    window.clearTimeout(form._save);
    form._save = window.setTimeout(saveDetails, 250);
  });

  function validate() {
    var problems = [];
    K.qsa(".field--error", form).forEach(function (node) { node.classList.remove("field--error"); });
    K.qsa("[data-field-error]", form).forEach(function (node) { node.remove(); });

    ["name", "email", "address1", "city", "state", "zip"].forEach(function (name) {
      var field = form.elements[name];
      if (!field) return;
      var value = field.value.trim();
      var message = "";
      if (!value) message = "Required.";
      else if (name === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) message = "That email doesn't look right.";
      else if (name === "zip" && !/^\d{5}(-\d{4})?$/.test(value)) message = "5-digit ZIP, please.";
      if (message) {
        problems.push(name);
        var wrap = field.closest(".field");
        if (wrap) {
          wrap.classList.add("field--error");
          var note = document.createElement("p");
          note.className = "field__error";
          note.setAttribute("data-field-error", "");
          note.textContent = message;
          wrap.appendChild(note);
        }
      }
    });
    return problems;
  }

  function status(message, isError) {
    statusNode.innerHTML = message
      ? '<p class="notice' + (isError ? " notice--error" : "") + '">' + message + "</p>"
      : "";
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var problems = validate();
    if (problems.length) {
      status("Missing " + problems.length + (problems.length === 1 ? " field" : " fields") + " above.", true);
      var first = form.elements[problems[0]];
      if (first) first.focus();
      return;
    }
    saveDetails();
    startPayment(buildOrder());
  });

  /* -- order payload ----------------------------------------------------- */
  function buildOrder() {
    var items = K.cart.read();
    var subtotal = K.cart.subtotal();
    var hasPhysical = items.some(function (line) { return line.kind === "card"; });
    var shipping = hasPhysical ? K.shippingFor(subtotal, site) : 0;
    var details = {};
    DETAIL_FIELDS.forEach(function (name) {
      if (form.elements[name]) details[name] = form.elements[name].value.trim();
    });
    return {
      placedAt: new Date().toISOString(),
      items: items,
      subtotal: subtotal,
      shipping: shipping,
      total: subtotal + shipping,
      customer: details
    };
  }

  /* ======================================================================
     PAYMENT PLACEHOLDER
     ----------------------------------------------------------------------
     Nothing here charges anyone. When a processor gets picked, replace the
     body of startPayment() with the real call and delete the email fallback:

       Stripe  — POST `order` to a serverless function that creates a Checkout
                 Session, then redirect:
                   const { url } = await fetch('/api/checkout', {
                     method: 'POST',
                     headers: { 'Content-Type': 'application/json' },
                     body: JSON.stringify(order)
                   }).then(r => r.json());
                   window.location.assign(url);

       Square  — same shape, using the Payment Links API server-side.

     Both need a server-side piece: the secret key must never ship in this
     file. Netlify Functions or Cloudflare Workers are enough. Until then the
     order gets handed off by email so real orders can still happen.
     ====================================================================== */
  function startPayment(order) {
    var email = (site.contact && site.contact.email) || "";
    var lines = order.items.map(function (line) {
      return "- " + line.title + (line.subtitle ? " (" + line.subtitle + ")" : "") +
        " x" + (line.qty || 1) + " — " + K.money((line.price || 0) * (line.qty || 1));
    }).join("\n");

    var address = [
      order.customer.name,
      order.customer.address1,
      order.customer.address2,
      order.customer.city + ", " + order.customer.state + " " + order.customer.zip
    ].filter(Boolean).join("\n");

    var body = [
      "Order from the website",
      "",
      lines,
      "",
      "Subtotal: " + K.money(order.subtotal),
      "Shipping: " + K.money(order.shipping),
      "Total: " + K.money(order.total),
      "",
      "Ship to:",
      address,
      "",
      "Email: " + order.customer.email
    ].concat(order.customer.notes ? ["Note: " + order.customer.notes] : []).join("\n");

    var subject = "Website order — " + order.customer.name + " — " + K.money(order.total);
    var mailto = "mailto:" + encodeURIComponent(email) +
      "?subject=" + encodeURIComponent(subject) +
      "&body=" + encodeURIComponent(body);

    status(
      "<strong>Payment isn't switched on yet</strong>, so this order goes over by email instead. " +
      '<a href="' + K.esc(mailto) + '">Open it in your email app</a> — everything above is filled in already. ' +
      "Your cart stays here until she confirms it."
    );
    statusNode.scrollIntoView({ block: "nearest", behavior: "smooth" });
    if (window.console) console.info("Order payload ready for a payment processor:", order);
  }
})();
