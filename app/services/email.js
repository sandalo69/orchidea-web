const nodemailer = require('nodemailer');
const path = require('path');
const ejs = require('ejs');

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: process.env.SMTP_PORT === '465',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

async function sendConfirmationEmail(to, nome, token) {
  const link = `${process.env.BASE_URL}/auth/conferma?token=${token}`;
  if (!process.env.SMTP_HOST) {
    console.log(`[EMAIL] Conferma account ${to}: ${link}`);
    return;
  }
  const html = await ejs.renderFile(
    path.join(__dirname, '../views/emails/conferma-account.ejs'),
    { nome, link }
  );
  await createTransporter().sendMail({
    from: `"Orchidea" <${process.env.SMTP_USER}>`,
    to,
    subject: 'Conferma il tuo account Orchidea',
    html,
  });
}

async function sendBulkNewsletter(oggetto, corpo, recipients) {
  if (!process.env.SMTP_HOST) {
    console.log(`[EMAIL] Newsletter "${oggetto}" a ${recipients.length} utenti`);
    return recipients.length;
  }
  const t = createTransporter();
  for (const { email } of recipients) {
    await t.sendMail({
      from: `"Orchidea" <${process.env.SMTP_USER}>`,
      to: email,
      subject: oggetto,
      html: corpo,
    });
  }
  return recipients.length;
}

module.exports = { sendConfirmationEmail, sendBulkNewsletter };
