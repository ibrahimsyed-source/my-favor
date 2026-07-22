// Geo helpers for live favor tracking (member sees how far the pal is).

// Great-circle distance in miles between two lat/lng points (haversine).
export function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8; // Earth radius in miles
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Human label for a distance in miles: "0.3 miles away" style number+unit.
export function fmtMiles(miles: number): string {
  if (miles < 0.1) return '0.1 miles';
  const rounded = miles < 10 ? Math.round(miles * 10) / 10 : Math.round(miles);
  return `${rounded} ${rounded === 1 ? 'mile' : 'miles'}`;
}
