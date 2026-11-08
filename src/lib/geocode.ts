// Forward geocoding: turn a typed street address into { lat, lng }.
//
// Goes through the SERVER's /api/geo proxy (server-side Google key) rather than
// calling Google from the device: the bundled EXPO_PUBLIC key is restricted to
// the Static Maps image API, so direct Geocoding calls were silently denied in
// production. Resolution failure — no match, server error, or no key — returns
// null: callers must surface the failure instead of pinning a favor to a
// made-up coordinate (which would send the pal and the live map to the wrong
// city under the member's real address text).

import { geocodeServerApi } from '../api/endpoints';

export interface LatLng {
  lat: number;
  lng: number;
}

// Default MAP CENTRE for screens with nothing better to centre on — the demo
// city (matches the seeded favors). Display-only: never a favor's coordinates.
export const GEOCODE_FALLBACK: LatLng = { lat: 25.79, lng: -80.131 };

export async function geocodeAddress(address: string): Promise<LatLng | null> {
  const query = address.trim();
  if (!query) return null;
  try {
    const { location } = await geocodeServerApi(query);
    return location ? { lat: location.lat, lng: location.lng } : null;
  } catch {
    return null;
  }
}
