// Stripe SDK initialization and fee constants

let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  const Stripe = require('stripe');
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  console.log('[Stripe] SDK initialized' + (process.env.STRIPE_SECRET_KEY.startsWith('sk_test') ? ' (TEST mode)' : ' (LIVE mode)'));
} else {
  console.log('[Stripe] No STRIPE_SECRET_KEY — payment features disabled');
}

const STRIPE_FEE = {
  cc_rate: 0.033, cc_flat: 40, // 3.3% + $0.40 (in cents: 40)
  ach_flat: 2500, // $25.00 flat ACH fee (cents)
  stripe_ach_rate: 0.008, stripe_ach_cap: 500, // Stripe's 0.8% capped at $5
};

function generatePaymentToken() {
  return require('crypto').randomBytes(24).toString('hex');
}

module.exports = { stripe, STRIPE_FEE, generatePaymentToken };
