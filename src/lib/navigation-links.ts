// Turn-by-turn navigation handoff: open the device's native maps app aimed at
// the favor destination. Per-platform deep-link ladder, best rung first:
//
//   iOS      maps://?daddr=lat,lng        → https://maps.apple.com/?daddr=…
//   Android  google.navigation:q=lat,lng  → geo:lat,lng?q=lat,lng(label)
//   web (and fallback-of-fallbacks)       → Google Maps directions URL
//
// Each rung is attempted via Linking.openURL and the next rung is tried only
// when the attempt THREW (no handler / unsupported scheme). Returns false only
// when every attempt threw — callers show a small error state then instead of
// failing silently.

import { Linking, Platform } from 'react-native';

export async function openTurnByTurn(dest: { lat: number; lng: number; address?: string }): Promise<boolean> {
  const point = `${dest.lat},${dest.lng}`;
  // Plain https directions URL — any browser handles it, so it is the final
  // rung on every platform (and the only rung on web).
  const webFallback = `https://www.google.com/maps/dir/?api=1&destination=${point}`;
  // geo: label shown by Android map pickers next to the dropped pin.
  const label = encodeURIComponent(dest.address?.trim() || 'Favor location');
  const ladder =
    Platform.OS === 'ios'
      ? [`maps://?daddr=${point}`, `https://maps.apple.com/?daddr=${point}`, webFallback]
      : Platform.OS === 'android'
        ? [`google.navigation:q=${point}`, `geo:${point}?q=${point}(${label})`, webFallback]
        : [webFallback];
  for (const url of ladder) {
    try {
      await Linking.openURL(url);
      return true;
    } catch {
      /* this rung can't open on this device — try the next one down */
    }
  }
  return false;
}
