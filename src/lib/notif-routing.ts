import type { RootStackParamList } from '../navigation/types';
import type { Favor, User } from '../types';

// Shared notification-tap routing — used by BOTH the push-tap listener
// (navigation/index.tsx) and the in-app Activity list (screens/notifications.tsx)
// so the two can never drift. Kept in lib/ (not navigation/index.tsx) to avoid a
// circular import: navigation imports the notifications screen, which imports
// this.

export type NotificationSlots = {
  activeMemberFavor: Favor | null;
  activePalFavor: Favor | null;
  user: User | null;
};

export const LIVE_PAL_STATUSES = ['matched', 'enroute', 'arrived', 'in_progress'];

const palJobScreen = (f: Favor): keyof RootStackParamList =>
  f.status === 'arrived' || f.status === 'in_progress' ? 'PalFavorInProgress' : 'Navigation';

// Decide where a notification tap should land, given its data payload and the
// viewer's current active-favor slots. Every favor-lifecycle notification now
// carries a favorId, so this routes by WHICH active slot that favor lands in —
// deterministic regardless of which role the notification was for. The old code
// guessed from slots alone and fell through to History (the "Transactions
// page") for most types.
export function routeForNotificationTap(
  data: Record<string, unknown>,
  { activeMemberFavor, activePalFavor, user }: NotificationSlots,
): { name: keyof RootStackParamList; params?: object } | null {
  const favorId = typeof data.favorId === 'string' ? data.favorId : undefined;
  const palIsThis = !!favorId && activePalFavor?.id === favorId;
  const memberIsThis = !!favorId && activeMemberFavor?.id === favorId;
  switch (data.type) {
    case 'message':
      return typeof data.threadId === 'string'
        ? { name: 'MessageThread', params: { threadId: data.threadId } }
        : { name: 'Messages' };
    case 'new_favor':
      return favorId ? { name: 'PalFavorDetail', params: { favorId } } : { name: 'BrowseFavors' };
    case 'review':
      // A review you received → your own reviews list.
      return { name: 'MyReviews' };
    case 'almost_here':
      // Member-only "pal is close" — same destination as 'arrived': the member's
      // tracking screen for that favor.
      if (memberIsThis || activeMemberFavor) return { name: 'FavorTracking' };
      return { name: 'History' };
    case 'match':
    case 'arrived':
      if (palIsThis && LIVE_PAL_STATUSES.includes(activePalFavor!.status)) {
        return { name: palJobScreen(activePalFavor!) };
      }
      if (memberIsThis) return { name: 'FavorTracking' };
      // Fallbacks (favor not in a slot — rare after the listener's refreshActive):
      // prefer a live pal job, then the member's tracked favor.
      if (activePalFavor && LIVE_PAL_STATUSES.includes(activePalFavor.status)) {
        return { name: palJobScreen(activePalFavor) };
      }
      if (activeMemberFavor) return { name: 'FavorTracking' };
      if (activePalFavor?.status === 'pending_release') return { name: 'PalAwaitingRelease' };
      return { name: 'History' };
    case 'release_request':
      if (memberIsThis || activeMemberFavor?.status === 'pending_release') return { name: 'FavorTracking' };
      return { name: 'History' };
    case 'released':
      return { name: 'Earnings' };
    case 'cancellation':
    case 'no_pal':
      if (memberIsThis) return { name: 'FavorTracking' };
      return { name: 'History' };
    case 'offer':
      if (memberIsThis || activeMemberFavor?.status === 'requested') return { name: 'Searching' };
      if (user?.role === 'pal') {
        return favorId ? { name: 'PalFavorDetail', params: { favorId } } : { name: 'BrowseFavors' };
      }
      return { name: 'History' };
    default:
      return null; // 'general' / unknown — opening the app is enough
  }
}
