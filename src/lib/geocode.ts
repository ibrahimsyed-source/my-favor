// Forward geocoding: turn a typed street address into { lat, lng }.
//
// Uses the Google Maps Geocoding REST API, keyed by EXPO_PUBLIC_GOOGLE_MAPS_KEY
// (the same key the StaticMap/LiveMap components use). When the key is missing
// (local dev / demo builds) or the lookup fails, we fall back to a Miami-area
// point so pal-side distances stay realistic against the seeded/demo favors
// rather than landing every request hundreds of miles away.

export interface LatLng {
  lat: number;
  lng: number;
}

// Shape of the Google Geocoding response we actually read.
interface GeocodeResponse {
  status?: string;
  results?: Array<{ geometry?: { location?: { lat?: number; lng?: number } } }>;
}

const MAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY || '';

// Dev/demo fallback — the demo city (matches where the seeded favors are), so
// distance sorting stays meaningful when there's no key.
export const GEOCODE_FALLBACK: LatLng = { lat: 25.79, lng: -80.131 };

export async function geocodeAddress(address: string): Promise<LatLng> {
  const query = address.trim();
  if (!MAPS_KEY || !query) return { ...GEOCODE_FALLBACK };
  try {
    const url =
      'https://maps.googleapis.com/maps/api/geocode/json' +
      `?address=${encodeURIComponent(query)}&key=${MAPS_KEY}`;
    const res = await fetch(url);
    const json = (await res.json()) as GeocodeResponse;
    const loc = json.results?.[0]?.geometry?.location;
    if (json.status === 'OK' && loc && typeof loc.lat === 'number' && typeof loc.lng === 'number') {
      return { lat: loc.lat, lng: loc.lng };
    }
    // ZERO_RESULTS / REQUEST_DENIED / OVER_QUERY_LIMIT etc. — fall back.
    return { ...GEOCODE_FALLBACK };
  } catch {
    return { ...GEOCODE_FALLBACK };
  }
}
