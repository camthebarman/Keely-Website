/* ==========================================================================
   Keely's House of Cards — site.js
   Shared behaviour for every page: data loading, site chrome (header/footer),
   cart state, formatting helpers, and the product-grid tilt.
   No framework, no build step. Page-specific code lives in its own file.
   ========================================================================== */
(function () {
  "use strict";

  /* -- paths ------------------------------------------------------------- */
  /* Pages all sit at the site root, so data paths are plain relatives. */
  var DATA = {
    site: "data/site.json",
    cards: "data/cards.json",
    opens: "data/live-opens.json",
    projections: "data/projections.json",
    baked: "data/baked.json"
  };

  var CART_KEY = "khoc.cart.v1";
  var CHECKOUT_KEY = "khoc.checkout.v1";

  /* -- tiny helpers ------------------------------------------------------ */
  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /* A value that still reads [COPY NEEDED ...] renders as a loud placeholder
     so template-sounding filler can never quietly ship. */
  function isPlaceholder(value) {
    return typeof value === "string" && /^\s*\[copy needed/i.test(value);
  }

  function copy(value, fallbackLabel) {
    if (value == null || value === "") {
      if (!fallbackLabel) return "";
      return '<span class="copy-needed">[COPY NEEDED — ' + esc(fallbackLabel) + "]</span>";
    }
    if (isPlaceholder(value)) return '<span class="copy-needed">' + esc(value) + "</span>";
    return esc(value);
  }

  function money(amount) {
    if (amount == null || isNaN(amount)) return "—";
    return "$" + Number(amount).toLocaleString("en-US", {
      minimumFractionDigits: Number(amount) % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2
    });
  }

  /* Date strings in the JSON are plain calendar dates — parse them as local
     days so nothing shifts a day backwards in western timezones. */
  function parseDate(value) {
    if (!value) return null;
    var datePart = String(value).split("T")[0];
    var bits = datePart.split("-").map(Number);
    if (bits.length !== 3 || bits.some(isNaN)) return null;
    var timePart = String(value).split("T")[1];
    var h = 0, m = 0;
    if (timePart) {
      var tb = timePart.split(":").map(Number);
      h = tb[0] || 0;
      m = tb[1] || 0;
    }
    return new Date(bits[0], bits[1] - 1, bits[2], h, m);
  }

  /* "7:30 PM" -> {h:19, m:30} */
  function parseClock(value) {
    var match = /^\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*$/i.exec(value || "");
    if (!match) return { h: 19, m: 0 };
    var h = Number(match[1]);
    var m = Number(match[2] || 0);
    var suffix = (match[3] || "").toLowerCase();
    if (suffix === "pm" && h < 12) h += 12;
    if (suffix === "am" && h === 12) h = 0;
    return { h: h, m: m };
  }

  function fmtDate(value, opts) {
    var d = parseDate(value);
    if (!d) return "—";
    return d.toLocaleDateString("en-US", opts || { month: "short", day: "numeric", year: "numeric" });
  }

  function fmtDateTime(value) {
    var d = parseDate(value);
    if (!d) return "—";
    return d.toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
    });
  }

  function startOfToday() {
    var now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  function daysUntil(value) {
    var d = parseDate(value);
    if (!d) return null;
    var day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return Math.round((day - startOfToday()) / 86400000);
  }

  function el(id) { return document.getElementById(id); }
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /* -- data loading ------------------------------------------------------ */
  var cache = {};

  function load(key) {
    var path = DATA[key] || key;
    if (cache[path]) return cache[path];
    cache[path] = fetch(path, { cache: "no-cache" })
      .then(function (res) {
        if (!res.ok) throw new Error("Could not load " + path + " (" + res.status + ")");
        return res.json();
      })
      .catch(function (err) {
        delete cache[path];
        throw err;
      });
    return cache[path];
  }

  /* A readable failure beats a blank page. Most likely cause on a phone is
     opening the files directly instead of through a web server. */
  function dataError(target, err) {
    if (!target) return;
    target.innerHTML =
      '<div class="notice notice--error"><strong>Couldn\'t load the data file.</strong> ' +
      esc(err && err.message ? err.message : "Unknown error") +
      " — if you opened this page as a local file, serve it over http instead " +
      "(the site needs to fetch the JSON in <code>data/</code>).</div>";
    if (window.console) console.error(err);
  }

  /* -- photo frames ------------------------------------------------------ */
  /* Empty frames are drawn at the right proportion and labelled. Never fake
     inventory with stock imagery. */
  function frame(src, alt, noteLabel) {
    if (src) {
      return '<div class="frame"><img src="' + esc(src) + '" alt="' + esc(alt) + '" loading="lazy" decoding="async"></div>';
    }
    return '<div class="frame frame--empty" role="img" aria-label="Photo not added yet: ' + esc(alt) + '">' +
      '<p class="frame__note">[Photo needed]<br>' + esc(noteLabel || alt) + "</p></div>";
  }

  /* -- cart -------------------------------------------------------------- */
  /* localStorage is the whole backend for now. Enough for a stubbed flow. */
  var cart = {
    read: function () {
      try {
        var raw = window.localStorage.getItem(CART_KEY);
        var parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
      } catch (err) {
        return [];
      }
    },
    write: function (items) {
      try {
        window.localStorage.setItem(CART_KEY, JSON.stringify(items));
      } catch (err) {
        /* Private mode or a full quota — the page still works, it just forgets. */
      }
      document.dispatchEvent(new CustomEvent("khoc:cartchange", { detail: { items: items } }));
      return items;
    },
    add: function (item) {
      var items = cart.read();
      var existing = null;
      for (var i = 0; i < items.length; i++) {
        if (items[i].kind === item.kind && items[i].id === item.id) { existing = items[i]; break; }
      }
      var max = item.max || 1;
      if (existing) {
        if (existing.qty >= max) return { ok: false, reason: "max", items: items };
        existing.qty += 1;
        existing.price = item.price;
      } else {
        items.push({
          kind: item.kind,
          id: item.id,
          title: item.title,
          subtitle: item.subtitle || "",
          price: item.price,
          qty: 1,
          max: max,
          href: item.href || "",
          photo: item.photo || null,
          meta: item.meta || ""
        });
      }
      cart.write(items);
      return { ok: true, items: items };
    },
    setQty: function (kind, id, qty) {
      var items = cart.read().map(function (line) {
        if (line.kind === kind && line.id === id) {
          line.qty = Math.max(1, Math.min(Number(qty) || 1, line.max || 1));
        }
        return line;
      });
      return cart.write(items);
    },
    remove: function (kind, id) {
      return cart.write(cart.read().filter(function (line) {
        return !(line.kind === kind && line.id === id);
      }));
    },
    clear: function () { return cart.write([]); },
    count: function () {
      return cart.read().reduce(function (sum, line) { return sum + (line.qty || 1); }, 0);
    },
    subtotal: function () {
      return cart.read().reduce(function (sum, line) {
        return sum + (Number(line.price) || 0) * (line.qty || 1);
      }, 0);
    },
    has: function (kind, id) {
      return cart.read().some(function (line) { return line.kind === kind && line.id === id; });
    }
  };

  function shippingFor(subtotal, siteData) {
    var rules = (siteData && siteData.shipping) || {};
    if (!subtotal) return 0;
    if (rules.freeOver != null && subtotal >= rules.freeOver) return 0;
    return rules.domesticFlat != null ? rules.domesticFlat : 0;
  }

  /* -- toast ------------------------------------------------------------- */
  var toastNode, toastTimer;

  function toast(message) {
    if (!toastNode) {
      toastNode = document.createElement("div");
      toastNode.className = "toast";
      toastNode.setAttribute("role", "status");
      toastNode.setAttribute("aria-live", "polite");
      document.body.appendChild(toastNode);
    }
    toastNode.textContent = message;
    toastNode.setAttribute("data-visible", "true");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toastNode.setAttribute("data-visible", "false");
    }, 3200);
  }

  /* -- next pack open ---------------------------------------------------- */
  function nextOpen(opensData) {
    if (!opensData || !Array.isArray(opensData.opens)) return null;
    var today = startOfToday();
    var upcoming = opensData.opens
      .filter(function (open) {
        var d = parseDate(open.date);
        return d && d >= today;
      })
      .sort(function (a, b) { return parseDate(a.date) - parseDate(b.date); });
    return upcoming[0] || null;
  }

  function openDateTime(open, schedule) {
    var d = parseDate(open.date);
    if (!d) return null;
    var clock = parseClock(open.time || (schedule && schedule.time));
    d.setHours(clock.h, clock.m, 0, 0);
    return d;
  }

  /* -- site chrome ------------------------------------------------------- */
  var NAV = [
    { href: "index.html", label: "Home", num: "00" },
    { href: "shop.html", label: "Shop", num: "01" },
    { href: "live-opens.html", label: "Live Pack Opens", num: "02" },
    { href: "projections.html", label: "Projections by Vibes", num: "03" },
    { href: "baked.html", label: "Baked", num: "04" }
  ];

  function currentPage() {
    var body = document.body;
    return (body && body.getAttribute("data-page")) || "index.html";
  }

  function renderHeader(siteData, opensData) {
    var host = qs("[data-site-header]");
    if (!host) return;
    var page = currentPage();
    var status = headerStatus(siteData, opensData);

    var links = NAV.map(function (item) {
      var current = item.href === page ? ' aria-current="page"' : "";
      return '<li><a class="nav__link" href="' + item.href + '"' + current + ">" + esc(item.label) + "</a></li>";
    }).join("");

    var drawer = NAV.map(function (item) {
      var current = item.href === page ? ' aria-current="page"' : "";
      return '<a href="' + item.href + '"' + current + "><span>" + item.num + "</span>" + esc(item.label) + "</a>";
    }).join("") + '<a href="cart.html"><span>—</span>Cart</a>';

    host.innerHTML =
      '<div class="topbar"><div class="shell topbar__inner">' +
        '<span class="topbar__status' + (status.live ? " topbar__status--live" : "") + '">' +
          (status.live ? '<span class="dot dot--pulse"></span>' : "") + esc(status.text) +
        "</span>" +
        '<span class="topbar__signed">' + esc((siteData.signedPromise && siteData.signedPromise.short) || "") + "</span>" +
      "</div></div>" +
      '<div class="masthead">' +
        '<div class="shell masthead__inner">' +
          '<a class="wordmark" href="index.html">' +
            '<span class="wordmark__1">' + esc(siteData.brand.wordmarkLine1) + "</span>" +
            '<span class="wordmark__2">' + esc(siteData.brand.wordmarkLine2) + "</span>" +
          "</a>" +
          '<nav class="nav" aria-label="Main">' +
            '<ul class="nav__list">' + links + "</ul>" +
            '<a class="nav__cart" href="cart.html" data-cart-link data-empty="true">Cart' +
              '<span class="nav__cart-count" data-cart-count>0</span>' +
              '<span class="visually-hidden" data-cart-label>0 items in cart</span>' +
            "</a>" +
            '<button class="nav__toggle" type="button" data-nav-toggle aria-expanded="false" aria-controls="nav-drawer">' +
              '<span class="nav__toggle-bars" aria-hidden="true"><span></span><span></span><span></span></span>Menu' +
            "</button>" +
          "</nav>" +
        "</div>" +
        '<div class="nav__drawer" id="nav-drawer" data-open="false">' + drawer + "</div>" +
      "</div>";

    var toggle = qs("[data-nav-toggle]", host);
    var panel = el("nav-drawer");
    if (toggle && panel) {
      toggle.addEventListener("click", function () {
        var open = panel.getAttribute("data-open") === "true";
        panel.setAttribute("data-open", open ? "false" : "true");
        toggle.setAttribute("aria-expanded", open ? "false" : "true");
      });
    }
    syncCartUI();
  }

  function headerStatus(siteData, opensData) {
    var schedule = (opensData && opensData.schedule) || {};
    var open = nextOpen(opensData);
    if (!open) {
      return { text: (schedule.weekday || "Tuesday") + " pack opens — next date coming", live: false };
    }
    var days = daysUntil(open.date);
    var when = openDateTime(open, schedule);
    var now = new Date();
    if (days === 0) {
      var liveWindow = when && now >= new Date(when.getTime() - 15 * 60000) && now <= new Date(when.getTime() + 150 * 60000);
      if (liveWindow) return { text: "Live now — pack open in progress", live: true };
      return { text: "Pack open tonight, " + (open.time || schedule.time || "") + " " + (open.timezone || schedule.timezone || ""), live: true };
    }
    if (days === 1) return { text: "Next pack open: tomorrow, " + (open.time || schedule.time || ""), live: false };
    return {
      text: "Next pack open: " + fmtDate(open.date, { weekday: "short", month: "short", day: "numeric" }) +
        " · " + (open.time || schedule.time || "") + " " + (open.timezone || schedule.timezone || ""),
      live: false
    };
  }

  function renderFooter(siteData) {
    var host = qs("[data-site-footer]");
    if (!host) return;
    var promise = siteData.signedPromise || {};
    var social = (siteData.social || []).map(function (item) {
      return '<li><a href="' + esc(item.url) + '" rel="me noopener">' +
        '<span class="label">' + esc(item.platform) + "</span>" + esc(item.handle) + "</a></li>";
    }).join("");

    var pages = NAV.slice(1).map(function (item) {
      return '<li><a href="' + item.href + '">' + esc(item.label) + "</a></li>";
    }).join("");

    host.innerHTML =
      '<div class="site-footer__promise"><div class="shell">' +
        '<div class="promise">' +
          '<p class="label" style="color:rgba(242,236,223,.55)">The one thing every order has in common</p>' +
          '<p class="promise__line">' + esc(promise.short || "") + "</p>" +
          "<p class=\"promise__body\">" + copy(promise.long, "the longer version of the signed-card promise") + "</p>" +
          '<p class="promise__sig" aria-hidden="true">' + esc(promise.signature || "Keely") + "</p>" +
        "</div>" +
      "</div></div>" +
      '<div class="shell site-footer__cols">' +
        "<div><h2>Find her</h2><ul class=\"social-list\">" + social + "</ul></div>" +
        "<div><h2>Pages</h2><ul>" + pages + '<li><a href="cart.html">Cart &amp; checkout</a></li></ul></div>' +
        "<div><h2>Contact</h2><ul><li><a href=\"mailto:" + esc((siteData.contact || {}).email) + '">' +
          esc((siteData.contact || {}).emailLabel || (siteData.contact || {}).email) + "</a></li></ul>" +
          "<p class=\"promise__body\" style=\"margin-top:.6rem;font-size:.9rem\">" + copy((siteData.contact || {}).note, "reply times / anything else before emailing") + "</p>" +
        "</div>" +
      "</div>" +
      '<div class="shell site-footer__base">' +
        "<span>" + esc(siteData.brand.name) + " · Est. " + esc(siteData.brand.established) + "</span>" +
        "<span>Shipping: " + esc((siteData.shipping || {}).note || "") + "</span>" +
      "</div>";
  }

  function renderDemoStrip(siteData) {
    if (!siteData.demoMode) return;
    var host = qs("[data-demo-strip]");
    if (!host) return;
    host.innerHTML = '<div class="demo-strip">Sample data — card listings, dates and takes are placeholders. Edit the files in <code>data/</code>, then set <code>demoMode</code> to false in <code>data/site.json</code>.</div>';
  }

  function syncCartUI() {
    var count = cart.count();
    qsa("[data-cart-count]").forEach(function (node) { node.textContent = String(count); });
    qsa("[data-cart-label]").forEach(function (node) {
      node.textContent = count === 1 ? "1 item in cart" : count + " items in cart";
    });
    qsa("[data-cart-link]").forEach(function (node) {
      node.setAttribute("data-empty", count ? "false" : "true");
    });
  }

  document.addEventListener("khoc:cartchange", syncCartUI);
  window.addEventListener("storage", function (event) {
    if (event.key === CART_KEY) syncCartUI();
  });

  /* -- product-grid tilt ------------------------------------------------- */
  /* Deliberately limited to .pocket elements in the catalogue grid, subtle,
     and skipped for touch input and reduced-motion users. */
  function initTilt(root) {
    if (!window.matchMedia) return;
    if (!window.matchMedia("(hover: hover)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    qsa(".pocket", root || document).forEach(function (node) {
      if (node.dataset.tiltBound === "true") return;
      node.dataset.tiltBound = "true";
      node.addEventListener("pointermove", function (event) {
        var box = node.getBoundingClientRect();
        var x = (event.clientX - box.left) / box.width - 0.5;
        var y = (event.clientY - box.top) / box.height - 0.5;
        node.style.setProperty("--tilt-y", (x * 5).toFixed(2) + "deg");
        node.style.setProperty("--tilt-x", (-y * 5).toFixed(2) + "deg");
      });
      node.addEventListener("pointerleave", function () {
        node.style.setProperty("--tilt-y", "0deg");
        node.style.setProperty("--tilt-x", "0deg");
      });
    });
  }

  /* -- boot -------------------------------------------------------------- */
  function chrome() {
    return Promise.all([load("site"), load("opens").catch(function () { return null; })])
      .then(function (results) {
        var siteData = results[0];
        var opensData = results[1];
        renderHeader(siteData, opensData);
        renderFooter(siteData);
        renderDemoStrip(siteData);
        qsa("[data-brand-name]").forEach(function (node) { node.textContent = siteData.brand.name; });
        if (document.title.indexOf(siteData.brand.name) === -1) {
          document.title = document.title + " · " + siteData.brand.name;
        }
        return { site: siteData, opens: opensData };
      });
  }

  /* Public surface used by the per-page scripts. */
  window.KHOC = {
    DATA: DATA,
    CART_KEY: CART_KEY,
    CHECKOUT_KEY: CHECKOUT_KEY,
    load: load,
    chrome: chrome,
    cart: cart,
    shippingFor: shippingFor,
    esc: esc,
    copy: copy,
    isPlaceholder: isPlaceholder,
    money: money,
    frame: frame,
    parseDate: parseDate,
    parseClock: parseClock,
    fmtDate: fmtDate,
    fmtDateTime: fmtDateTime,
    daysUntil: daysUntil,
    nextOpen: nextOpen,
    openDateTime: openDateTime,
    dataError: dataError,
    toast: toast,
    initTilt: initTilt,
    syncCartUI: syncCartUI,
    el: el,
    qs: qs,
    qsa: qsa
  };
})();

/* ==========================================================================
   Card presentation helpers. Shared by the home page, the shop grid and the
   product page so a card looks and reads the same everywhere.
   ========================================================================== */
(function (KHOC) {
  "use strict";

  var esc = KHOC.esc;

  function altText(card) {
    var bits = [card.year, card.set, card.player];
    if (card.parallel && card.parallel !== "Base") bits.push(card.parallel);
    if (card.cardNumber) bits.push(card.cardNumber);
    return bits.filter(Boolean).join(" ") + " card, front";
  }

  function backAltText(card) {
    return altText(card).replace(/, front$/, ", back");
  }

  /* The condition/grade line — graded slabs say who graded it, raw cards
     say what shape they're in. */
  function gradeLabel(card) {
    if (card.graded) return (card.grader || "Graded") + " " + (card.grade || "");
    return card.condition || "Ungraded";
  }

  function statLine(card) {
    var bits = [
      card.year + " " + card.set,
      card.parallel && card.parallel !== "Base" ? card.parallel : null,
      card.cardNumber,
      gradeLabel(card)
    ].filter(Boolean);
    return '<p class="statline">' + bits.map(function (bit) {
      return "<span>" + esc(bit) + "</span>";
    }).join("") + "</p>";
  }

  function flags(card) {
    var out = [];
    if (card.graded) {
      out.push('<span class="chip chip--foil">' + esc((card.grader || "") + " " + (card.grade || "")).trim() + "</span>");
    }
    if (card.status === "sold") out.push('<span class="chip chip--sold">Sold</span>');
    if (card.status === "reserved") out.push('<span class="chip chip--reserved">Reserved</span>');
    return out.length ? '<div class="pocket__flags">' + out.join("") + "</div>" : "";
  }

  /* One pocket in the binder sheet. */
  function pocket(card) {
    var sold = card.status !== "available";
    return '<a class="pocket" href="product.html?id=' + encodeURIComponent(card.id) + '">' +
      '<div class="pocket__media">' + flags(card) +
        KHOC.frame(card.photoFront, altText(card), card.player + " front") +
      "</div>" +
      '<div class="pocket__body">' +
        '<h3 class="pocket__player">' + esc(card.player) + "</h3>" +
        '<p class="statline"><span>' + esc(card.team) + "</span><span>" + esc(card.sport) + "</span></p>" +
        statLine(card) +
        '<div class="pocket__foot">' +
          '<span class="price' + (sold ? " price--struck" : "") + '">' + KHOC.money(card.price) + "</span>" +
          '<span class="label">' + (sold ? esc(card.status) : "View") + "</span>" +
        "</div>" +
      "</div></a>";
  }

  KHOC.card = {
    altText: altText,
    backAltText: backAltText,
    gradeLabel: gradeLabel,
    statLine: statLine,
    flags: flags,
    pocket: pocket
  };
})(window.KHOC);
