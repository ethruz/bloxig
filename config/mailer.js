// config/mailer.js — Nodemailer (Gmail SMTP) helper for Bloxig
// Requires env vars: GMAIL_USER, GMAIL_APP_PASSWORD
// (Generate an app password at myaccount.google.com/apppasswords — needs 2FA on.)

const nodemailer = require('nodemailer');

// Reuse a single transporter
let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD
    }
  });
  return transporter;
}

// Base URL for links in emails (Render in prod, localhost in dev)
function baseUrl() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  return process.env.NODE_ENV === 'production'
    ? 'https://bloxig.onrender.com'
    : 'http://localhost:3000';
}

// ── Send a password-reset email ───────────────────────────────
async function sendResetEmail(toEmail, token, firstName) {
  const link = `${baseUrl()}/auth/reset/${token}`;
  const name = firstName || 'there';

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#0c0c0c;padding:40px 0;">
    <div style="max-width:480px;margin:0 auto;background:#1c1c1c;border:1px solid rgba(255,255,255,0.11);border-radius:12px;padding:32px;">
      <h1 style="color:#efefef;font-size:20px;margin:0 0 8px;">Reset your Bloxig password</h1>
      <p style="color:#999;font-size:14px;line-height:1.6;margin:0 0 24px;">
        Hi ${name}, we received a request to reset your password. Click the button below to choose a new one. This link expires in 1 hour.
      </p>
      <a href="${link}" style="display:inline-block;background:#4f7bf7;color:#fff;text-decoration:none;font-size:14px;font-weight:500;padding:11px 20px;border-radius:8px;">Reset password</a>
      <p style="color:#555;font-size:12px;line-height:1.6;margin:24px 0 0;">
        If you didn't request this, you can safely ignore this email — your password won't change.
      </p>
      <p style="color:#555;font-size:12px;line-height:1.6;margin:12px 0 0;word-break:break-all;">
        Or paste this link into your browser:<br>${link}
      </p>
    </div>
    <p style="color:#444;font-size:11px;text-align:center;margin:16px 0 0;">Bloxig — Figma to Roblox</p>
  </div>`;

  const text = `Reset your Bloxig password\n\nHi ${name}, we received a request to reset your password.\nOpen this link to choose a new one (expires in 1 hour):\n${link}\n\nIf you didn't request this, ignore this email.`;

  await getTransporter().sendMail({
    from: `"Bloxig" <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: 'Reset your Bloxig password',
    text,
    html
  });
}

module.exports = { sendResetEmail };
