/**
 * Schedules the daily payment follow-up job.
 *
 * Runs at 12:00 UTC (~8am ET) every day.
 * Call startFollowupScheduler() once at server startup.
 */
const cron = require('node-cron');
const { runFollowups } = require('./service');

function startFollowupScheduler() {
  // '0 12 * * *' = 12:00 UTC = ~8am ET (safe for both EDT UTC-4 and EST UTC-5)
  cron.schedule('0 12 * * *', async () => {
    console.log('[followup] Running daily payment follow-up job...');
    try {
      const result = await runFollowups();
      console.log(`[followup] Done — sent: ${result.sent}, skipped: ${result.skipped}, errors: ${result.errors.length}`);
      if (result.errors.length) {
        result.errors.forEach(e => console.error('[followup] ERROR:', e));
      }
    } catch (err) {
      console.error('[followup] Fatal error in follow-up job:', err);
    }
  });

  console.log('[followup] Scheduler started — daily at 12:00 UTC (~8am ET)');
}

module.exports = { startFollowupScheduler };
