import { randomUUID } from 'node:crypto';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config';
import { prisma } from './db';
import { errorHandler, notFound } from './lib/errors';
import { globalLimiter } from './middleware/rateLimit';
import { authRouter } from './routes/auth.routes';
import { profileRouter } from './routes/profile.routes';
import { favorRouter } from './routes/favor.routes';
import { paymentRouter } from './routes/payment.routes';
import { messageRouter } from './routes/message.routes';
import { notificationRouter } from './routes/notification.routes';
import { moderationRouter } from './routes/moderation.routes';
import { stripeRouter } from './routes/stripe.routes';

export function createApp() {
  const app = express();

  // Trust the proxy in production (so rate-limit / secure cookies see real IPs).
  if (config.isProd) app.set('trust proxy', 1);

  // Request correlation + minimal access logging. Assigns (or honours an
  // upstream) request id, echoes it in X-Request-Id so a client-reported
  // failure can be matched to a log line, and logs method/path/status/latency
  // once the response is sent. Uses only built-ins (no morgan/pino dependency).
  app.use((req, res, next) => {
    const incoming = req.headers['x-request-id'];
    const requestId = (Array.isArray(incoming) ? incoming[0] : incoming) || randomUUID();
    res.setHeader('X-Request-Id', requestId);

    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Math.round(Number(process.hrtime.bigint() - startedAt) / 1e5) / 10;
      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify({
          level: res.statusCode >= 500 ? 'error' : 'info',
          msg: 'request',
          id: requestId,
          method: req.method,
          path: req.originalUrl,
          status: res.statusCode,
          ms,
        }),
      );
    });

    next();
  });

  // Security headers.
  app.use(helmet());

  // CORS locked to an explicit allowlist — never reflect arbitrary origins.
  app.use(
    cors({
      origin(origin, callback) {
        // Allow same-origin / non-browser clients (no Origin header), and any
        // configured origin. Everything else is rejected.
        if (!origin || config.corsOrigins.includes(origin)) return callback(null, true);
        return callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
    }),
  );

  // Stripe webhook MUST be mounted before the JSON body parser so it can read
  // the raw body for signature verification.
  app.use('/api/stripe', stripeRouter);

  // JSON body parsing with a strict size limit (mitigates large-payload DoS).
  app.use(express.json({ limit: '1mb' }));

  // Global rate limit across the API.
  app.use(globalLimiter);

  // Health/readiness probe. Verifies Postgres is actually reachable with a
  // lightweight query so a broken instance is reported unhealthy (503) and the
  // platform can restart/fail the deploy — rather than staying "healthy" while
  // every real request 500s.
  app.get('/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return res.json({ ok: true, env: config.nodeEnv });
    } catch {
      return res.status(503).json({ ok: false, env: config.nodeEnv, error: 'database_unreachable' });
    }
  });

  app.use('/api/auth', authRouter);
  app.use('/api/profile', profileRouter);
  app.use('/api/favors', favorRouter);
  app.use('/api/payments', paymentRouter);
  app.use('/api/messages', messageRouter);
  app.use('/api/notifications', notificationRouter);
  app.use('/api/moderation', moderationRouter);

  // 404 + centralized error handling (must be last).
  app.use((_req, _res, next) => next(notFound('Route not found')));
  app.use(errorHandler);

  return app;
}
