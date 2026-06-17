const cron = require('node-cron');
const { expireOld } = require('./booking');

function startTimer(io) {
  const job = cron.schedule('* * * * *', async () => {
    try {
      const affectedEventIds = await expireOld();
      for (const eventId of affectedEventIds) {
        io.to(`event:${eventId}`).emit('seats:update', { eventId });
      }
      if (affectedEventIds.length > 0) {
        console.log(`[timer] Scadute prenotazioni per eventi: ${affectedEventIds.join(', ')}`);
      }
    } catch (err) {
      console.error('[timer] Errore scadenza prenotazioni:', err.message);
    }
  });
  return job;
}

module.exports = { startTimer };
