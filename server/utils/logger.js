/**
 * Structured Logger — uses pino for JSON logging.
 *
 * Usage:
 *   const logger = require('../utils/logger');
 *   logger.info({ userId, projectId, amount }, 'payment_processed');
 *   logger.error({ userId, error: err.message }, 'payment_error');
 *   logger.warn({ flagName }, 'feature_flag_off');
 *
 * HTTP logging via pino-http (see server.js):
 *   const pinoHttp = require('pino-http');
 *   app.use(pinoHttp({ logger }));
 */
const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  base: {
    service: 'constructinv-api',
    env: process.env.NODE_ENV || 'production',
    version: process.env.npm_package_version || '2.1.0',
  },
  // Pretty print in development, JSON in production
  transport: process.env.NODE_ENV === 'development'
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
    : undefined,
});

module.exports = logger;
