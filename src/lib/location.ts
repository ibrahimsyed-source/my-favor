// One-shot device position (asks for foreground permission on first use).
// Returns null whenever location isn't available — module absent (web),
// permission denied, GPS failure — so callers can quietly keep a fallback.
export async function getCurrentLocation(): Promise<{ lat: number; lng: number } | null> {
  try {
    const Location = await import('expo-location');
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return null;
  }
}

// Like getCurrentLocation but NEVER prompts: only reads a position when
// foreground permission was already granted elsewhere (ConfirmAddress asks at
// the contextual moment). Prefers the cached last-known fix so map backdrops
// center instantly without spinning up GPS.
export async function getKnownLocation(): Promise<{ lat: number; lng: number } | null> {
  try {
    const Location = await import('expo-location');
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const last = await Location.getLastKnownPositionAsync();
    if (last) return { lat: last.coords.latitude, lng: last.coords.longitude };
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return null;
  }
}
