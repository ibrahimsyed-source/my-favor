export type StopBroadcast = () => void;

// Streams the device's foreground location, invoking onUpdate(lat, lng) on each
// fix. Returns a stop function to end the stream. Degrades gracefully to a no-op
// whenever location isn't available — the native module is absent from the build
// (web / an Expo Go without it), permission is denied, or any error — so the app
// never crashes and the member simply doesn't see a live position.
export async function startLocationBroadcast(
  onUpdate: (lat: number, lng: number) => void,
): Promise<StopBroadcast> {
  try {
    // Dynamic import so a build lacking the native module can't break the JS
    // bundle at load; if it's missing this rejects and we return a no-op.
    const Location = await import('expo-location');
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return () => {};
    const sub = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 5000, // at most one fix every 5s
        distanceInterval: 20, // ...or after 20m of movement
      },
      (pos) => onUpdate(pos.coords.latitude, pos.coords.longitude),
    );
    return () => sub.remove();
  } catch {
    return () => {};
  }
}
