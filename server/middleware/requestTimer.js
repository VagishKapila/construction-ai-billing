// Request timing middleware (logs slow API calls)

const { logEvent } = require('../lib/logEvent');

function requestTimerMiddleware(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    if (ms > 2000) { // log anything taking more than 2 seconds
      logEvent(null, 'slow_request', { method: req.method, path: req.path, ms, status: res.statusCode });
    }
    // Log all errors automatically
    if (res.statusCode >= 500) {
      logEvent(null, 'server_error', { method: req.method, path: req.path, ms, status: res.statusCode });
    }
  });
  next();
}

module.exports = { requestTimerMiddleware };
