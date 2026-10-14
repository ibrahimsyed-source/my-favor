// Forward geocoding: turn a typed street address into { lat, lng }.
//
// Goes through the SERVER's /api/geo proxy (server-side Google key) rather than
// calling Google from the device: the bundled EXPO_PUBLIC key is restricted to
// the Static Maps image API, so direct Geocoding calls were silently denied in
// production and every address fell back to the demo point. When the server has
// no key (local dev) or the lookup fails, we still fall back to a Miami-area
// point so pal-side distances stay realistic against the seeded/demo favors
// rather than landing every request hundreds of miles away.

import { geocodeServerApi } from '../api/endpoints';

export interface LatLng {
  lat: number;
  lng: number;
}

// Dev/demo fallback — the demo city (matches where the seeded favors are), so
// distance sorting stays meaningful when there's no key.
export const GEOCODE_FALLBACK: LatLng = { lat: 25.79, lng: -80.131 };

export async function geocodeAddress(address: string): Promise<LatLng> {
  const query = address.trim();
  if (!query) return { ...GEOCODE_FALLBACK };
  try {
    const { location } = await geocodeServerApi(query);
    if (location) return { lat: location.lat, lng: location.lng };
    return { ...GEOCODE_FALLBACK };
  } catch {
    return { ...GEOCODE_FALLBACK };
  }
}
