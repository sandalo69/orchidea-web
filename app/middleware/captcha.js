const SCORE_THRESHOLD = parseFloat(process.env.RECAPTCHA_SCORE_THRESHOLD || '0.5');

module.exports = async function verifyCaptcha(req, res, next) {
  if (!process.env.RECAPTCHA_SECRET_KEY) {
    if (process.env.NODE_ENV === 'production') {
      console.warn('[captcha] RECAPTCHA_SECRET_KEY non impostato in produzione — captcha disabilitato');
    }
    return next();
  }
  const token = req.body['g-recaptcha-response'];
  // Redirect preserva l'URL originale (incluse query string esistenti)
  const redirectOnFail = `${req.originalUrl.split('?')[0]}?error=captcha`;
  if (!token) return res.redirect(redirectOnFail);
  try {
    const params = new URLSearchParams({
      secret: process.env.RECAPTCHA_SECRET_KEY,
      response: token,
      remoteip: req.ip,
    });
    const r = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      body: params,
    });
    const data = await r.json();
    if (!data.success || data.score < SCORE_THRESHOLD) {
      return res.redirect(redirectOnFail);
    }
    next();
  } catch (err) {
    console.error('Errore verifica captcha:', err.message);
    next();
  }
};
