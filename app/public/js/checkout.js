function showTab(tab) {
  document.getElementById('payment-stripe').style.display = tab === 'stripe' ? 'block' : 'none';
  document.getElementById('payment-paypal').style.display = tab === 'paypal' ? 'block' : 'none';
  document.getElementById('tab-stripe').className = 'btn btn-sm ' + (tab === 'stripe' ? 'btn-primary' : 'btn-secondary');
  var pt = document.getElementById('tab-paypal');
  if (pt) pt.className = 'btn btn-sm ' + (tab === 'paypal' ? 'btn-primary' : 'btn-secondary');
}

// ── Stripe ──────────────────────────────────────────────────────────────────
if (typeof STRIPE_KEY !== 'undefined' && STRIPE_KEY) {
  var stripe;
  var elements;

  fetch('/prenota/checkout/' + BOOKING_ID + '/stripe', { method: 'POST' })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data.error) {
        var errEl = document.getElementById('stripe-error');
        if (errEl) { errEl.textContent = data.error; errEl.style.display = 'block'; }
        return;
      }
      stripe = Stripe(data.publishableKey);
      elements = stripe.elements({ clientSecret: data.clientSecret });
      var paymentEl = elements.create('payment');
      paymentEl.mount('#stripe-payment-element');
    })
    .catch(function (err) { console.error('Stripe init error:', err); });

  var stripeBtn = document.getElementById('stripe-submit');
  if (stripeBtn) {
    stripeBtn.addEventListener('click', function () {
      if (!stripe || !elements) return;
      var btn = this;
      btn.disabled = true;
      btn.textContent = 'Elaborazione...';
      var errEl = document.getElementById('stripe-error');
      if (errEl) errEl.style.display = 'none';

      stripe.confirmPayment({
        elements: elements,
        confirmParams: {
          return_url: window.location.origin + '/prenota/checkout/' + BOOKING_ID + '/stripe/return',
        },
      }).then(function (result) {
        if (result.error) {
          if (errEl) { errEl.textContent = result.error.message; errEl.style.display = 'block'; }
          btn.disabled = false;
          btn.textContent = 'Paga €' + BOOKING_AMOUNT;
        }
        // On success Stripe redirects automatically via return_url
      });
    });
  }
}

// ── PayPal ──────────────────────────────────────────────────────────────────
if (typeof PAYPAL_CLIENT_ID !== 'undefined' && PAYPAL_CLIENT_ID && typeof paypal !== 'undefined') {
  paypal.Buttons({
    createOrder: function () {
      return fetch('/prenota/checkout/' + BOOKING_ID + '/paypal', { method: 'POST' })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.error) throw new Error(data.error);
          return data.orderID;
        });
    },
    onApprove: function (data) {
      return fetch('/prenota/checkout/' + BOOKING_ID + '/paypal/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderID: data.orderID }),
      })
        .then(function (r) { return r.json(); })
        .then(function (result) {
          if (result.success) {
            window.location.href = '/prenota/conferma?bookingId=' + result.bookingId;
          } else {
            alert('Errore PayPal: ' + (result.error || 'Pagamento non completato'));
          }
        });
    },
    onError: function (err) {
      console.error('PayPal error:', err);
      alert('Errore durante il pagamento PayPal.');
    },
  }).render('#paypal-button-container');
}
