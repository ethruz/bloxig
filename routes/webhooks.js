// routes/webhooks.js — Stripe Webhook Handler
// NOTE: This route is mounted BEFORE express.json() in server.js
// so we receive the raw body Stripe needs for signature verification.
const express = require('express');
const router  = express.Router();
const stripe  = require('stripe')(process.env.STRIPE_SECRET_KEY);
const User    = require('../models/User');

router.post('/stripe', async (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle events
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const customerId = session.customer;

      // Upgrade user to Pro
      await User.findOneAndUpdate(
        { stripe_customer_id: customerId },
        { subscription_status: 'Pro' }
      );
      console.log(`✅ User ${customerId} upgraded to Pro`);
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      await User.findOneAndUpdate(
        { stripe_customer_id: sub.customer },
        { subscription_status: 'Free' }
      );
      console.log(`⚠️ Subscription cancelled for ${sub.customer}`);
      break;
    }

    default:
      console.log(`Unhandled Stripe event: ${event.type}`);
  }

  res.json({ received: true });
});

module.exports = router;
