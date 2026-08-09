const express = require('express');
const { Payment, Invoice, Refund, AuditEvent } = require('../models');
const { getProvider } = require('../lib/paymentProvider');

const router = express.Router({ mergeParams: true });

function rawBody(req, res, next) {
  let data = '';
  req.setEncoding('utf8');
  req.on('data', chunk => { data += chunk; });
  req.on('end', () => { req.rawBody = data; next(); });
}

async function finalizePayment(paymentId, provider, provider_txn_id, status) {
  const payment = await Payment.findByPk(paymentId);
  if (!payment) return null;
  if (payment.status === 'captured' || payment.status === 'refunded') return payment;
  await payment.update({
    status,
    provider_txn_id: provider_txn_id || payment.provider_txn_id,
    webhook_received_at: new Date()
  });
  if (status === 'captured') {
    await Invoice.create({
      appointment_id: payment.appointment_id,
      payment_id: payment.id,
      payer_user_id: payment.payer_user_id,
      patient_user_id: payment.patient_user_id,
      line_items: [{ description: payment.description || 'Consultation', amount: payment.amount }],
      currency: payment.currency,
      pkr_equivalent: payment.pkr_equivalent,
      subtotal: payment.amount,
      total: payment.amount,
      status: 'paid',
      paid_at: new Date()
    });
  }
  return payment;
}

// POST /api/v1/webhooks/stripe
router.post('/stripe', rawBody, async (req, res) => {
  try {
    const provider = getProvider('stripe');
    const valid = await provider.verifyWebhook({ signature: req.headers['stripe-signature'], rawBody: req.rawBody });
    if (!valid) return res.status(401).json({ error: 'Invalid signature' });
    const event = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.rawBody || '{}');
    const paymentId = event?.data?.object?.metadata?.payment_id;
    if (paymentId) {
      const status = event.type === 'payment_intent.succeeded' ? 'captured' : event.type === 'payment_intent.payment_failed' ? 'failed' : 'pending';
      await finalizePayment(paymentId, 'stripe', event?.data?.object?.id, status);
    }
    res.json({ received: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// POST /api/v1/webhooks/paypal
router.post('/paypal', rawBody, async (req, res) => {
  try {
    const provider = getProvider('paypal');
    const valid = await provider.verifyWebhook({ signature: req.headers['paypal-auth-algo'], rawBody: req.rawBody });
    if (!valid) return res.status(401).json({ error: 'Invalid signature' });
    const event = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.rawBody || '{}');
    const paymentId = event?.resource?.metadata?.payment_id || event?.metadata?.payment_id;
    if (paymentId) {
      const status = event.event_type === 'PAYMENT.CAPTURE.COMPLETED' ? 'captured' : event.event_type === 'PAYMENT.CAPTURE.DENIED' ? 'failed' : 'pending';
      await finalizePayment(paymentId, 'paypal', event?.resource?.id, status);
    }
    res.json({ received: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// POST /api/v1/webhooks/local-aggregator
router.post('/local-aggregator', rawBody, async (req, res) => {
  try {
    const provider = getProvider('local_card');
    const valid = await provider.verifyWebhook({ signature: req.headers['x-aggregator-signature'], rawBody: req.rawBody });
    if (!valid) return res.status(401).json({ error: 'Invalid signature' });
    const event = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.rawBody || '{}');
    const paymentId = event?.payment_id;
    if (paymentId) {
      const status = event.status === 'success' || event.status === 'captured' ? 'captured' : event.status === 'failed' ? 'failed' : 'pending';
      await finalizePayment(paymentId, event.provider || 'local_card', event?.txn_id, status);
    }
    res.json({ received: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
