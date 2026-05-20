// public/js/main.js — Bloxig client-side interactions

// ── Navbar scroll shadow ──────────────────────────────────
const navbar = document.querySelector('.navbar');
if (navbar) {
  window.addEventListener('scroll', () => {
    if (window.scrollY > 10) {
      navbar.style.borderBottomColor = 'rgba(255,255,255,0.08)';
    } else {
      navbar.style.borderBottomColor = 'rgba(255,255,255,0.05)';
    }
  }, { passive: true });
}

// ── Smooth scroll for anchor links ────────────────────────
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function(e) {
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

// ── Button click ripple feel (subtle opacity flash) ───────
document.querySelectorAll('.btn').forEach(btn => {
  btn.addEventListener('mousedown', function() {
    this.style.opacity = '0.85';
  });
  btn.addEventListener('mouseup', function() {
    this.style.opacity = '';
  });
  btn.addEventListener('mouseleave', function() {
    this.style.opacity = '';
  });
});

// ── Pricing card: highlight on hover ─────────────────────
document.querySelectorAll('.pricing-card').forEach(card => {
  card.addEventListener('mouseenter', function() {
    document.querySelectorAll('.pricing-card').forEach(c => {
      if (c !== this) c.style.opacity = '0.65';
    });
  });
  card.addEventListener('mouseleave', function() {
    document.querySelectorAll('.pricing-card').forEach(c => {
      c.style.opacity = '';
    });
  });
});

console.log('[Bloxig] ready.');