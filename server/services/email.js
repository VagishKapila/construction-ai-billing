// Email helper — wraps fetch with a 10s timeout so a slow Resend call
// never hangs the entire HTTP request indefinitely

function fetchEmail(url, opts) {
  return fetch(url, { ...opts, signal: AbortSignal.timeout(10000) });
}

module.exports = { fetchEmail };
