module.exports = async function verifyCaptcha(req, res, next) {
  if (!process.env.RECAPTCHA_SECRET_KEY) return next();
  const token = req.body['g-recaptcha-response'];
  if (!token) return res.redirect(`${req.path}?error=captcha`);
  try {
    const params = new URLSearchParams({
      secret: process.env.RECAPTCHA_SECRET_KEY,
      response: token,
    });
    const r = await fetch(`https://www.google.com/recaptcha/api/siteverify`, {
      method: 'POST',
      body: params,
    });
    const data = await r.json();
    if (!data.success || data.score < 0.5) {
      return res.redirect(`${req.path}?error=captcha`);
    }
    next();
  } catch (err) {
    console.error('Errore verifica captcha:', err.message);
    next();
  }
};
