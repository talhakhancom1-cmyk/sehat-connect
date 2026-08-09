const PAYMENT_PROVIDERS = ['jazzcash', 'easypaisa', 'raast', 'local_card', 'stripe', 'paypal'];

const LOCAL_PROVIDERS = ['jazzcash', 'easypaisa', 'raast', 'local_card'];
const CROSS_BORDER_PROVIDERS = ['stripe', 'paypal'];

const DEFAULT_FX_RATES = {
  USD: 280,
  GBP: 355,
  EUR: 305,
  PKR: 1
};

function resolveProvider({ payerCountry, currency }) {
  if (currency && currency !== 'PKR') {
    return 'stripe';
  }
  if (payerCountry && payerCountry !== 'PK') {
    return 'paypal';
  }
  return 'local_card';
}

function toPkrEquivalent(amount, currency, fxRate) {
  if (currency === 'PKR') return amount;
  const rate = fxRate || DEFAULT_FX_RATES[currency] || 1;
  return Number((amount * rate).toFixed(2));
}

class PaymentProviderInterface {
  async authorize() { throw new Error('authorize not implemented'); }
  async capture() { throw new Error('capture not implemented'); }
  async refund() { throw new Error('refund not implemented'); }
  async verifyWebhook() { throw new Error('verifyWebhook not implemented'); }
}

class StubProvider extends PaymentProviderInterface {
  constructor(name) { super(); this.name = name; }
  async authorize({ amount, currency, idempotencyKey }) {
    return {
      provider: this.name,
      provider_txn_id: `${this.name}_${idempotencyKey || Date.now()}`,
      status: 'authorized',
      amount, currency
    };
  }
  async capture({ provider_txn_id }) {
    return { provider: this.name, provider_txn_id, status: 'captured' };
  }
  async refund({ provider_txn_id, amount }) {
    return { provider: this.name, provider_refund_id: `refund_${provider_txn_id}`, amount, status: 'processed' };
  }
  async verifyWebhook({ signature, rawBody }) {
    return !!signature || !!rawBody;
  }
}

const providers = {};
for (const name of PAYMENT_PROVIDERS) {
  providers[name] = new StubProvider(name);
}

function getProvider(name) {
  return providers[name] || providers.local_card;
}

module.exports = {
  PAYMENT_PROVIDERS,
  LOCAL_PROVIDERS,
  CROSS_BORDER_PROVIDERS,
  DEFAULT_FX_RATES,
  resolveProvider,
  toPkrEquivalent,
  PaymentProviderInterface,
  StubProvider,
  getProvider
};
