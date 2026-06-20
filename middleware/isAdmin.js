// middleware/isAdmin.js — Admin guard
const isAdmin = (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.redirect('/admin/login');
  }
  if (!req.user.isAdmin) {
    return res.status(403).render('admin/error', {
      title: 'Access Denied',
      message: 'You do not have permission to access the admin panel.'
    });
  }
  next();
};

module.exports = { isAdmin };