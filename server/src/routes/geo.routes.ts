import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config';
import { validate, validatedQuery } from '../lib/validate';
import { asyncHandler } from '../lib/errors';
import { authenticate } from '../middleware/authenticate';
import { geoLimiter } from '../middleware/rateLimit';

// Google Maps Platform proxy (Places Autocomplete + Geocoding + Routes). The
// server key
// (config.maps.serverKey) never ships in the app bundle — the client's
// EXPO_PUBLIC key stays restricted to the Static Maps image API. All routes are
// authenticated and rate-limited so the key can't be farmed through us, and
// every Google failure degrades to an EMPTY result (never a 5xx): the app's
// address flow must keep working with free-typed addresses when the key is
// unset (local dev) or Google is unreachable.
export const geoRouter = Router();
geoRouter.use(authenticate);
geoRouter.use(geoLimiter);

const GOOGLE_TIMEOUT_MS = 5_000;

// Operational logging: the CLIENT response stays a soft empty on any Google
// failure (by design — the address flow must keep working), but the operator
// must still be able to see a revoked key, missing billing, or exhausted
// quota in the Render logs. Rate-limited per label+detail so a dead key
// doesn't flood the log once per keystroke.
const lastLogged = new Map<string, number>();
const LOG_EVERY_MS = 5 * 60 * 1000;
function logGeoFailure(label: string, detail: string) {
  const key = `${label}:${detail}`;
  const now = Date.now();
  if ((lastLogged.get(key) ?? 0) + LOG_EVERY_MS > now) return;
  lastLogged.set(key, now);
  // eslint-disable-next-line no-console
  console.error(`[geo] ${label} failed: ${detail}`);
}

async function googleJson(
  label: string,
  url: string,
  init?: RequestInit,
): Promise<Record<string, unknown> | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), GOOGLE_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok) {
      const err = (body?.error as { message?: string } | undefined)?.message ?? '';
      logGeoFailure(label, `HTTP ${res.status} ${err}`.trim());
      return null;
    }
    // Geocoding-style bodies carry a status field; anything other than OK /
    // ZERO_RESULTS (REQUEST_DENIED, OVER_QUERY_LIMIT, …) is an operator
    // problem, not a no-match.
    const status = body?.status;
    if (typeof status === 'string' && status !== 'OK' && status !== 'ZERO_RESULTS') {
      logGeoFailure(label, `${status} ${(body?.error_message as string | undefined) ?? ''}`.trim());
    }
    return body;
  } catch (err) {
    logGeoFailure(label, err instanceof Error && err.name === 'AbortError' ? 'timeout' : 'network error');
    return null;
  } finally {
    clearTimeout(timer);
  }
}

type GeoLocation = { lat: number; lng: number; address: string };

// Shared shape-pick from a Geocoding API result row.
function pickLocation(row: unknown): GeoLocation | null {
  const r = row as {
    formatted_address?: string;
    geometry?: { location?: { lat?: number; lng?: number } };
  };
  const lat = r?.geometry?.location?.lat;
  const lng = r?.geometry?.location?.lng;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  return { lat, lng, address: r.formatted_address ?? '' };
}

// GET /api/geo/suggest?q=... — address suggestions while the member types.
// Places API (New) Autocomplete (the legacy Places API can no longer be enabled
// on new Google Cloud projects as of Oct 2026), restricted to the US (the app
// is US-only at launch). Returns { suggestions: [{ id, description }] }; id is
// a Google place id to pass to /resolve.
geoRouter.get(
  '/suggest',
  validate({ query: z.object({ q: z.string().trim().min(3).max(200) }) }),
  asyncHandler(async (req, res) => {
    if (!config.maps.enabled) return res.json({ suggestions: [] });
    const { q } = validatedQuery<{ q: string }>(req);
    const data = await googleJson('suggest', 'https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': config.maps.serverKey },
      // Lowercase ccTLD-style region code per the Places (New) docs — the API
      // 400s on the uppercase CLDR spelling.
      body: JSON.stringify({ input: q, includedRegionCodes: ['us'] }),
    });
    const rows =
      (data?.suggestions as Array<{ placePrediction?: { placeId?: string; text?: { text?: string } } }>) ?? [];
    const suggestions = rows
      .map((r) => r.placePrediction)
      .filter((p): p is { placeId: string; text: { text: string } } => !!p?.placeId && !!p?.text?.text)
      .slice(0, 5)
      .map((p) => ({ id: p.placeId, description: p.text.text }));
    return res.json({ suggestions });
  }),
);

// GET /api/geo/resolve?placeId=... — turn a /suggest pick into coordinates.
// Geocoding API by place_id. Returns { location: {lat,lng,address} | null }.
geoRouter.get(
  '/resolve',
  validate({ query: z.object({ placeId: z.string().trim().min(5).max(300) }) }),
  asyncHandler(async (req, res) => {
    if (!config.maps.enabled) return res.json({ location: null });
    const { placeId } = validatedQuery<{ placeId: string }>(req);
    const url =
      'https://maps.googleapis.com/maps/api/geocode/json' +
      `?place_id=${encodeURIComponent(placeId)}&key=${config.maps.serverKey}`;
    const data = await googleJson('resolve', url);
    const rows = (data?.results as unknown[]) ?? [];
    return res.json({ location: data?.status === 'OK' && rows.length ? pickLocation(rows[0]) : null });
  }),
);

// GET /api/geo/reverse?lat=..&lng=.. — reverse-geocode a map-pan position into
// a display address. Echoes the given coords (they are the source of truth —
// Google's result coords may snap to the nearest address).
geoRouter.get(
  '/reverse',
  validate({ query: z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) }) }),
  asyncHandler(async (req, res) => {
    if (!config.maps.enabled) return res.json({ location: null });
    const { lat, lng } = validatedQuery<{ lat: number; lng: number }>(req);
    const base =
      'https://maps.googleapis.com/maps/api/geocode/json' +
      `?latlng=${lat},${lng}&key=${config.maps.serverKey}`;
    let data = await googleJson(
      'reverse',
      `${base}&result_type=street_address|premise|route|neighborhood|locality`,
    );
    // Remote/unincorporated coords may have none of the preferred types —
    // retry unfiltered so an honest coarse label (county, plus code) still
    // comes back instead of the client silently keeping its stale text.
    if (data?.status === 'ZERO_RESULTS') {
      data = await googleJson('reverse-unfiltered', base);
    }
    const rows = (data?.results as unknown[]) ?? [];
    const first = data?.status === 'OK' && rows.length ? pickLocation(rows[0]) : null;
    return res.json({ location: first ? { lat, lng, address: first.address } : null });
  }),
);

// GET /api/geo/geocode?q=... — forward-geocode a free-typed address (the member
// hit Confirm without picking a suggestion). Returns the same shape as /resolve.
geoRouter.get(
  '/geocode',
  validate({ query: z.object({ q: z.string().trim().min(3).max(300) }) }),
  asyncHandler(async (req, res) => {
    if (!config.maps.enabled) return res.json({ location: null });
    const { q } = validatedQuery<{ q: string }>(req);
    const url =
      'https://maps.googleapis.com/maps/api/geocode/json' +
      `?address=${encodeURIComponent(q)}&components=country:US&key=${config.maps.serverKey}`;
    const data = await googleJson('geocode', url);
    const rows = (data?.results as unknown[]) ?? [];
    return res.json({ location: data?.status === 'OK' && rows.length ? pickLocation(rows[0]) : null });
  }),
);

// ---------------------------------------------------------------------------
// GET /api/geo/directions?olat&olng&dlat&dlng — driving route between the pal
// and the favor destination for the live maps (member tracking + pal
// navigation backdrop). Proxies the Routes API v2; like every other geo route,
// any Google failure degrades to a soft null so the maps fall back to plain
// markers. Returns { route: { polyline, durationSec, distanceMeters } | null }.
// ---------------------------------------------------------------------------

type DirectionsRoute = { polyline: string; durationSec: number; distanceMeters: number };

// 30s micro-cache keyed by the endpoints rounded to 4 decimals (~11m buckets):
// the member's tracking map refetches as the pal moves, so identical segments
// requested within the window must not double-spend Routes API quota. Bounded
// at 500 entries with simple oldest-first eviction (Map preserves insertion
// order); only successful routes are cached — failures stay retryable.
const DIRECTIONS_CACHE_TTL_MS = 30_000;
const DIRECTIONS_CACHE_MAX = 500;
const directionsCache = new Map<string, { at: number; route: DirectionsRoute }>();

function directionsCacheGet(key: string): DirectionsRoute | null {
  const hit = directionsCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > DIRECTIONS_CACHE_TTL_MS) {
    directionsCache.delete(key);
    return null;
  }
  return hit.route;
}

function directionsCacheSet(key: string, route: DirectionsRoute) {
  if (!directionsCache.has(key) && directionsCache.size >= DIRECTIONS_CACHE_MAX) {
    const oldest = directionsCache.keys().next().value;
    if (oldest !== undefined) directionsCache.delete(oldest);
  }
  directionsCache.set(key, { at: Date.now(), route });
}

// Routes API v2 returns durations as a protobuf-style string ('123s').
function parseDurationSec(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const m = /^(\d+(?:\.\d+)?)s$/.exec(raw.trim());
  return m ? Math.round(Number(m[1])) : null;
}

// Coalesce concurrent identical lookups: the member's tracking map and the
// pal's backdrop key on the same coordinate pair whenever both screens are
// open — the second caller must await the first flight, not double-spend a
// computeRoutes charge.
const directionsInFlight = new Map<string, Promise<DirectionsRoute | null>>();

// Empty query strings coerce to 0 under z.coerce.number() (Number('') === 0),
// which would send a billed (0,0) request to Null Island — reject them first.
const requiredCoord = (min: number, max: number) =>
  z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().min(min).max(max));

async function fetchRoute(olat: number, olng: number, dlat: number, dlng: number): Promise<DirectionsRoute | null> {
  // The field mask header is mandatory (computeRoutes 400s without one) and
  // keeps the response to exactly what the app renders.
  const data = await googleJson('directions', 'https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': config.maps.serverKey,
      'X-Goog-FieldMask': 'routes.polyline.encodedPolyline,routes.duration,routes.distanceMeters',
    },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: olat, longitude: olng } } },
      destination: { location: { latLng: { latitude: dlat, longitude: dlng } } },
      travelMode: 'DRIVE',
    }),
  });

  const first = (
    data?.routes as Array<{
      polyline?: { encodedPolyline?: string };
      duration?: string;
      distanceMeters?: number;
    }> | undefined
  )?.[0];
  if (!first) {
    // googleJson already logged HTTP/timeout failures (data === null); a 200
    // with an empty routes array is logged here so a half-enabled Routes API
    // shows up in the Render logs.
    if (data) logGeoFailure('directions', 'no usable route in response');
    return null;
  }
  // Proto3 JSON omits default-valued scalars: a zero-length leg (pal at the
  // destination — the normal END of every tracked favor) can arrive as
  // duration '0s' with distanceMeters and even the polyline omitted. That is a
  // valid answer, not an operator failure — default the zeros instead of
  // degrading to null and crying wolf in the logs.
  const route: DirectionsRoute = {
    polyline: first.polyline?.encodedPolyline ?? '',
    durationSec: parseDurationSec(first.duration) ?? 0,
    distanceMeters: typeof first.distanceMeters === 'number' ? first.distanceMeters : 0,
  };
  return route;
}

geoRouter.get(
  '/directions',
  validate({
    query: z.object({
      olat: requiredCoord(-90, 90),
      olng: requiredCoord(-180, 180),
      dlat: requiredCoord(-90, 90),
      dlng: requiredCoord(-180, 180),
    }),
  }),
  asyncHandler(async (req, res) => {
    if (!config.maps.enabled) return res.json({ route: null });
    const { olat, olng, dlat, dlng } = validatedQuery<{
      olat: number; olng: number; dlat: number; dlng: number;
    }>(req);

    const cacheKey = `${olat.toFixed(4)},${olng.toFixed(4)}>${dlat.toFixed(4)},${dlng.toFixed(4)}`;
    const cached = directionsCacheGet(cacheKey);
    if (cached) return res.json({ route: cached });

    let flight = directionsInFlight.get(cacheKey);
    if (!flight) {
      flight = fetchRoute(olat, olng, dlat, dlng).finally(() => directionsInFlight.delete(cacheKey));
      directionsInFlight.set(cacheKey, flight);
    }
    const route = await flight;
    if (route) directionsCacheSet(cacheKey, route);
    return res.json({ route });
  }),
);
