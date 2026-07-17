/* The RV Brand Reliability Guide - funnel wiring (front-end only).
   Flow:  index (opt-in, free)  →  thank-you (tripwire $12)  →  guide (one-click upsell)  →  success (delivery)
   All state lives in localStorage so the flow survives reloads and the honest
   48h countdown stays anchored to the visitor's first visit.
   PAYMENT LINKS: each tier's `pay` is a Stripe payment link. While a link is
   empty the buy path saves the intent and routes to success.html in waitlist
   mode instead of navigating nowhere. Drop the real links in TIERS below. */
(function () {
  var LS = window.localStorage;
  var STATE_KEY = 'rvr_funnel_v1';

  function load() {
    try { return JSON.parse(LS.getItem(STATE_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function save(s) { try { LS.setItem(STATE_KEY, JSON.stringify(s)); } catch (e) {} }
  function set(patch) { var s = load(); for (var k in patch) s[k] = patch[k]; save(s); return s; }

  function go(url) { window.location.href = url; }
  function isEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((v || '').trim()); }

  // ---- LEAD CAPTURE: ship every captured email + intent to the inbox.
  // formsubmit.co relay; fire-and-forget so it never blocks the visitor.
  var LEAD_ENDPOINT = 'https://formsubmit.co/ajax/2ce265ece480213995547fc74277e2db';
  function sendLead(kind, extra) {
    try {
      var s = load();
      var body = {
        _subject: 'RV Guide lead: ' + kind,
        kind: kind,
        email: s.email || (extra && extra.email) || '',
        page: location.pathname,
        state: JSON.stringify(s)
      };
      if (extra) for (var k in extra) body[k] = extra[k];
      fetch(LEAD_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(body),
        keepalive: true
      }).catch(function () {});
    } catch (e) {}
  }

  // ---- PRODUCTS: the 3-tier ladder. pay = Stripe payment link (empty = waitlist mode) ----
  var TIERS = {
    one:      { name: 'One Segment Guide',                       price: 12, pay: '' },
    complete: { name: 'The Complete RV Brand Reliability Guide', price: 27, pay: '' },
    system:   { name: "The RV Buyer's Protection System",        price: 97, pay: '' }
  };
  function money(n) { return '$' + (n % 1 ? n.toFixed(2) : n); }

  // Send the visitor to Stripe when the tier has a live link; otherwise save
  // the intent and land on success.html in waitlist mode.
  function toPayment(tierKey) {
    var t = TIERS[tierKey];
    var em = (load().email || '').trim();
    if (t && t.pay) {
      window.location.href = t.pay + (em ? '?prefilled_email=' + encodeURIComponent(em) : '');
    } else {
      set({ waitlist: tierKey, waitlist_at: Date.now() });
      sendLead('waitlist-' + tierKey, { tier: t ? t.name : tierKey });
      go('success.html');
    }
  }

  // ---- OPT-IN (index.html): capture email → tripwire ----
  function wireOptin() {
    var forms = document.querySelectorAll('form.optin');
    forms.forEach(function (f) {
      // an opt-in form has an email input but no checkout button
      var email = f.querySelector('input[type=email]');
      var checkout = f.querySelector('[data-checkout], [data-buy]');
      if (!email || checkout) return;
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!isEmail(email.value)) {
          email.focus();
          email.setCustomValidity('Enter a valid email');
          email.reportValidity();
          return;
        }
        set({ email: email.value.trim(), subscribed_at: Date.now() });
        sendLead('checklist-optin', { email: email.value.trim() });
        go('thank-you.html');
      });
    });
  }

  // ---- TRIPWIRE (thank-you.html): $12 buy → payment; skip → success ----
  function wireTripwire() {
    var buy = document.querySelector('[data-buy=tripwire]');
    var skip = document.querySelector('[data-skip=tripwire]');
    if (buy) buy.addEventListener('click', function (e) {
      e.preventDefault();
      set({ tripwire: 'intent', tripwire_at: Date.now() });
      toPayment('one');
    });
    if (skip) skip.addEventListener('click', function (e) {
      e.preventDefault();
      set({ tripwire: 'declined' });
      go('success.html');
    });
  }

  // ---- UPSELL (guide.html): pick a tier → payment; decline → success ----
  function wireUpsell() {
    var buttons = document.querySelectorAll('[data-upsell]');
    buttons.forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.preventDefault();
        var k = b.getAttribute('data-upsell');
        set({ upsell: k, upsell_at: Date.now() });
        if (TIERS[k]) toPayment(k);
        else go('success.html');
      });
    });
    var decline = document.querySelector('[data-upsell-decline]');
    if (decline) decline.addEventListener('click', function (e) {
      e.preventDefault();
      set({ upsell: 'declined' });
      go('success.html');
    });
  }

  // ---- STORE (index.html): add a tier to the cart → checkout ----
  function wireProducts() {
    document.querySelectorAll('[data-add]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.preventDefault();
        set({ cart: b.getAttribute('data-add'), cart_at: Date.now() });
        go('checkout.html');
      });
    });
  }

  // ---- CHECKOUT (checkout.html): render cart, take email → payment ----
  function wireCheckout() {
    var cartEl = document.getElementById('cart');
    if (!cartEl) return;
    var s = load();
    if (!s.cart || !TIERS[s.cart]) { go('index.html#pricing'); return; }

    function render() {
      var t = TIERS[s.cart];
      cartEl.innerHTML =
        '<div class="cartline"><span class="nm">' + t.name + '</span><span>' + money(t.price) + '</span></div>';
      var totEl = document.getElementById('total');
      if (totEl) totEl.textContent = money(t.price);
      var swap = document.getElementById('swap');
      if (swap) {
        var others = Object.keys(TIERS).filter(function (k) { return k !== s.cart; });
        swap.innerHTML = 'Change your pick: ' + others.map(function (k) {
          return '<a href="#" data-swap="' + k + '">' + TIERS[k].name + ' (' + money(TIERS[k].price) + ')</a>';
        }).join(' · ');
        swap.querySelectorAll('[data-swap]').forEach(function (a) {
          a.addEventListener('click', function (e) {
            e.preventDefault();
            s = set({ cart: a.getAttribute('data-swap') });
            render();
          });
        });
      }
    }
    render();

    var email = document.getElementById('email');
    if (email && s.email) email.value = s.email;
    var buy = document.querySelector('[data-checkout]');
    if (buy) buy.addEventListener('click', function (e) {
      e.preventDefault();
      if (email && email.value && !isEmail(email.value)) {
        email.focus(); email.setCustomValidity('Enter a valid email'); email.reportValidity();
        return;
      }
      if (email && email.value) set({ email: email.value.trim() });
      set({ purchase_intent: s.cart, purchase_intent_at: Date.now() });
      toPayment(s.cart);
    });
  }

  // ---- SUCCESS (success.html): reflect what they actually did ----
  function renderSuccess() {
    var root = document.getElementById('success-summary');
    if (!root) return;
    var s = load();
    var lines = [];
    lines.push('Your free Walk-Away Checklist is ready: <a href="list.html"><strong>read it right now</strong></a>.' + (s.email ? ' We saved <strong>' + esc(s.email) + '</strong> for guide updates.' : ''));
    if (s.waitlist && TIERS[s.waitlist]) {
      lines.push(TIERS[s.waitlist].name + ': <strong>your spot is saved</strong>. Checkout opens shortly and your email gets first access at today’s price.');
    }
    root.innerHTML = lines.map(function (l) {
      return '<li><span class="ok">✓</span><span>' + l + '</span></li>';
    }).join('');
    var email = document.getElementById('success-email');
    if (email && s.email) email.textContent = s.email;
  }
  function esc(v) { return String(v).replace(/[<>&"]/g, function (c) {
    return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]; }); }

  // ---- RECENT-PURCHASE TOASTS: real sales only. Feed = data/purchases.json,
  // which holds actual Stripe charges (state + tier + timestamp). Empty feed =
  // no toasts, ever. Never add fabricated entries: fake purchase notifications
  // violate the FTC rule on deceptive social proof.
  function wirePurchaseToasts() {
    var MAX_AGE = 7 * 86400000, MAX_SHOW = 4;
    fetch('data/purchases.json', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var items = (d && d.purchases || []).filter(function (p) {
          return p && p.state && TIERS[p.tier] && (Date.now() - Date.parse(p.at)) < MAX_AGE;
        }).sort(function (a, b) { return Date.parse(b.at) - Date.parse(a.at); }).slice(0, MAX_SHOW);
        if (!items.length) return;

        var el = document.createElement('div');
        el.className = 'ptoast';
        el.hidden = true;
        el.innerHTML = '<span class="pt-dot"></span><span class="pt-txt"></span>';
        document.body.appendChild(el);
        var txt = el.querySelector('.pt-txt');

        function ago(t) {
          var m = Math.max(1, Math.round((Date.now() - Date.parse(t)) / 60000));
          if (m < 60) return m + (m === 1 ? ' minute ago' : ' minutes ago');
          var h = Math.round(m / 60);
          if (h < 24) return h + (h === 1 ? ' hour ago' : ' hours ago');
          var dd = Math.round(h / 24);
          return dd + (dd === 1 ? ' day ago' : ' days ago');
        }
        var i = 0;
        function showNext() {
          if (i >= items.length) return;
          var p = items[i++];
          txt.innerHTML = 'Someone in <b>' + esc(p.state) + '</b> got <b>' + esc(TIERS[p.tier].name) + '</b> · ' + ago(p.at);
          el.hidden = false;
          setTimeout(function () { el.hidden = true; setTimeout(showNext, 14000); }, 8000);
        }
        setTimeout(showNext, 6000);
      })
      .catch(function () {});
  }

  function init() {
    wireOptin();
    wirePurchaseToasts();
    wireProducts();
    wireCheckout();
    wireTripwire();
    wireUpsell();
    renderSuccess();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
