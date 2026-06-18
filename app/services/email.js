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
    text: `Ciao ${nome},\n\nConferma il tuo account: ${link}\n\nIl link scade in 24 ore.`,
  });
}

// corpo deve essere HTML già sanitizzato dal chiamante (admin autenticato)
async function sendBulkNewsletter(oggetto, corpo, recipients) {
  if (!Array.isArray(recipients)) return 0;
  if (!process.env.SMTP_HOST) {
    console.log(`[EMAIL] Newsletter "${oggetto}" a ${recipients.length} utenti`);
    return recipients.length;
  }
  const t = createTransporter();
  let inviati = 0;
  for (const { email } of recipients) {
    try {
      await t.sendMail({
        from: `"Orchidea" <${process.env.SMTP_USER}>`,
        to: email,
        subject: oggetto,
        html: corpo,
      });
      inviati++;
    } catch (err) {
      console.error(`[EMAIL] Errore invio newsletter a ${email}:`, err.message);
    }
  }
  return inviati;
}

async function sendBookingConfirmation(to, nome, booking, evento) {
  const html = await ejs.renderFile(
    path.join(__dirname, '../views/emails/conferma-prenotazione.ejs'),
    { nome, booking, evento, baseUrl: process.env.BASE_URL || 'http://localhost' }
  );
  if (!process.env.SMTP_HOST) {
    console.log(`[EMAIL] Conferma prenotazione #${booking.id} per ${to}`);
    return;
  }
  await createTransporter().sendMail({
    from: `"Orchidea" <${process.env.SMTP_USER}>`,
    to,
    subject: `Prenotazione confermata — ${evento.titolo}`,
    html,
    text: `Ciao ${nome}, prenotazione #${booking.id} per ${evento.titolo} confermata. Importo: €${booking.importo}`,
  });
}

async function sendContactMessage(nome, emailMittente, messaggio) {
  const adminEmail = process.env.ADMIN_EMAIL || 'orchideadisco@gmail.com';
  if (!process.env.SMTP_HOST) {
    console.log(`[EMAIL] Contatto da ${nome} <${emailMittente}>: ${messaggio.substring(0, 80)}`);
    return;
  }
  await createTransporter().sendMail({
    from: `"Orchidea" <${process.env.SMTP_USER}>`,
    to: adminEmail,
    replyTo: `"${nome.replace(/[\r\n"]/g, '')}" <${emailMittente}>`,
    subject: `Messaggio dal sito — ${nome.replace(/[\r\n"]/g, '')}`,
    text: `Da: ${nome} <${emailMittente}>\n\n${messaggio}`,
  });
}

async function sendNewsletterWelcome(nome, email) {
  if (!process.env.SMTP_HOST) {
    console.log(`[EMAIL] Newsletter welcome: ${email}`);
    return;
  }
  const html = await ejs.renderFile(
    path.join(__dirname, '../views/emails/newsletter-welcome.ejs'),
    { nome, baseUrl: process.env.BASE_URL || 'https://orchidea.it' }
  );
  await createTransporter().sendMail({
    from: `"Orchidea" <${process.env.SMTP_USER}>`,
    to: email,
    subject: 'Benvenuto nella newsletter Orchidea! 🌸',
    html,
    text: `Ciao${nome ? ' ' + nome : ''}!\n\nSei iscritto/a alla newsletter di Orchidea.\nRiceverai in anteprima le date delle nostre serate.\n\nOrchidea\nVia U. Maddalena 40, Rottanova (VE) 30014`,
  });
}

module.exports = { sendConfirmationEmail, sendBulkNewsletter, sendBookingConfirmation, sendContactMessage, sendNewsletterWelcome };
