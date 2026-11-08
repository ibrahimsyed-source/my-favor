import { randomUUID } from 'node:crypto';
import { Router, json } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config';
import { validate } from '../lib/validate';
import { asyncHandler, badRequest } from '../lib/errors';
import { authenticate } from '../middleware/authenticate';

// Supabase Storage proxy for image uploads (favor photos + avatars). The
// service-role key NEVER ships in the app bundle — the client sends base64 to
// this authed route and the server PUTs the bytes into the public `media`
// bucket on its behalf. Mounted in app.ts BEFORE the global express.json so the
// router-level 8mb parser below applies (a base64 image far exceeds the global
// 1mb cap) — same mount-order precedent as the Stripe raw-body webhook. Without
// SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY the route soft-degrades to a 503
// (same philosophy as the geo proxy's empty results): the app works the moment
// the env vars exist, and honestly reports "no uploads" until then.
export const uploadsRouter = Router();

// Per-user rate limit, mirroring geoLimiter (middleware/rateLimit.ts): keyed by
// user id — authenticate runs before this limiter so req.user is always set
// ('anon' is unreachable; unauthenticated calls 401 first). Defined here rather
// than in rateLimit.ts to keep this feature's surface in one owned file.
const uploadsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => !config.isProd,
  keyGenerator: (req) => req.user?.id ?? 'anon',
  message: { error: { code: 'too_many_requests', message: 'Too many uploads, try again later.' } },
});

// Pre-auth IP throttle: this router mounts BEFORE the global limiter (for the
// parser), and authenticate costs a JWT verify + possible DB hit — without this
// an unauthenticated client could hammer the route with zero throttling.
const preAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 240,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => !config.isProd,
  message: { error: { code: 'too_many_requests', message: 'Too many requests, try again later.' } },
});
uploadsRouter.use(preAuthLimiter);
uploadsRouter.use(authenticate);
uploadsRouter.use(uploadsLimiter);
// Router-level JSON parser. Sized ABOVE the decoded cap's base64 footprint
// (6MB decoded ≈ 8MB base64 + JSON envelope): the parser limit must not be the
// effective cap, or the clear 400 below becomes unreachable and oversize bodies
// surface as parser 413s instead.
uploadsRouter.use(json({ limit: '12mb' }));
// A body even the generous parser refuses still gets a clean, user-presentable
// error instead of a generic 500.
uploadsRouter.use((err: any, _req: any, res: any, next: any) => {
  if (err?.type === 'entity.too.large') {
    return res
      .status(400)
      .json({ error: { code: 'bad_request', message: 'Image is too large — the maximum is 6MB.' } });
  }
  return next(err);
});

const MAX_DECODED_BYTES = 6 * 1024 * 1024; // 6MB decoded image cap

// Magic-byte sniffing: the public bucket must only ever hold what it claims to
// hold — an allowlisted contentType string alone would let any authed user park
// arbitrary blobs on the project's public URL labeled as images.
function matchesMagic(bytes: Buffer, contentType: string): boolean {
  if (bytes.length < 12) return false;
  switch (contentType) {
    case 'image/jpeg':
      return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case 'image/png':
      return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    case 'image/webp':
      return bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
    default:
      return false;
  }
}
const SUPABASE_TIMEOUT_MS = 30_000;

// Allowlisted image types and their canonical file extensions.
const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

// Operational logging for Supabase failures — the client gets a clean 502, but
// the operator must still see a revoked key / missing bucket / quota problem in
// the Render logs. Rate-limited per detail so a dead key doesn't flood the log
// once per upload attempt (mirrors the geo proxy's logGeoFailure).
const lastLogged = new Map<string, number>();
const LOG_EVERY_MS = 5 * 60 * 1000;
function logUploadFailure(detail: string) {
  const now = Date.now();
  if ((lastLogged.get(detail) ?? 0) + LOG_EVERY_MS > now) return;
  lastLogged.set(detail, now);
  // eslint-disable-next-line no-console
  console.error(`[uploads] supabase upload failed: ${detail}`);
}

const uploadSchema = z.object({
  // Base64 payload, with or without a `data:image/...;base64,` prefix. The 8mb
  // router parser bounds the raw size; the decoded cap is enforced below.
  data: z.string().min(1),
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  kind: z.enum(['favor', 'avatar']),
});

// POST /api/uploads/image — { data, contentType, kind } -> { url }.
uploadsRouter.post(
  '/image',
  validate({ body: uploadSchema }),
  asyncHandler(async (req, res) => {
    if (!config.uploads.enabled) {
      // Soft degrade: the bucket/env is provisioned separately — until then the
      // client surfaces this message instead of a broken upload. Top-level
      // `message` is the documented shape; the `error` envelope is what the
      // app's api client parses into the failure reason.
      const message = 'Uploads are not configured on this server.';
      return res.status(503).json({ message, error: { code: 'uploads_unavailable', message } });
    }

    const input = req.body as z.infer<typeof uploadSchema>;

    // Strip an optional data-URI prefix, then decode. Buffer.from silently
    // ignores invalid characters, so an empty decode is the "not base64" signal.
    const base64 = input.data.replace(/^data:[^;,]+;base64,/, '').trim();
    const bytes = Buffer.from(base64, 'base64');
    if (bytes.length === 0) throw badRequest('data must be a base64-encoded image');
    if (bytes.length > MAX_DECODED_BYTES) {
      throw badRequest('Image is too large — the maximum is 6MB.');
    }
    if (!matchesMagic(bytes, input.contentType)) {
      throw badRequest('The file does not look like the image type it claims to be.');
    }

    // Per-user folder + random name: a client can never choose (or overwrite)
    // a storage path, and the public URL is unguessable.
    const path = `${input.kind}s/${req.user!.id}/${randomUUID()}.${EXTENSIONS[input.contentType]}`;

    // Plain fetch against the Supabase Storage REST API — no SDK dependency.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), SUPABASE_TIMEOUT_MS);
    try {
      const upstream = await fetch(`${config.uploads.url}/storage/v1/object/media/${path}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${config.uploads.serviceKey}`,
          'Content-Type': input.contentType,
        },
        body: bytes,
        signal: ctrl.signal,
      });
      if (!upstream.ok) {
        const detail = await upstream.text().catch(() => '');
        logUploadFailure(`HTTP ${upstream.status} ${detail.slice(0, 300)}`.trim());
        return res
          .status(502)
          .json({ error: { code: 'upload_failed', message: 'The image could not be uploaded — try again.' } });
      }
    } catch (err) {
      logUploadFailure(err instanceof Error && err.name === 'AbortError' ? 'timeout' : 'network error');
      return res
        .status(502)
        .json({ error: { code: 'upload_failed', message: 'The image could not be uploaded — try again.' } });
    } finally {
      clearTimeout(timer);
    }

    // The `media` bucket is public-read: the returned URL is what the app
    // persists (favor.images / user.avatar) and renders directly.
    return res.json({ url: `${config.uploads.url}/storage/v1/object/public/media/${path}` });
  }),
);
