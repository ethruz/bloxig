// routes/webhooks.js — Lemon Squeezy webhook handler
// Mounted at /api/webhooks  (see server.js).
// IMPORTANT: server.js applies express.raw({type:'application/json'}) to /api/webhooks
// BEFORE express.json(), so req.body here is a RAW Buffer — required for signature check.

const express = require('express');
const crypto  = require('crypto');
const router  = express.Router();
const User    = require('../models/User');

// ── Verify the Lemon Squeezy signature ────────────────────────
// LS signs each request with HMAC-SHA256 of the raw body using your
// LEMON_WEBHOOK_SECRET, sent in the 'X-Signature' header.
function verifySignature(rawBody, signature) {
  if (!process.env.LEMON_WEBHOOK_SECRET || !signature) return false;
  try {
    const hmac   = crypto.createHmac('sha256', process.env.LEMON_WEBHOOK_SECRET);
    const digest = hmac.update(rawBody).digest('hex');
    // timingSafeEqual throws if lengths differ — guard with try/catch
    return crypto.timingSafeEqual(
      Buffer.from(digest, 'hex'),
      Buffer.from(signature, 'hex')
    );
  } catch (e) {
    return false;
  }
}

// ── Helper: find the Bloxig user this event belongs to ────────
// Prefer the custom user_id we attach to the checkout URL; fall back to email.
async function findUser(payload) {
  const custom =
    payload?.meta?.custom_data?.user_id ||
    payload?.data?.attributes?.first_order_item?.custom_data?.user_id ||
    null;

  if (custom) {
    const byId = await User.findById(custom).catch(() => null);
    if (byId) return byId;
  }

  const email =
    payload?.data?.attributes?.user_email ||
    payload?.data?.attributes?.email ||
    null;

  if (email) {
    return User.findOne({ email: String(email).toLowerCase().trim() });
  }
  return null;
}

// ── POST /api/webhooks/lemon ──────────────────────────────────
router.post('/lemon', async (req, res) => {
  // req.body is a Buffer (raw). Verify signature against it.
  const signature = req.get('X-Signature');
  const rawBody   = req.body; // Buffer

  if (!verifySignature(rawBody, signature)) {
    console.warn('[Webhook] Invalid signature — rejected.');
    return res.status(401).json({ error: 'Invalid signature.' });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch (e) {
    return res.status(400).json({ error: 'Invalid JSON.' });
  }

  const eventName = payload?.meta?.event_name;
  if (!eventName) return res.status(400).json({ error: 'Missing event name.' });

  try {
    const user = await findUser(payload);
    if (!user) {
      // We still 200 so LS doesn't retry forever; just log it.
      console.warn(`[Webhook] ${eventName}: no matching user.`);
      return res.status(200).json({ received: true, matched: false });
    }

    const attrs = payload?.data?.attributes || {};

    switch (eventName) {
      // ── New subscription started, or a renewal succeeded ──────
      case 'subscription_created':
      case 'subscription_payment_success':
      case 'subscription_unpaused':
      case 'subscription_resumed': {
        user.subscription_status = 'Pro';
        user.proExpiresAt        = null; // active recurring sub, no manual expiry
        if (attrs.customer_id)       user.lemon_customer_id     = String(attrs.customer_id);
        if (payload?.data?.id)       user.lemon_subscription_id = String(payload.data.id);
        if (attrs.urls?.customer_portal) user.lemon_portal_url  = attrs.urls.customer_portal;
        user.subscription_ends_at = null;
        await user.save();
        break;
      }

      // ── Subscription updated (plan change, card update, etc.) ─
      case 'subscription_updated': {
        // If LS reports it's active, keep them Pro; if paused/expired status, reflect it.
        const status = attrs.status; // 'active','paused','cancelled','expired','past_due'...
        if (status === 'active') {
          user.subscription_status = 'Pro';
          user.proExpiresAt = null;
        } else if (status === 'paused' || status === 'expired' || status === 'unpaid') {
          user.subscription_status = 'Free';
        }
        if (attrs.urls?.customer_portal) user.lemon_portal_url = attrs.urls.customer_portal;
        if (attrs.ends_at) user.subscription_ends_at = new Date(attrs.ends_at);
        await user.save();
        break;
      }

      // ── User paused their subscription ────────────────────────
      case 'subscription_paused': {
        user.subscription_status = 'Free';
        await user.save();
        break;
      }

      // ── Cancelled: usually stays active until period end ──────
      case 'subscription_cancelled': {
        // Keep Pro until it actually expires; record when that is.
        if (attrs.ends_at) user.subscription_ends_at = new Date(attrs.ends_at);
        // Do NOT downgrade here — wait for subscription_expired.
        await user.save();
        break;
      }

      // ── Fully ended ───────────────────────────────────────────
      case 'subscription_expired': {
        user.subscription_status  = 'Free';
        user.subscription_ends_at = null;
        await user.save();
        break;
      }

      // ── Refund → revoke access ────────────────────────────────
      case 'subscription_payment_refunded':
      case 'order_refunded': {
        user.subscription_status = 'Free';
        user.proExpiresAt        = null;
        await user.save();
        break;
      }

      // ── One-time order (Pro Plus = Lifetime) ──────────────────
      case 'order_created': {
        // Distinguish the lifetime product from a subscription's first order.
        // Subscriptions also create an order, but those are handled by
        // subscription_created. Here we look for a non-subscription order.
        const isSubscription = attrs.first_order_item?.product_id &&
                               attrs.subscription_id; // present if part of a sub
        // If it's the lifetime (non-recurring) purchase, grant Lifetime.
        if (!isSubscription) {
          user.subscription_status = 'Lifetime';
          user.proExpiresAt        = null;
          if (attrs.customer_id) user.lemon_customer_id = String(attrs.customer_id);
          await user.save();
        }
        break;
      }

      default:
        // Unhandled event — acknowledge so LS doesn't retry.
        console.log(`[Webhook] Unhandled event: ${eventName}`);
    }

    return res.status(200).json({ received: true, matched: true });
  } catch (err) {
    console.error('[Webhook] Handler error:', err);
    // 200 to avoid infinite retries on a bug; we logged it.
    return res.status(200).json({ received: true, error: 'handler_error' });
  }
});

module.exports = router;
