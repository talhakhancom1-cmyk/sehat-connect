const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { Payment, PaymentMethod, Invoice, Refund, AuditEvent } = require('../models');
const { authenticate, requireRole } = require('../middleware/auth');
const { ROLES } = require('../constants/ehc');
const {
  resolveProvider,
  toPkrEquivalent,
  getProvider,
  DEFAULT_FX_RATES
} = require('../lib/paymentProvider');
const { parseSort } = require('../lib/parseSort');
const { validateEnum, sanitizeError } = require('../lib/validate');

const PAYMENT_PROVIDERS = ['jazzcash', 'easypaisa', 'raast', 'local_card', 'stripe', 'paypal', 'cash', 'bank_transfer'];

const router = express.Router();

// POST /api/v1/payments/intent
router.post('/intent', authenticate, async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.patient_user_id || !body.amount) {
      return res.status(400).json({ error: 'patient_user_id and amount are required' });
    }
    // --- Server-side validation ---
    if (Number(body.amount) <= 0) {
      return res.status(400).json({ error: 'amount must be greater than 0' });
    }
    if (body.currency !== undefined && body.currency !== null && body.currency !== '') {
      if (!/^[A-Z]{3}$/.test(body.currency)) {
        return res.status(400).json({ error: 'currency must be a 3-letter uppercase code (e.g. PKR)' });
      }
    }
    if (body.provider !== undefined && body.provider !== null && body.provider !== '') {
      const err = validateEnum(body.provider, PAYMENT_PROVIDERS, 'provider');
      if (err) return res.status(400).json({ error: err });
    }
    const provider = body.provider || resolveProvider({
      payerCountry: body.payer_country,
      currency: body.currency
    });
    const currency = body.currency || 'PKR';
    const fxRate = body.fx_rate || (currency !== 'PKR' ? DEFAULT_FX_RATES[currency] : 1);
    const pkrEquivalent = toPkrEquivalent(Number(body.amount), currency, fxRate);
    const idempotencyKey = body.idempotency_key || uuidv4();

    const existing = await Payment.findOne({ where: { idempotency_key: idempotencyKey } });
    if (existing) return res.json(existing);

    const payment = await Payment.create({
      appointment_id: body.appointment_id,
      payer_user_id: req.user.id,
      patient_user_id: body.patient_user_id,
      provider,
      amount: Number(body.amount),
      currency,
      fx_rate: fxRate,
      pkr_equivalent: pkrEquivalent,
      status: 'intent',
      idempotency_key: idempotencyKey,
      description: body.description
    });

    const providerClient = getProvider(provider);
    const auth = await providerClient.authorize({
      amount: payment.amount,
      currency,
      idempotencyKey
    }).catch(err => ({ status: 'failed', failure_reason: err.message }));

    if (auth.status === 'failed') {
      await payment.update({ status: 'failed', failure_reason: auth.failure_reason });
      return res.status(400).json(payment);
    }

    await payment.update({
      status: 'authorized',
      provider_txn_id: auth.provider_txn_id
    });

    res.status(201).json(payment);
  } catch (error) {
    res.status(400).json({ error: sanitizeError(error) });
  }
});

// POST /api/v1/payments/:id/confirm
router.post('/:id/confirm', authenticate, async (req, res) => {
  try {
    const payment = await Payment.findByPk(req.params.id);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    if (payment.status === 'captured') return res.json(payment);
    if (payment.status !== 'authorized') {
      return res.status(400).json({ error: `Payment in state ${payment.status} cannot be confirmed` });
    }
    await payment.update({ status: 'pending', confirmed_at: new Date() });
    res.json(payment);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// POST /api/v1/payments/:id/refund
router.post('/:id/refund', authenticate, async (req, res) => {
  try {
    const payment = await Payment.findByPk(req.params.id);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    if (payment.status !== 'captured') {
      return res.status(400).json({ error: 'Only captured payments can be refunded' });
    }
    const body = req.body || {};
    const amount = Number(body.amount || payment.amount);
    const providerClient = getProvider(payment.provider);
    const refundResult = await providerClient.refund({
      provider_txn_id: payment.provider_txn_id,
      amount
    }).catch(err => ({ status: 'failed', failure_reason: err.message }));

    const refund = await Refund.create({
      payment_id: payment.id,
      amount,
      currency: payment.currency,
      reason: body.reason,
      status: refundResult.status === 'failed' ? 'failed' : 'processed',
      initiated_by_user_id: req.user.id,
      provider_refund_id: refundResult.provider_refund_id,
      processed_at: refundResult.status === 'failed' ? null : new Date()
    });

    if (refund.status === 'processed') {
      await payment.update({ status: 'refunded' });
    }

    res.status(201).json(refund);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// GET /api/v1/payments/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const payment = await Payment.findByPk(req.params.id);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    if (payment.payer_user_id !== req.user.id && payment.patient_user_id !== req.user.id) {
      const isAdmin = [ROLES.SUPER_ADMIN, ROLES.CLINIC_ADMIN, ROLES.SUPPORT_AGENT].includes(req.user.role);
      if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });
    }
    res.json(payment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/billing/invoices
router.get('/billing/invoices', authenticate, async (req, res) => {
  try {
    const invoices = await Invoice.findAll({
      where: { payer_user_id: req.user.id },
      order: parseSort(req.query, ['issued_at', 'created_at'], 'issued_at', 'DESC'),
      limit: 200
    });
    res.json(invoices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/payments — list the current user's payments
router.get('/', authenticate, async (req, res) => {
  try {
    const where = {};
    if (req.query.payer_id) where.payer_user_id = req.query.payer_id;
    if (req.query.patient_id) where.patient_user_id = req.query.patient_id;
    if (req.query.appointment_id) where.appointment_id = req.query.appointment_id;
    if (req.query.status) where.status = req.query.status;
    if (!Object.keys(where).length) where.payer_user_id = req.user.id;
    const payments = await Payment.findAll({
      where,
      order: parseSort(req.query, ['created_at', 'amount', 'status'], 'created_at', 'DESC'),
      limit: 200
    });
    res.json(payments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/payments — direct create (dummy mode, no real gateway)
// Used by base44.entities.Payment.create() from the frontend PaymentDialog.
router.post('/', authenticate, async (req, res) => {
  try {
    const body = req.body || {};
    const amount = Number(body.amount || 0);
    if (!amount) return res.status(400).json({ error: 'amount is required' });
    // --- Server-side validation ---
    if (amount <= 0) {
      return res.status(400).json({ error: 'amount must be greater than 0' });
    }
    if (body.currency !== undefined && body.currency !== null && body.currency !== '') {
      if (!/^[A-Z]{3}$/.test(body.currency)) {
        return res.status(400).json({ error: 'currency must be a 3-letter uppercase code (e.g. PKR)' });
      }
    }

    const rawMethod = body.method || body.provider || 'local_card';
    const isCash = rawMethod === 'cash';
    // Map frontend method IDs to valid provider enum values
    const providerMap = {
      jazzcash: 'jazzcash',
      easypaisa: 'easypaisa',
      card: 'local_card',
      bank_transfer: 'bank_transfer',
      cash: 'cash',
      stripe: 'stripe',
      paypal: 'paypal',
      raast: 'raast'
    };
    const provider = providerMap[rawMethod] || 'local_card';
    const providerErr = validateEnum(provider, PAYMENT_PROVIDERS, 'provider');
    if (providerErr) return res.status(400).json({ error: providerErr });

    // Validate appointment_id is a UUID or null
    let appointmentId = null;
    if (body.appointment_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.appointment_id)) {
      appointmentId = body.appointment_id;
    }

    const payment = await Payment.create({
      appointment_id: appointmentId,
      payer_user_id: req.user.id,
      patient_user_id: body.patient_id || body.patient_user_id || req.user.id,
      patient_name: body.patient_name || null,
      payer_name: body.payer_name || req.user.display_name || null,
      provider,
      method: rawMethod,
      amount,
      currency: body.currency || 'PKR',
      fx_rate: body.fx_rate || 1,
      pkr_equivalent: amount,
      status: isCash ? 'pending' : 'captured',
      paid_at: isCash ? null : (body.paid_at || new Date()),
      idempotency_key: body.idempotency_key || `pay-${Date.now()}`,
      description: body.description || null
    });
    res.status(201).json(payment);
  } catch (error) {
    res.status(400).json({ error: sanitizeError(error) });
  }
});

// POST /api/v1/payments/methods
router.post('/methods', authenticate, async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.provider || !body.token_reference) {
      return res.status(400).json({ error: 'provider and token_reference are required' });
    }
    if (body.is_default) {
      await PaymentMethod.update({ is_default: false }, { where: { user_id: req.user.id } });
    }
    const method = await PaymentMethod.create({
      user_id: req.user.id,
      provider: body.provider,
      token_reference: body.token_reference,
      label: body.label,
      brand: body.brand,
      last4: body.last4,
      expiry_month: body.expiry_month,
      expiry_year: body.expiry_year,
      is_default: body.is_default || false,
      status: 'active'
    });
    res.status(201).json(method);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// GET /api/v1/payments/methods
router.get('/methods', authenticate, async (req, res) => {
  try {
    const methods = await PaymentMethod.findAll({
      where: { user_id: req.user.id, status: 'active' },
      order: [['is_default', 'DESC'], ['created_at', 'DESC']]
    });
    res.json(methods);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/v1/payments/methods/:id
router.delete('/methods/:id', authenticate, async (req, res) => {
  try {
    const method = await PaymentMethod.findByPk(req.params.id);
    if (!method) return res.status(404).json({ error: 'Payment method not found' });
    if (method.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    await method.update({ status: 'revoked' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
