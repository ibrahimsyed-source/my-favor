// Great-circle (haversine) distance helpers. Prisma/Postgres can't compute a
// haversine inside a query, so distance filtering happens in app code AFTER the
// DB fetch (see favor.routes.ts: broadcast fan-out + GET /incoming). Everything
// here is in miles, matching the pal-facing radius unit (User.palRadiusMiles).

const EARTH_RADIUS_MILES = 3958.8;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

// Straight-line (as-the-crow-flies) distance between two lat/lng points, miles.
export function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  // Clamp to 1 so floating error at antipodal-ish points can't NaN the asin.
  return EARTH_RADIUS_MILES * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Pal discovery radius bounds (miles). The DEFAULT lives in the schema
// (User.palRadiusMiles @default(25)); these gate the PATCH /me update.
export const PAL_RADIUS_MIN = 1;
export const PAL_RADIUS_MAX = 100;

// Straight-line distance (miles) under which the member gets the one-time
// "your Favor Pal is almost here" push. ~0.5mi ≈ a few minutes out by car.
export const NEAR_MILES = 0.5;
