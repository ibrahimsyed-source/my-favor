// Web / non-native fallback. There is no device-GPS background streaming to do
// off-device, so these are no-ops. Native platforms use live-location.native.ts
// (Metro resolves the .native file first); this file keeps the import resolving
// and the types identical on web.

export const LIVE_LOCATION_TASK = 'mf-live-location';

export async function startLiveLocation(_favorId: string, _onDenied?: () => void): Promise<void> {
  /* no-op on web */
}

export async function stopLiveLocation(): Promise<void> {
  /* no-op on web */
}
