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
    lines.push('Free Walk-Away Checklist, sent to <strong>' + (s.email ? esc(s.email) : 'your inbox') + '</strong>. <a href="list.html">Or read it right now</a>.');
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

  function init() {
    wireOptin();
    wireProducts();
    wireCheckout();
    wireTripwire();
    wireUpsell();
    renderSuccess();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
