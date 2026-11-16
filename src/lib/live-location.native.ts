import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { ApiError } from '../api/client';
import { updateFavorLocationApi } from '../api/endpoints';

// Background-capable live location (NATIVE). The assigned pal streams GPS to the
// server so the member can watch them approach — crucially even while My Favor is
// in the BACKGROUND (phone locked, or the pal navigating in Apple Maps). The old
// foreground-only watchPositionAsync froze the member's map the instant the pal
// left the app.
//
// Mechanism: a module-scope TaskManager task (registered on import — before any
// update can fire, including an OS background relaunch) driving
// Location.startLocationUpdatesAsync, which keeps delivering in the background
// thanks to the iOS `location` UIBackgroundMode / Android foreground service
// declared in app.json. Metro resolves this file on native; web/other get the
// live-location.ts no-op.

export const LIVE_LOCATION_TASK = 'mf-live-location';

// The favor whose pal slot we're streaming for. Held in memory (fast, same JS
// context as the broadcasting effect) AND mirrored to storage so a background
// relaunch — where module state resets to its initial value — can recover it.
const LIVE_FAVOR_KEY = 'mf_live_favor_id';
let liveFavorId: string | null = null;

// Serialize start/stop so a favor→favor transition can't interleave them — React
// runs the previous effect's cleanup (stop) then the new effect (start) in that
// order, so chaining preserves it and the stream always ends in the right state
// (and a cleanup firing while a start is mid-flight can't leave an orphan task).
let opChain: Promise<void> = Promise.resolve();
function enqueue(op: () => Promise<void>): Promise<void> {
  opChain = opChain.then(op, op); // run next op regardless of a prior rejection
  return opChain;
}

// Register once at module scope. isTaskDefined guards a Fast Refresh re-import
// from redefining the task (which throws).
if (!TaskManager.isTaskDefined(LIVE_LOCATION_TASK)) {
  TaskManager.defineTask(LIVE_LOCATION_TASK, async ({ data, error }) => {
    if (error) return; // transient platform error — the next fix retries
    const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations;
    if (!locations || locations.length === 0) return;
    let favorId = liveFavorId;
    if (!favorId) {
      try { favorId = await AsyncStorage.getItem(LIVE_FAVOR_KEY); } catch { /* storage down */ }
    }
    if (!favorId) return; // not broadcasting (a stale tick after stop)
    // Only the freshest fix matters — the server keeps just the latest position.
    const { latitude, longitude } = locations[locations.length - 1].coords;
    try {
      // Reuses the authed API client: same in-memory access token + single-flight
      // refresh as the foreground pollers (the process stays alive via the iOS
      // background mode / Android foreground service, so it's one JS context). On
      // a cold background relaunch the in-memory token is null → the client's
      // refresh-on-401 mints a fresh one from the stored refresh token.
      await updateFavorLocationApi(favorId, latitude, longitude);
    } catch (e) {
      // A DEFINITIVE "this favor is no longer live" response — not found (404),
      // not the assigned pal (403), or not in a streaming status (409, the
      // server's "Not sharing location for this favor") — means we must stop. If
      // the favor ended while the app was KILLED, the only other stop path (the
      // foreground React effect) never runs, so without this the OS keeps the
      // background updates + the "sharing location" notification alive and we'd
      // keep POSTing until the pal reopens the app. Transient network/auth errors
      // (status 0, or a refresh that failed) are swallowed — the next fix retries
      // and the member's 2-min staleness rule covers the gap.
      if (e instanceof ApiError && (e.status === 403 || e.status === 404 || e.status === 409)) {
        void stopLiveLocation();
      }
    }
  });
}

// Start streaming for `favorId`. Foreground permission is REQUIRED (its absence
// is the one failure the pal can act on → onDenied). Background ("Always") is
// best-effort: without it iOS still streams while foregrounded (the prior
// behavior), so a denial degrades rather than breaks.
export function startLiveLocation(favorId: string, onDenied?: () => void): Promise<void> {
  return enqueue(async () => {
  try {
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') { onDenied?.(); return; }
    // Ask for Always so the stream survives the pal backgrounding the app. iOS
    // may defer this to a later "upgrade" prompt; either way we proceed.
    try { await Location.requestBackgroundPermissionsAsync(); } catch { /* ignore */ }

    liveFavorId = favorId;
    try { await AsyncStorage.setItem(LIVE_FAVOR_KEY, favorId); } catch { /* ignore */ }

    // Replace any stream a previous favor/session left running before starting.
    try {
      if (await Location.hasStartedLocationUpdatesAsync(LIVE_LOCATION_TASK)) {
        await Location.stopLocationUpdatesAsync(LIVE_LOCATION_TASK);
      }
    } catch { /* ignore */ }

    await Location.startLocationUpdatesAsync(LIVE_LOCATION_TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: 5000, // at most one fix / 5s…
      distanceInterval: 20, // …or every 20m of movement
      pausesUpdatesAutomatically: false, // keep streaming on a long drive (iOS)
      activityType: Location.LocationActivityType.AutomotiveNavigation, // driving (iOS)
      showsBackgroundLocationIndicator: true, // iOS blue bar while backgrounded
      foregroundService: {
        // Android requires a user-visible notification for background location.
        notificationTitle: 'Sharing your location with the member',
        notificationBody: 'My Favor shares your location while you complete this favor.',
        notificationColor: '#ED1C24',
      },
    });
  } catch {
    // Native module/permission subsystem unavailable — no-op (same soft degrade
    // as before); the member simply won't see a live position.
  }
  });
}

// Stop streaming and forget the target. Idempotent — safe to call when nothing is
// running (e.g. the broadcast effect re-running with no active favor).
export function stopLiveLocation(): Promise<void> {
  return enqueue(async () => {
  liveFavorId = null;
  try { await AsyncStorage.removeItem(LIVE_FAVOR_KEY); } catch { /* ignore */ }
  try {
    if (await Location.hasStartedLocationUpdatesAsync(LIVE_LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(LIVE_LOCATION_TASK);
    }
  } catch { /* ignore */ }
  });
}
