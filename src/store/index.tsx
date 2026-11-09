import React, { createContext, useContext, useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import {
  User, Favor, FavorOffer, PaymentCard, Transaction, Thread, Message, AppNotification,
  Role, UserStatus, FavorTier, GeoPoint, FavorStatus, computePayout,
} from '../types';
import { setSession, clearSession, getStoredRefresh, getStoredUser, setStoredUser, ApiError, setOnSessionExpired, setOnAccountSuspended } from '../api/client';
import { startLocationBroadcast } from '../lib/location';
import { registerForPushNotificationsAsync } from '../lib/notifications';
import {
  signupApi, verifyOtpApi, loginApi, logoutApi, deleteAccountApi, changePasswordApi,
  getConfigApi, getMeApi, updateProfileApi, setRoleApi, verifyPalApi, setStatusApi, getPalsApi, getPalApi,
  updatePushTokenApi,
  createFavorApi, getFavorsApi, getActiveFavorApi, getFavorApi, getIncomingApi,
  acceptFavorApi, declineFavorApi, abandonFavorApi, assignPalApi, advanceFavorApi, updateFavorLocationApi, finishFavorApi, releaseFavorApi, cancelFavorApi, rateFavorApi, rateMemberApi,
  acceptOfferApi,
  getCardsApi, addCardApi, removeCardApi, getTransactionsApi, getEarningsApi, cashoutApi,
  getPaymentsConfigApi, createSetupCheckoutApi, syncCardsApi, connectOnboardApi, connectStatusApi,
  getThreadsApi, getMessagesApi, sendMessageApi, createThreadApi,
  getNotificationsApi, markNotificationReadApi, markAllNotificationsReadApi,
  reportUserApi, blockUserApi, unblockUserApi, getBlockedApi,
} from '../api/endpoints';

// ---------------------------------------------------------------------------
// Store — now backed by the real backend API (server/). The StoreValue
// interface is unchanged, so no screen had to change: synchronous mutators do
// an optimistic local update and persist in the background; collections are
// loaded from the API after auth. See src/api for the client + endpoints.
// ---------------------------------------------------------------------------

// Statuses that occupy a role slot and keep the 4s poll alive. Includes
// pending_release (work done, payment not yet released): the member must see
// the release ask appear and the pal must see the release land.
const ACTIVE = ['requested', 'matched', 'enroute', 'arrived', 'in_progress', 'pending_release'];
// LIVE subset — a favor still being worked. pending_release is excluded on
// purpose: finished work awaiting payment blocks neither a new member request
// nor new pal work (a new job simply replaces it in the slot).
const LIVE = ['requested', 'matched', 'enroute', 'arrived', 'in_progress'];
// Lifecycle order, used to drop stale poll responses that would rewind an
// optimistic local status advance. Terminal states share the top rank.
const STATUS_RANK: Record<FavorStatus, number> = {
  draft: 0, requested: 1, matched: 2, enroute: 3, arrived: 4, in_progress: 5,
  pending_release: 6, completed: 7, cancelled: 7, no_pal: 7,
};
// Statuses during which an assigned pal streams their live location to the member.
const PAL_BROADCAST_STATUSES = ['matched', 'enroute', 'arrived', 'in_progress'];

// Monotonic sequence for client-only notification ids so repeat inserts (e.g.
// reporting the same user twice) never collide on a React key.
let localSeq = 0;

// Pals come back as a reduced shape (no email/phone pre-match); widen to User
// for the existing screens, which only read display fields.
const asUser = (p: Partial<User>): User => ({
  id: p.id ?? '',
  firstName: p.firstName ?? '',
  lastName: p.lastName ?? '',
  email: p.email ?? '',
  phone: p.phone ?? '',
  avatar: p.avatar,
  bio: p.bio,
  city: p.city,
  state: p.state,
  zip: p.zip,
  homeAddress: p.homeAddress,
  role: (p.role as Role) ?? 'pal',
  status: (p.status as UserStatus) ?? 'online',
  rating: p.rating ?? 0,
  totalFavors: p.totalFavors ?? 0,
  yearsActive: p.yearsActive ?? 0,
  reliability: p.reliability ?? 0,
  positiveReviews: p.positiveReviews ?? 0,
});

// Normalize a GET /favors/active response into the two role slots. Falls back
// to deriving them from the legacy single `favor` field if the server predates
// the split (defensive — server and client ship together).
const splitActive = (
  res: { favor: Favor | null; memberFavor?: Favor | null; palFavor?: Favor | null },
  uid: string,
) => ({
  member: res.memberFavor !== undefined
    ? res.memberFavor
    : res.favor && res.favor.memberId === uid ? res.favor : null,
  pal: res.palFavor !== undefined
    ? res.palFavor
    : res.favor && res.favor.palId === uid ? res.favor : null,
});

interface StoreValue {
  // auth
  user: User | null;
  isAuthenticated: boolean;
  restoring: boolean; // true while the app is restoring a saved session on cold start
  // App-level gates surfaced by RootNavigator (config-driven + suspension).
  maintenance: boolean;
  updateRequired: boolean;
  suspended: boolean;
  recheckConfig: () => Promise<void>;
  signup: (data: Partial<User> & { password: string; ageAffirmed?: boolean; acceptedTerms?: boolean; dateOfBirth?: string }) => Promise<void>;
  verifyOtp: (code: string) => Promise<boolean>;
  submitVetting: (data: { legalFirstName: string; legalLastName: string; dateOfBirth: string; consent: boolean }) => Promise<'approved' | 'rejected' | 'error'>;
  login: (email: string, password: string) => Promise<'ok' | 'unverified' | 'invalid' | 'error' | 'suspended'>;
  // Fully sequenced sign-out: unregister the push token (best-effort), revoke
  // the refresh token, clear storage, THEN reset state — so a quick re-login
  // can never have its fresh session wiped by a trailing cleanup.
  logout: () => Promise<void>;
  // Honest result: only clears the session/state when the server confirmed the
  // deletion — false means the account is still live (surface an error).
  deleteAccount: () => Promise<boolean>;
  updateProfile: (patch: Partial<User>) => Promise<void>;
  changePassword: (current: string, next: string) => Promise<boolean>;
  // Optimistic with revert: false means the switch didn't stick server-side.
  setRole: (role: Role) => Promise<boolean>;
  setStatus: (status: UserStatus) => Promise<boolean>;

  // favors
  pals: User[];
  draftFavor: Partial<Favor> | null;
  setDraft: (patch: Partial<Favor>) => void;
  clearDraft: () => void;
  // Active favors are split by role: one account can have an open request (as
  // member) AND be fulfilling someone else's favor (as pal) at the same time —
  // the two slots are independent and never block each other.
  activeMemberFavor: Favor | null; // the caller's own open/in-flight request
  activePalFavor: Favor | null; // the favor the caller is fulfilling as a pal
  activePal: User | null; // the pal assigned to activeMemberFavor
  // Cross-user cancellation signals, raised by the poll when the OTHER side
  // ends the favor: palCanceled = my pal stepped back (my request reopened);
  // memberCanceled = the member cancelled the favor I was fulfilling. Screens
  // surface a notice, then clear the flag.
  palCanceled: boolean;
  clearPalCanceled: () => void;
  memberCanceled: boolean;
  // True when the pal denied location permission while assigned to a live favor
  // — the pal screens explain why the member can't see them approaching.
  locationDenied: boolean;
  clearMemberCanceled: () => void;
  palById: (id?: string) => User | undefined;
  history: Favor[];
  // One active request per member: pre-gated on an ACTIVE activeMemberFavor
  // (code 'active_exists' — screens surface a "VIEW CURRENT FAVOR" modal).
  // A missing confirmed location also returns ok:false with its own reason.
  requestFavor: () => Promise<{ ok: true; favor: Favor } | { ok: false; reason: string; code?: 'active_exists' }>;
  // Optimistic, but on API failure REVERTS the pal slot to the prior status
  // and returns false so the screen can surface the failed advance.
  advanceFavor: (status: FavorStatus) => Promise<boolean>;
  // Awaits the server BEFORE mutating state; success returns the server's
  // authoritative cancellation fee/refund. Failure leaves state untouched.
  cancelFavor: () => Promise<{ ok: boolean; fee?: number; refund?: number; reason?: string }>;
  // Awaits; success clears the slot + refreshes history; failure leaves state.
  rateFavor: (rating: number, feedback: string, tip?: number) => Promise<boolean>;
  // Member releases the payment on a finished (pending_release) favor — THIS is
  // when money moves, not at finish. Success returns the server's payout +
  // ledgerStatus and, when the member slot still holds that favor, swaps in the
  // completed record (the completed-unrated retention then shows the rating
  // prompt) and refreshes the ledgers; failure leaves state untouched and
  // returns the server's reason.
  releaseFavor: (favorId: string) => Promise<{ ok: boolean; payout?: number; ledgerStatus?: 'completed' | 'incomplete'; reason?: string }>;
  // pal side
  incomingFavors: Favor[];
  refreshIncoming: () => Promise<void>;
  // A pal's "accept" is a REQUEST at the listed price — the member must approve
  // the person before assignment, so success returns the pending offer (the
  // favor is NOT matched yet; the offer poll learns the member's decision).
  acceptFavor: (favorId: string) => Promise<{ ok: boolean; offer?: FavorOffer; reason?: string; code?: 'unavailable' | 'error' }>;
  // Accept the OTHER side's negotiated price (member accepting a pal's offer, or
  // a pal accepting the member's counter) — matches the favor at exactly `price`
  // (the number the user saw; the server 409s if the offer changed underneath).
  acceptOffer: (favorId: string, offerId: string, price: number) => Promise<{ ok: boolean; reason?: string }>;
  // Re-pull the active favor from the server (e.g. a pal learning their offer
  // was accepted while they had nothing active to poll on).
  refreshActive: () => Promise<Favor | null>;
  // On API failure the favor is restored into incomingFavors and false returned.
  declineFavor: (favorId: string) => Promise<boolean>;
  abandonFavor: () => Promise<boolean>;
  assignPal: (palId: string) => Promise<boolean>;
  // Awaits POST /finish. Finishing only marks the work done: success parks the
  // returned pending_release favor in the pal slot (nothing settles until the
  // member releases the payment) and returns a display-only payout computed
  // client-side; failure reconciles to server truth and returns ok:false with
  // the server's message.
  finishFavorAsPal: () => Promise<{ ok: boolean; awaitingRelease?: true; payout?: number; reason?: string }>;
  // Pal rates the member for a finished favor. Pass the favor id from the
  // navigation params (survives app restarts); null falls back to the favor
  // finished this session. Resolves false when nothing was persisted.
  rateMember: (favorId: string | null, rating: number, feedback: string) => Promise<boolean>;
  // moderation — all await the server; false means nothing was persisted.
  blockedUsers: string[];
  reportUser: (userId: string, reason?: string) => Promise<boolean>;
  blockUser: (userId: string) => Promise<boolean>;
  unblockUser: (userId: string) => Promise<boolean>;

  // payments
  cards: PaymentCard[];
  addCard: (card: Omit<PaymentCard, 'id' | 'isDefault'>) => Promise<PaymentCard>;
  removeCard: (id: string) => void;
  transactions: Transaction[];
  earnings: Transaction[];
  cashOut: () => Promise<number>; // pays out available balance, returns the amount
  // Stripe (hosted flow). When paymentsLive, cards are added via Stripe Checkout
  // and pals onboard payouts via Connect; otherwise the mock card form is used.
  paymentsLive: boolean;
  startAddCard: () => Promise<string | null>; // hosted card-setup URL, or null when mock
  syncCards: () => Promise<void>;
  connectOnboard: () => Promise<string | null>; // pal payout onboarding URL
  connectStatus: () => Promise<{ onboarded: boolean; payoutsEnabled: boolean }>;

  // messaging
  threads: Thread[];
  messagesFor: (threadId: string) => Message[];
  // Optimistic insert; a failed send stays in the thread flagged `failed: true`
  // ("Not delivered — tap to retry") instead of silently vanishing.
  sendMessage: (threadId: string, text: string) => void;
  // Re-send a message whose send failed (clears the flag while in flight).
  retrySendMessage: (messageId: string) => void;
  refreshMessages: (threadId: string) => Promise<void>;
  // Page further back through a thread's history ("Load earlier messages"):
  // fetches the page before the oldest loaded message and merges it in.
  // Resolves true when a page arrived (more history may exist).
  loadEarlierMessages: (threadId: string) => Promise<boolean>;
  refreshThreads: () => Promise<void>;
  openThreadWith: (userId: string) => Promise<string | null>; // get/create a thread, returns its id

  // notifications
  notifications: AppNotification[];
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  refreshNotifications: () => Promise<void>;
}

const StoreContext = createContext<StoreValue | null>(null);

// This build's version — kept in sync with app.json's expo.version. Compared
// against the server's minVersion to decide if a forced update is required.
const APP_VERSION = '1.0.0';

// Returns true if version `a` is strictly lower than `b` (numeric, dot-separated,
// missing parts treated as 0). Non-numeric/garbage inputs never force an update.
function versionLt(a: string, b: string): boolean {
  const pa = a.split('.').map((n) => parseInt(n, 10));
  const pb = b.split('.').map((n) => parseInt(n, 10));
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (Number.isNaN(x) || Number.isNaN(y)) return false;
    if (x !== y) return x < y;
  }
  return false;
}

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [restoring, setRestoring] = useState(true);
  // App-level gates driven by GET /api/config + the suspended signal.
  const [maintenance, setMaintenance] = useState(false);
  const [updateRequired, setUpdateRequired] = useState(false);
  const [suspended, setSuspended] = useState(false);
  const [pendingDest, setPendingDest] = useState<string | null>(null);
  const [draftFavor, setDraftFavor] = useState<Partial<Favor> | null>(null);
  const [memberFavor, setMemberFavor] = useState<Favor | null>(null);
  const [palFavor, setPalFavor] = useState<Favor | null>(null);
  const [palCanceled, setPalCanceled] = useState(false);
  const [memberCanceled, setMemberCanceled] = useState(false);
  const [locationDenied, setLocationDenied] = useState(false);
  const [history, setHistory] = useState<Favor[]>([]);
  const [incomingFavors, setIncomingFavors] = useState<Favor[]>([]);
  const [cards, setCards] = useState<PaymentCard[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [earnings, setEarnings] = useState<Transaction[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<string[]>([]);
  const [pals, setPals] = useState<User[]>([]);
  const [paymentsLive, setPaymentsLive] = useState(false);

  // Keep a ref of pals so the poll loop can dedupe without re-subscribing.
  const palsRef = useRef<User[]>([]);
  palsRef.current = pals;
  // Slot refs so async poll callbacks read fresh values without re-subscribing.
  const memberFavorRef = useRef<Favor | null>(null);
  memberFavorRef.current = memberFavor;
  const palFavorRef = useRef<Favor | null>(null);
  palFavorRef.current = palFavor;
  // Timestamp of the last server-CONFIRMED local favor write. A poll response
  // whose request STARTED before this moment is a stale snapshot of the world
  // (e.g. captured mid-accept) and is skipped wholesale — without this, a stale
  // 'requested' echo right after accepting an offer would read as "my pal
  // canceled" and rewind the match.
  const lastFavorWriteRef = useRef(0);
  // Same idea for the open-favors FEED: a snapshot requested before a local
  // feed write (swipe-decline) must not clobber it when it resolves late.
  const lastIncomingWriteRef = useRef(0);
  // Remember the favor a pal just finished, so the post-completion screen can
  // submit the pal's rating of the member for the right favor — and so the poll
  // never mistakes OUR OWN in-flight finish for a member cancellation.
  const lastFinishedRef = useRef<string | null>(null);
  // Session epoch, bumped by resetState. Every bulk loader captures it at start
  // and discards its results if it changed — an in-flight loader for a logged-
  // out account can never repopulate (or clobber) the next session's state.
  const sessionEpochRef = useRef(0);

  const mergePal = useCallback((p: User) => {
    setPals((list) => (list.find((x) => x.id === p.id) ? list : [...list, p]));
  }, []);

  // ---- bulk loaders ----
  const loadAll = useCallback(async (u: User) => {
    // Every account can both request and fulfill favors, so the open-favors
    // board is loaded for everyone (the API excludes the caller's own favors).
    const epoch = sessionEpochRef.current;
    const [favors, active, cardList, txns, earn, thr, notes, palList, blocked, incoming, payCfg] =
      await Promise.allSettled([
        getFavorsApi(), getActiveFavorApi(), getCardsApi(), getTransactionsApi(), getEarningsApi(),
        getThreadsApi(), getNotificationsApi(), getPalsApi(), getBlockedApi(),
        getIncomingApi(),
        getPaymentsConfigApi(),
      ]);
    if (epoch !== sessionEpochRef.current) return; // session changed mid-flight — stale data

    if (favors.status === 'fulfilled') setHistory(favors.value.favors);
    if (active.status === 'fulfilled') {
      const { member, pal } = splitActive(active.value, u.id);
      setMemberFavor(member);
      setPalFavor(pal);
    }
    if (cardList.status === 'fulfilled') setCards(cardList.value.cards);
    if (txns.status === 'fulfilled') setTransactions(txns.value.transactions);
    if (earn.status === 'fulfilled') setEarnings(earn.value.earnings);
    if (notes.status === 'fulfilled') setNotifications(notes.value.notifications);
    if (palList.status === 'fulfilled') setPals(palList.value.pals.map(asUser));
    if (blocked.status === 'fulfilled') setBlockedUsers(blocked.value.blocked);
    if (incoming.status === 'fulfilled') setIncomingFavors(incoming.value.favors);
    if (payCfg.status === 'fulfilled') setPaymentsLive(payCfg.value.stripeEnabled);
    if (thr.status === 'fulfilled') {
      setThreads(thr.value.threads);
      // Deliberately NO bulk message prefetch: the server GET clears the viewer's
      // unread counter as a side effect, so prefetching every thread at login
      // silently wiped all unread badges. MessageThread fetches on open instead.
    }
  }, []);

  const resetState = useCallback(() => {
    sessionEpochRef.current += 1; // invalidate every in-flight loader for the old session
    lastFavorWriteRef.current = 0;
    lastFinishedRef.current = null;
    setUser(null); setPendingDest(null); setDraftFavor(null);
    setMemberFavor(null); setPalFavor(null); setPalCanceled(false); setMemberCanceled(false);
    setHistory([]); setIncomingFavors([]); setCards([]); setTransactions([]); setEarnings([]);
    setThreads([]); setMessages([]); setNotifications([]); setBlockedUsers([]); setPals([]);
    setSuspended(false); // clear the gate so another account can sign in
  }, []);

  // If the API client hard-loses the session mid-flight (a refresh token is
  // rejected — e.g. after a password change revokes all tokens), clear user
  // state so isAuthenticated flips false and the navigator returns to Login,
  // instead of stranding a tokenless "zombie" authenticated shell.
  useEffect(() => {
    setOnSessionExpired(() => resetState());
    // A mid-session suspension gates the app to the Account Suspended screen.
    setOnAccountSuspended(() => setSuspended(true));
    return () => { setOnSessionExpired(null); setOnAccountSuspended(null); };
  }, [resetState]);

  // Fetch the public app config: maintenance mode and the minimum supported
  // version. Best-effort — a failure just leaves the app ungated. Exposed so the
  // Maintenance screen's "Check again" can re-poll.
  const recheckConfig = useCallback(async () => {
    try {
      const cfg = await getConfigApi();
      setMaintenance(!!cfg.maintenance);
      setUpdateRequired(!!cfg.minVersion && versionLt(APP_VERSION, cfg.minVersion));
    } catch {
      /* offline / server down → no gate; OfflineBanner covers connectivity */
    }
  }, []);
  useEffect(() => { void recheckConfig(); }, [recheckConfig]);

  // ---- session bootstrap (restore on app start) ----
  useEffect(() => {
    (async () => {
      try {
        const [refresh, cached] = await Promise.all([getStoredRefresh(), getStoredUser<User>()]);
        if (!refresh) return; // no saved session → show onboarding/login
        // Show the app IMMEDIATELY using the cached user, so returning users
        // never flash the login screen while the network confirms.
        if (cached) setUser(cached);
      } finally {
        setRestoring(false);
      }

      if (!(await getStoredRefresh())) return;
      try {
        // No access token in memory yet → this 401s, the client refreshes using
        // the stored refresh token, and retries.
        const { user: u } = await getMeApi();
        setUser(u);
        await setStoredUser(u);
        await loadAll(u);
      } catch (e) {
        // Only a genuine auth failure (the refresh token itself was rejected,
        // surfaced as a 401 after refresh) signs the user out. A network/timeout/
        // 5xx (e.g. a Render free-tier cold start) is transient: keep the saved
        // session so a later action — or the next launch — simply retries.
        if (e instanceof ApiError && e.status === 401) {
          await clearSession();
          setUser(null);
        }
      }
    })();
  }, [loadAll]);

  // ---- live updates: poll the active favors (both role slots in one GET) so
  // each side sees the other's progress — and the other's CANCELLATION — without
  // a manual refresh. ----
  useEffect(() => {
    const memberActive = !!memberFavor && ACTIVE.includes(memberFavor.status);
    const palActive = !!palFavor && ACTIVE.includes(palFavor.status);
    if (!user || (!memberActive && !palActive)) return;
    const uid = user.id;
    const id = setInterval(async () => {
      try {
        const startedAt = Date.now();
        const epoch = sessionEpochRef.current;
        const res = await getActiveFavorApi();
        // A response whose request started before the last confirmed local write
        // is a stale snapshot of the world — skip it; the next tick is fresh.
        // Likewise discard a tick that outlived its session (logout mid-flight).
        if (startedAt <= lastFavorWriteRef.current || epoch !== sessionEpochRef.current) return;
        const { member: mf, pal: pf } = splitActive(res, uid);

        // -- member slot (my own request) --
        const curM = memberFavorRef.current;
        if (!mf) {
          // A completed-but-unrated favor is parked locally until rated — the
          // server's active set never includes it, so an empty slot must not
          // clobber it (the rating prompt would vanish).
          if (curM && curM.status !== 'completed') {
            // Left the active set: the pal completed it (surface the final record
            // so tracking can prompt a rating) or it ended some other way.
            try {
              const { favor: final } = await getFavorApi(curM.id);
              if (epoch !== sessionEpochRef.current) return;
              setMemberFavor(final && final.status === 'completed' ? final : null);
            } catch { setMemberFavor(null); }
          }
        } else if (
          curM && curM.id === mf.id &&
          !['completed', 'cancelled', 'no_pal'].includes(mf.status) &&
          STATUS_RANK[mf.status] < STATUS_RANK[curM.status]
        ) {
          // A status DOWNGRADE. Exactly one downgrade is real: the assigned pal
          // stepped back and the favor reopened (matched -> requested with palId
          // cleared). Apply it and raise the "your pal canceled" notice so the
          // member returns to searching. Any other downgrade is a stale echo of
          // an optimistic local update — keep the local favor.
          if (mf.status === 'requested' && !mf.palId && curM.palId) {
            setMemberFavor(mf);
            setPalCanceled(true);
          }
        } else if (
          curM && curM.id !== mf.id &&
          curM.status === 'completed' && mf.status === 'pending_release'
        ) {
          // The server's pending_release FALLBACK must not clobber a locally
          // parked completed-unrated favor (the rating prompt). The parked one
          // wins until rated; the pending_release favor returns on the tick
          // after rateFavor clears the slot.
        } else {
          setMemberFavor(mf);
          if (mf.status !== 'requested') setPalCanceled(false); // matched again — notice is moot
          if (mf.palId && !palsRef.current.find((p) => p.id === mf.palId)) {
            try {
              const { pal } = await getPalApi(mf.palId);
              mergePal(asUser(pal));
            } catch { /* ignore */ }
          }
        }

        // -- pal slot (the favor I'm fulfilling) --
        const curP = palFavorRef.current;
        // A LIVE job can also vanish by being REPLACED: the server's slot falls
        // back to an older pending_release favor when the live job ends, so a
        // non-null pf with a different id is still "my live job is gone" when
        // what came back is only parked finished work. Same cancel notice.
        const liveJobGone =
          curP &&
          ['matched', 'enroute', 'arrived', 'in_progress'].includes(curP.status) &&
          pf != null && pf.id !== curP.id && pf.status === 'pending_release';
        if (!pf || liveJobGone) {
          // The favor left my pal slot without MY doing (my own finish/abandon
          // clears it locally first): the member cancelled. Clear/replace the
          // slot and raise the notice so the in-progress screens show a canceled
          // state instead of ghost "I'M HERE"/"CANCEL" buttons. NOT a
          // cancellation when WE finished it — a tick racing our own in-flight
          // /finish must not flash "the member canceled" over a success screen.
          if (curP) {
            setPalFavor(pf ?? null);
            if (curP.id !== lastFinishedRef.current) setMemberCanceled(true);
          }
        } else if (
          curP && curP.id === pf.id &&
          !['completed', 'cancelled', 'no_pal'].includes(pf.status) &&
          STATUS_RANK[pf.status] < STATUS_RANK[curP.status]
        ) {
          // Stale echo of an optimistic advance (e.g. arrived) — keep local.
        } else {
          setPalFavor(pf);
        }
      } catch { /* ignore transient errors */ }
    }, 4000);
    return () => clearInterval(id);
  }, [user, memberFavor, palFavor, mergePal]);

  // ---- live updates: when THIS user is the assigned pal of an in-flight favor,
  // stream their device GPS to the server so the member can watch them approach.
  // Derived from stable fields (not the activeFavor object) so the 4s poll above,
  // which swaps in a fresh favor object each tick, doesn't restart the GPS watch. ----
  // Role-independent on purpose: being the ASSIGNED PAL of the favor is what
  // obligates streaming — flipping the UI toggle back to member mid-favor must
  // not blind the member's live map.
  const palBroadcastFavorId =
    user && palFavor && PAL_BROADCAST_STATUSES.includes(palFavor.status)
      ? palFavor.id
      : null;
  useEffect(() => {
    if (!palBroadcastFavorId) return;
    let stop: (() => void) | undefined;
    let cancelled = false;
    setLocationDenied(false);
    void startLocationBroadcast(
      (lat, lng) => {
        // Fire-and-forget; a rejected update (favor ended, permission lost) just
        // means the next tick won't post — the member's poll handles staleness.
        void updateFavorLocationApi(palBroadcastFavorId, lat, lng).catch(() => undefined);
      },
      // Permission denied: surface it so the pal screens can explain why the
      // member can't see them approaching (instead of a silent dead map).
      () => { if (!cancelled) setLocationDenied(true); },
    ).then((s) => {
      if (cancelled) s();
      else stop = s;
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [palBroadcastFavorId]);

  // Register this device for push notifications once a user is authenticated
  // (native only — web has no push token). Best-effort and keyed on the user id
  // so it runs once per signed-in account; the token is saved to their profile.
  useEffect(() => {
    if (!user || Platform.OS === 'web') return;
    void registerForPushNotificationsAsync();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const palById = useCallback((id?: string) => (id ? pals.find((p) => p.id === id) : undefined), [pals]);

  // ---- auth ----
  const signup = useCallback(async (
    data: Partial<User> & { password: string; ageAffirmed?: boolean; acceptedTerms?: boolean; dateOfBirth?: string },
  ) => {
    const res = await signupApi({
      firstName: data.firstName ?? '', lastName: data.lastName ?? '',
      email: (data.email ?? '').toLowerCase(), phone: data.phone ?? '',
      password: data.password, ...(data.role ? { role: data.role } : {}),
      // Compliance: the server requires an explicit 18+ affirmation + terms
      // acceptance; the signup screen collects both before calling this.
      ageAffirmed: data.ageAffirmed === true,
      acceptedTerms: data.acceptedTerms === true,
      ...(data.dateOfBirth ? { dateOfBirth: data.dateOfBirth } : {}),
    });
    setPendingDest(res.destination);
    // In development the server returns the OTP so testing needs no SMS provider.
    if (res.devCode) console.log(`[dev OTP] ${res.devCode}`);
  }, []);

  // Submit the pal vetting application (Driver Information). On success the user
  // becomes palVerified, unlocking favor acceptance. Returns true on success.
  const submitVetting = useCallback(async (data: {
    legalFirstName: string; legalLastName: string; dateOfBirth: string; consent: boolean;
  }): Promise<'approved' | 'rejected' | 'error'> => {
    try {
      const { user: u } = await verifyPalApi(data);
      setUser(u);
      await setStoredUser(u);
      return u.palVerified ? 'approved' : 'rejected';
    } catch {
      return 'error';
    }
  }, []);

  const verifyOtp = useCallback(async (code: string) => {
    if (!pendingDest) return false;
    try {
      const session = await verifyOtpApi(pendingDest, code);
      await setSession(session);
      setUser(session.user);
      await setStoredUser(session.user);
      setPendingDest(null);
      await loadAll(session.user);
      return true;
    } catch {
      return false;
    }
  }, [pendingDest, loadAll]);

  const login = useCallback(async (email: string, password: string): Promise<'ok' | 'unverified' | 'invalid' | 'error' | 'suspended'> => {
    try {
      const session = await loginApi(email.toLowerCase(), password);
      await setSession(session);
      setUser(session.user);
      await setStoredUser(session.user);
      await loadAll(session.user);
      return 'ok';
    } catch (e: any) {
      // A suspended account (distinct 403 code) gates to the Account Suspended
      // screen rather than looking like a wrong password.
      if (e?.code === 'account_suspended') {
        setSuspended(true);
        return 'suspended';
      }
      // Unverified accounts get a fresh code from the server; tell the screen to
      // route to OTP (pendingDest is what verifyOtp() will confirm).
      if (e?.status === 403) {
        setPendingDest(email.toLowerCase());
        return 'unverified';
      }
      // Only a genuine bad-credential 401 means the email/password was wrong.
      if (e?.status === 401) return 'invalid';
      // Everything else (network_error status 0, >=500 cold starts, 429 rate
      // limits) is a transport/server failure — don't blame the user's creds.
      return 'error';
    }
  }, [loadAll]);

  const logout = useCallback(async () => {
    // Unregister the device's push token FIRST (best-effort, needs the session):
    // otherwise this account's pushes — including private message previews —
    // keep landing on a device its owner no longer controls.
    await updatePushTokenApi(null).catch(() => undefined);
    const refresh = await getStoredRefresh();
    if (refresh) await logoutApi(refresh).catch(() => undefined);
    // AWAIT the storage wipe before resetting state (which flips the navigator
    // to Login) — a quick re-login can then never race a trailing clearSession
    // that would delete ITS freshly-stored tokens.
    await clearSession();
    resetState();
  }, [resetState]);

  const deleteAccount = useCallback(async (): Promise<boolean> => {
    // Only sign out once the server CONFIRMED the deletion — wiping the session
    // on a failed call would fake the "account deleted" outcome while the
    // account is still fully live.
    try {
      await deleteAccountApi();
    } catch {
      return false;
    }
    await clearSession();
    resetState();
    return true;
  }, [resetState]);

  const updateProfile = useCallback(async (patch: Partial<User>) => {
    const { user: u } = await updateProfileApi(patch);
    setUser(u);
    await setStoredUser(u);
  }, []);

  const changePassword = useCallback(async (current: string, next: string) => {
    try {
      // The server revokes every session on a password change but returns a
      // fresh pair for THIS device — persist it, otherwise this device keeps its
      // now-revoked refresh token and 401s into a zombie session ~15m later.
      const res = await changePasswordApi(current, next);
      if (res.accessToken && res.refreshToken) {
        await setSession({ accessToken: res.accessToken, refreshToken: res.refreshToken });
      }
      return true;
    } catch {
      return false;
    }
  }, []);

  const setRole = useCallback(async (role: Role): Promise<boolean> => {
    const prev = user?.role;
    setUser((u) => (u ? { ...u, role } : u)); // optimistic
    try {
      const { user: u } = await setRoleApi(role);
      setUser(u);
      await setStoredUser(u); // persist, so a cold start restores the right role
      await loadAll(u);
      return true;
    } catch {
      // Revert so the dashboard can't diverge from the server's role.
      if (prev) setUser((u) => (u ? { ...u, role: prev } : u));
      return false;
    }
  }, [user, loadAll]);

  const setStatus = useCallback(async (status: UserStatus): Promise<boolean> => {
    const prev = user?.status;
    setUser((u) => (u ? { ...u, status } : u)); // optimistic
    try {
      const { user: u } = await setStatusApi(status);
      setUser(u);
      await setStoredUser(u);
      return true;
    } catch {
      if (prev) setUser((u) => (u ? { ...u, status: prev } : u));
      return false;
    }
  }, [user]);

  // ---- favors ----
  const setDraft = useCallback((patch: Partial<Favor>) => setDraftFavor((d) => ({ ...d, ...patch })), []);
  const clearDraft = useCallback(() => setDraftFavor(null), []);

  const requestFavor = useCallback(async (): Promise<
    { ok: true; favor: Favor } | { ok: false; reason: string; code?: 'active_exists' }
  > => {
    // One LIVE request per member (the UI has exactly one member slot): a
    // still-live favor must be finished or cancelled first. A parked
    // completed-unrated favor doesn't count — it's just awaiting a rating —
    // and neither does a pending_release one: the work is done, and releasing
    // the payment needn't block the next favor.
    const cur = memberFavorRef.current;
    if (cur && LIVE.includes(cur.status)) {
      return {
        ok: false,
        reason: 'Finish or cancel your current favor before requesting another.',
        code: 'active_exists',
      };
    }
    const d = draftFavor ?? {};
    const tier = (d.tier as FavorTier) ?? 'tiny';
    // A real confirmed location is REQUIRED — a favor silently pinned to a demo
    // coordinate would send the pal (and the live map) to the wrong city. The
    // request flow guarantees one via ConfirmAddress before this is callable.
    const location = d.location as GeoPoint | undefined;
    if (!location || typeof location.lat !== 'number') {
      return { ok: false, reason: 'Please confirm the favor location before requesting.' };
    }
    try {
      const { favor } = await createFavorApi({
        tier,
        ...(d.price != null ? { price: d.price } : {}),
        description: d.description ?? '',
        images: d.images ?? [],
        location,
        ...(d.scheduledFor != null ? { scheduledFor: d.scheduledFor } : {}),
        ...(d.hours != null ? { hours: d.hours } : {}),
      });
      setMemberFavor(favor);
      setPalCanceled(false); // a stale "your pal canceled" notice never applies to a new favor
      lastFavorWriteRef.current = Date.now();
      setDraftFavor(null); // clear the draft so the next favor starts fresh
      void getFavorsApi().then(({ favors }) => setHistory(favors)).catch(() => undefined);
      return { ok: true, favor };
    } catch (e: any) {
      // The server enforces the same one-active-favor rule with a 409.
      if (e?.status === 409) return { ok: false, reason: e?.message || 'Finish or cancel your current favor before requesting another.', code: 'active_exists' };
      return { ok: false, reason: e?.message || 'Could not request this favor. Please try again.' };
    }
  }, [draftFavor]);

  const advanceFavor = useCallback(async (status: FavorStatus): Promise<boolean> => {
    const id = palFavor?.id;
    const prevStatus = palFavor?.status;
    if (!id || !prevStatus) return false; // no favor to advance (e.g. the member just cancelled it)
    setPalFavor((f) => (f ? { ...f, status } : f)); // optimistic
    if (!['enroute', 'arrived', 'in_progress'].includes(status)) return true; // local-only stage
    try {
      const { favor } = await advanceFavorApi(id, status);
      setPalFavor(favor);
      lastFavorWriteRef.current = Date.now();
      return true;
    } catch {
      // Revert to the prior status — leaving the UI ahead of the server would
      // strand the member unnotified and make the eventual finish 409.
      setPalFavor((f) => (f && f.id === id ? { ...f, status: prevStatus } : f));
      return false;
    }
  }, [palFavor]);

  const cancelFavor = useCallback(async (): Promise<{ ok: boolean; fee?: number; refund?: number; reason?: string }> => {
    const id = memberFavor?.id;
    if (!id) return { ok: false, reason: 'No active favor to cancel.' };
    // Server-confirmed BEFORE any state change: the quoted fee can be stale (the
    // pal may have advanced in the poll gap), so the modal must confirm the
    // server's authoritative number — and a failed cancel leaves state untouched
    // (the favor is still live; a pal may be en route).
    try {
      const { favor, cancellation } = await cancelFavorApi(id);
      lastFavorWriteRef.current = Date.now();
      setMemberFavor(null);
      setPalCanceled(false);
      setHistory((h) => [favor, ...h.filter((x) => x.id !== favor.id)]);
      void Promise.all([getFavorsApi(), getTransactionsApi()])
        .then(([f, t]) => { setHistory(f.favors); setTransactions(t.transactions); })
        .catch(() => undefined);
      return { ok: true, fee: cancellation.fee, refund: cancellation.refund };
    } catch (e: any) {
      return { ok: false, reason: e?.message || 'Could not cancel this favor. Please try again.' };
    }
  }, [memberFavor]);

  const rateFavor = useCallback(async (rating: number, feedback: string, tip?: number): Promise<boolean> => {
    const f = memberFavor;
    if (!f) return false;
    // Server-confirmed: a failed rating/tip must leave the favor parked so the
    // user can retry, not silently strand it as "rated" with an uncharged tip.
    try {
      const { favor } = await rateFavorApi(f.id, { rating, feedback: feedback ?? '', ...(tip ? { tip } : {}) });
      lastFavorWriteRef.current = Date.now();
      setMemberFavor(null);
      setHistory((h) => [favor, ...h.filter((x) => x.id !== favor.id)]);
      void getFavorsApi().then(({ favors }) => setHistory(favors)).catch(() => undefined);
      return true;
    } catch {
      return false;
    }
  }, [memberFavor]);

  // Re-fetch the open-favors feed (pull-to-refresh / focus on the browse list).
  const refreshIncoming = useCallback(async () => {
    if (!user) return;
    const epoch = sessionEpochRef.current;
    const startedAt = Date.now();
    try {
      const { favors } = await getIncomingApi();
      if (epoch !== sessionEpochRef.current) return;
      // A snapshot requested BEFORE a local feed write (a swipe-decline's
      // optimistic removal) predates it server-side too — applying it would
      // resurrect the just-swiped card for a poll cycle.
      if (startedAt <= lastIncomingWriteRef.current) return;
      setIncomingFavors(favors);
    } catch {
      /* ignore transient errors */
    }
  }, [user]);

  // Keep the open-favors feed fresh app-wide (any signed-in user can browse and
  // accept favors to do) so the Home card + browse board reflect new requests.
  useEffect(() => {
    if (!user) return;
    const id = setInterval(() => { void refreshIncoming(); }, 20000);
    return () => clearInterval(id);
  }, [user, refreshIncoming]);

  const acceptFavor = useCallback(async (favorId: string): Promise<{ ok: boolean; offer?: FavorOffer; reason?: string; code?: 'unavailable' | 'error' }> => {
    // One JOB at a time: only a LIVE favor the user is FULFILLING blocks
    // accepting another. Their own open request (member slot) never does —
    // requesting and fulfilling are independent roles — and neither does a
    // pending_release favor (finished work awaiting the member's release; the
    // new job replaces it in the slot server-side).
    if (palFavor && LIVE.includes(palFavor.status)) {
      return { ok: false, reason: 'You already have an active favor. Finish it before accepting another.' };
    }
    try {
      // Not a match: the server records the pal's request as a list-price offer
      // and the MEMBER approves the person. The favor stays on the board and in
      // the pal slot nothing changes until the offer poll sees 'accepted'.
      const { offer } = await acceptFavorApi(favorId);
      return { ok: true, offer };
    } catch (e: any) {
      // Refresh the feed so a favor that just closed disappears promptly.
      void getIncomingApi().then(({ favors }) => setIncomingFavors(favors)).catch(() => undefined);
      // 404 = deleted outright; a 409 carries a specific reason (no longer
      // available / declined at this price / finish your active favor) that the
      // sheet shows verbatim.
      return {
        ok: false,
        reason: e?.message || 'This favor is no longer available.',
        code: e?.status === 404 ? 'unavailable' : 'error',
      };
    }
  }, [palFavor]);

  const acceptOffer = useCallback(async (favorId: string, offerId: string, price: number): Promise<{ ok: boolean; reason?: string }> => {
    // A member accepting an offer ON their own favor is always allowed; a pal
    // accepting the member's counter needs a pal slot with no LIVE job (one job
    // at a time — a pending_release favor doesn't block; the new job replaces it).
    const memberSide = memberFavor?.id === favorId;
    if (!memberSide && palFavor && LIVE.includes(palFavor.status)) {
      return { ok: false, reason: 'You already have an active favor. Finish it before accepting another.' };
    }
    try {
      const { favor } = await acceptOfferApi(favorId, offerId, price);
      setIncomingFavors((list) => list.filter((x) => x.id !== favorId));
      if (favor.memberId === user?.id) {
        setMemberFavor(favor);
        setPalCanceled(false);
      } else {
        setPalFavor(favor);
        setMemberCanceled(false);
      }
      lastFavorWriteRef.current = Date.now();
      return { ok: true };
    } catch (e: any) {
      return { ok: false, reason: e?.message || 'This offer is no longer available.' };
    }
  }, [memberFavor, palFavor, user]);

  const refreshActive = useCallback(async (): Promise<Favor | null> => {
    try {
      const startedAt = Date.now();
      const epoch = sessionEpochRef.current;
      const res = await getActiveFavorApi();
      // Same stale-snapshot rules as the 4s poll: a response whose request
      // started before the last confirmed local write (or that outlived its
      // session) must not clobber fresh state — e.g. a favor confirmed while
      // this GET was in flight.
      if (startedAt <= lastFavorWriteRef.current || epoch !== sessionEpochRef.current) {
        return palFavorRef.current ?? memberFavorRef.current;
      }
      const { member, pal } = splitActive(res, user?.id ?? '');
      // Preserve a completed-but-unrated member favor: it's parked locally to
      // drive the rating prompt and the server's active set never includes it.
      const curM = memberFavorRef.current;
      setMemberFavor(!member && curM?.status === 'completed' ? curM : member);
      setPalFavor(pal);
      // Callers use this to learn about a remotely-started job (e.g. an offer
      // the member accepted) — the pal-side favor is the interesting one.
      return pal ?? member;
    } catch {
      return null;
    }
  }, [user]);

  const declineFavor = useCallback(async (favorId: string): Promise<boolean> => {
    const prev = incomingFavors.find((x) => x.id === favorId);
    setIncomingFavors((list) => list.filter((x) => x.id !== favorId)); // optimistic
    lastIncomingWriteRef.current = Date.now(); // in-flight feed snapshots are now stale
    try {
      await declineFavorApi(favorId);
      lastIncomingWriteRef.current = Date.now();
      return true;
    } catch {
      // Nothing was persisted — restore the favor so the dismissal isn't
      // silently dropped (the next feed refresh would resurrect it anyway).
      if (prev) setIncomingFavors((list) => (list.find((x) => x.id === favorId) ? list : [prev, ...list]));
      return false;
    }
  }, [incomingFavors]);

  // A pal steps back from an accepted favor: it returns to the open board and
  // the member's request lives on (never stranded). Clears the pal's active slot.
  const abandonFavor = useCallback(async (): Promise<boolean> => {
    const id = palFavor?.id;
    if (!id) return false;
    try {
      await abandonFavorApi(id);
      setPalFavor(null);
      lastFavorWriteRef.current = Date.now();
      void refreshIncoming();
      return true;
    } catch {
      return false;
    }
  }, [palFavor, refreshIncoming]);

  // Member books a specific pal. Server-confirmed (NOT optimistic): a failed
  // assign must never leave the client showing a match the server never made.
  const assignPal = useCallback(async (palId: string): Promise<boolean> => {
    const id = memberFavor?.id;
    if (!id) return false;
    try {
      const { favor } = await assignPalApi(id, palId);
      setMemberFavor(favor);
      setPalCanceled(false);
      lastFavorWriteRef.current = Date.now();
      return true;
    } catch {
      return false;
    }
  }, [memberFavor]);

  const finishFavorAsPal = useCallback(async (): Promise<{ ok: boolean; awaitingRelease?: true; payout?: number; reason?: string }> => {
    const f = palFavor;
    const uid = user?.id ?? '';
    if (!f) return { ok: false, reason: 'No active favor to finish.' };
    // Stamp BEFORE the request fires: any poll tick that starts while /finish is
    // in flight is discarded as stale, so it can't rewind the slot mid-finish.
    // lastFinishedRef marks this as OUR finish so the poll never misreads this
    // favor leaving the active set (the member released) as "the member canceled".
    lastFavorWriteRef.current = Date.now();
    lastFinishedRef.current = f.id;
    try {
      const { favor } = await finishFavorApi(f.id);
      lastFavorWriteRef.current = Date.now();
      // The favor parks in the slot at 'pending_release' — do NOT clear it, and
      // do NOT echo earnings/history: nothing settles until the member releases
      // the payment. The payout is computed client-side purely for display.
      setPalFavor(favor);
      return { ok: true, awaitingRelease: true, payout: computePayout(favor.price).payout };
    } catch (e: any) {
      // The finish didn't happen (409 not-completable / network): reconcile to
      // server truth so the slot reflects reality and the favor can be retried.
      try {
        const [a, earn, hist] = await Promise.all([getActiveFavorApi(), getEarningsApi(), getFavorsApi()]);
        const reconciled = splitActive(a, uid).pal;
        setPalFavor(reconciled);
        // Only clear the our-finish marker when the finish genuinely did NOT
        // land. A timeout-after-commit (or double-tap 409) reconciles to this
        // favor at pending_release — clearing the ref then would make the
        // eventual release read as "the member canceled".
        if (!(reconciled && reconciled.id === f.id && reconciled.status === 'pending_release')) {
          lastFinishedRef.current = null;
        }
        setEarnings(earn.earnings);
        setHistory(hist.favors);
      } catch { /* keep local state; the poll reconciles */ }
      return { ok: false, reason: e?.message || 'Could not complete the favor. Please try again.' };
    }
  }, [palFavor, user]);

  // Member releases the payment on a finished (pending_release) favor — the
  // step that actually settles money. Server-confirmed BEFORE any state change:
  // success swaps the completed record into the member slot (only when the slot
  // still holds this favor — a release from History must not clobber a newer
  // live request) so the completed-unrated retention shows the rating prompt,
  // then refreshes the ledgers. Failure leaves state untouched.
  const releaseFavor = useCallback(async (favorId: string): Promise<{ ok: boolean; payout?: number; ledgerStatus?: 'completed' | 'incomplete'; reason?: string }> => {
    try {
      const { favor, payout, ledgerStatus } = await releaseFavorApi(favorId);
      lastFavorWriteRef.current = Date.now();
      if (memberFavorRef.current?.id === favor.id) setMemberFavor(favor);
      void Promise.all([getTransactionsApi(), getFavorsApi()])
        .then(([t, h]) => { setTransactions(t.transactions); setHistory(h.favors); })
        .catch(() => undefined);
      return { ok: true, payout, ledgerStatus };
    } catch (e: any) {
      return { ok: false, reason: e?.message || 'Could not release the payment. Please try again.' };
    }
  }, []);

  // Pal rates the member they just helped (persists to the finished favor).
  // Honest result: the submit screen must not claim success on a silent no-op
  // (missing id) or a failed request.
  const rateMember = useCallback(async (favorId: string | null, rating: number, feedback: string): Promise<boolean> => {
    const id = favorId ?? lastFinishedRef.current;
    if (!id) return false;
    try {
      await rateMemberApi(id, { rating, feedback: feedback ?? '' });
      return true;
    } catch {
      return false;
    }
  }, []);

  // ---- moderation ----
  const reportUser = useCallback(async (userId: string, reason?: string): Promise<boolean> => {
    // Server-confirmed: the "Report received" confirmation only appears once the
    // report actually exists. (local_ rows survive refreshNotifications.)
    try {
      await reportUserApi(userId, reason);
    } catch {
      return false;
    }
    setNotifications((n) => [
      { id: `local_${userId}_${Date.now()}_${localSeq++}`, type: 'general', title: 'Report received',
        body: 'Thanks — our Trust & Safety team will review this shortly.', date: Date.now(), read: false },
      ...n,
    ]);
    return true;
  }, []);

  const blockUser = useCallback(async (userId: string): Promise<boolean> => {
    try {
      await blockUserApi(userId);
    } catch {
      return false;
    }
    setBlockedUsers((b) => (b.includes(userId) ? b : [...b, userId]));
    return true;
  }, []);

  const unblockUser = useCallback(async (userId: string): Promise<boolean> => {
    try {
      await unblockUserApi(userId);
    } catch {
      return false;
    }
    setBlockedUsers((b) => b.filter((x) => x !== userId));
    return true;
  }, []);

  // ---- payments ----
  const addCard = useCallback(async (card: Omit<PaymentCard, 'id' | 'isDefault'>) => {
    const { card: created } = await addCardApi({
      brand: card.brand, last4: card.last4, expMonth: card.expMonth, expYear: card.expYear,
    });
    setCards((c) => [...c, created]);
    return created;
  }, []);

  const removeCard = useCallback((id: string) => {
    let removed: PaymentCard | undefined;
    setCards((c) => {
      removed = c.find((x) => x.id === id);
      return c.filter((x) => x.id !== id);
    });
    // A failed DELETE must not hide a card that still exists server-side (it
    // would silently resurrect on the next sync) — restore it.
    void removeCardApi(id).catch(() => {
      if (removed) setCards((c) => (c.find((x) => x.id === id) ? c : [...c, removed!]));
    });
  }, []);

  // Cash out the available balance; refresh the ledger so the summary updates.
  // The (cosmetic) refresh is isolated so a refresh hiccup can't masquerade as a
  // failed cashout after the money already moved.
  const cashOut = useCallback(async () => {
    const { amount } = await cashoutApi();
    try {
      const { earnings: e } = await getEarningsApi();
      setEarnings(e);
    } catch {
      /* the payout succeeded; the ledger will refresh on next load */
    }
    return amount;
  }, []);

  // Return URL for hosted Stripe pages: the web origin on web, the app's deep
  // link scheme on native.
  const returnUrl = (path: string) =>
    Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : `myfavor://${path}`;

  // Begin adding a card. Live: returns a hosted Stripe Checkout URL to open;
  // mock: returns null so the screen shows the manual dev form.
  const startAddCard = useCallback(async () => {
    if (!paymentsLive) return null;
    try {
      const { url } = await createSetupCheckoutApi(returnUrl('payment'), returnUrl('payment'));
      return url;
    } catch {
      return null;
    }
  }, [paymentsLive]);

  const syncCards = useCallback(async () => {
    try {
      const { cards: c } = await syncCardsApi();
      setCards(c);
    } catch {
      /* ignore */
    }
  }, []);

  const connectOnboard = useCallback(async () => {
    try {
      const { url } = await connectOnboardApi(returnUrl('payouts'), returnUrl('payouts'));
      return url;
    } catch {
      return null;
    }
  }, []);

  const connectStatus = useCallback(async () => {
    try {
      const s = await connectStatusApi();
      return { onboarded: s.onboarded, payoutsEnabled: s.payoutsEnabled };
    } catch {
      return { onboarded: false, payoutsEnabled: false };
    }
  }, []);

  // ---- messaging ----
  const messagesFor = useCallback((threadId: string) => messages.filter((m) => m.threadId === threadId), [messages]);

  const sendMessage = useCallback((threadId: string, text: string) => {
    const optimistic: Message = { id: `pending_${Date.now()}_${localSeq++}`, threadId, fromMe: true, text, createdAt: Date.now() };
    setMessages((m) => [...m, optimistic]);
    setThreads((t) => t.map((th) => (th.id === threadId ? { ...th, lastMessage: text, unread: 0 } : th)));
    void sendMessageApi(threadId, text)
      .then(({ message }) => setMessages((m) => {
        // Replace the optimistic bubble with the real one, then dedupe by id in
        // case a poll already pulled the confirmed message in.
        const replaced = m.map((x) => (x.id === optimistic.id ? message : x));
        const seen = new Set<string>();
        return replaced.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
      }))
      .catch(() => {
        // Send failed (offline / server error): keep the bubble but flag it, so
        // the user SEES the failure and can tap to retry — never silently drop
        // their text.
        setMessages((m) => m.map((x) => (x.id === optimistic.id ? { ...x, failed: true } : x)));
      });
  }, []);

  // Re-send a message whose send failed. The bubble keeps its id (the flag just
  // toggles while in flight) so the screen's list stays stable.
  const retrySendMessage = useCallback((messageId: string) => {
    const msg = messages.find((x) => x.id === messageId && x.failed);
    if (!msg) return;
    setMessages((m) => m.map((x) => (x.id === messageId ? { ...x, failed: false } : x)));
    void sendMessageApi(msg.threadId, msg.text)
      .then(({ message }) => setMessages((m) => {
        const replaced = m.map((x) => (x.id === messageId ? message : x));
        const seen = new Set<string>();
        return replaced.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
      }))
      .catch(() => {
        setMessages((m) => m.map((x) => (x.id === messageId ? { ...x, failed: true } : x)));
      });
  }, [messages]);

  // Live-ish messaging: re-fetch a thread's messages (polled while it's open).
  // Keep any still-in-flight optimistic (pending_) sends — failed ones included
  // — so a poll mid-send doesn't make the user's just-sent bubble vanish.
  const refreshMessages = useCallback(async (threadId: string) => {
    const epoch = sessionEpochRef.current;
    try {
      const { messages: m } = await getMessagesApi(threadId);
      if (epoch !== sessionEpochRef.current) return;
      setMessages((prev) => {
        const others = prev.filter((x) => x.threadId !== threadId);
        const pending = prev.filter((x) => x.threadId === threadId && x.id.startsWith('pending_'));
        // The server returns only the NEWEST page — keep any older history the
        // user already paged in (loadEarlierMessages) instead of wiping it.
        const ids = new Set(m.map((x) => x.id));
        const older = prev.filter((x) => x.threadId === threadId && !x.id.startsWith('pending_') && !ids.has(x.id));
        return [...others, ...older, ...m, ...pending];
      });
    } catch {
      /* ignore */
    }
  }, []);

  // Page further back through a thread's history: fetch the page BEFORE the
  // oldest loaded message and prepend it. True = a page arrived (there may be
  // more); false = no older history (or the fetch failed).
  const loadEarlierMessages = useCallback(async (threadId: string): Promise<boolean> => {
    const loaded = messages.filter((x) => x.threadId === threadId && !x.id.startsWith('pending_'));
    const oldest = loaded[0];
    if (!oldest) return false;
    const epoch = sessionEpochRef.current;
    try {
      const { messages: page } = await getMessagesApi(threadId, oldest.id);
      if (epoch !== sessionEpochRef.current || page.length === 0) return false;
      setMessages((prev) => {
        const ids = new Set(prev.map((x) => x.id));
        const fresh = page.filter((x) => !ids.has(x.id));
        const rest = prev.filter((x) => x.threadId !== threadId);
        const current = prev.filter((x) => x.threadId === threadId);
        return [...rest, ...fresh, ...current];
      });
      return true;
    } catch {
      return false;
    }
  }, [messages]);

  const refreshThreads = useCallback(async () => {
    const epoch = sessionEpochRef.current;
    try {
      const { threads: t } = await getThreadsApi();
      if (epoch !== sessionEpochRef.current) return;
      setThreads(t);
    } catch {
      /* ignore */
    }
  }, []);

  // Get-or-create a thread with another user (e.g. the pal messaging the member).
  const openThreadWith = useCallback(async (userId: string) => {
    try {
      const { thread } = await createThreadApi(userId);
      setThreads((list) => (list.find((t) => t.id === thread.id) ? list : [thread, ...list]));
      return thread.id;
    } catch {
      return null;
    }
  }, []);

  // ---- notifications ----
  const markNotificationRead = useCallback((id: string) => {
    setNotifications((n) => n.map((x) => (x.id === id ? { ...x, read: true } : x)));
    // local_ rows are client-only — the server has no row to mark.
    if (!id.startsWith('local_')) void markNotificationReadApi(id).catch(() => undefined);
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    setNotifications((n) => n.map((x) => ({ ...x, read: true })));
    void markAllNotificationsReadApi().catch(() => undefined);
  }, []);

  const refreshNotifications = useCallback(async () => {
    const epoch = sessionEpochRef.current;
    try {
      const { notifications: n } = await getNotificationsApi();
      if (epoch !== sessionEpochRef.current) return;
      // Merge, don't replace: client-only local_ rows (e.g. "Report received")
      // have no server counterpart and must survive every refresh.
      setNotifications((prev) => [...prev.filter((x) => x.id.startsWith('local_')), ...n]);
    } catch {
      /* ignore */
    }
  }, []);

  // Poll notifications + thread list so the bell's unread count AND message
  // badges stay current app-wide (a message push points people at the app; this
  // keeps what they see when they arrive honest). The same tick re-checks for a
  // REMOTELY-started active favor when none is held locally — e.g. a pal whose
  // price offer the member accepted while they were on another screen has no
  // active-favor poll running; without this they'd never learn they're booked.
  // Refs (not deps) so the interval isn't torn down on every favor change. While
  // EITHER slot is active the 4s poll already refreshes both, so this only fills
  // the both-empty gap.
  useEffect(() => {
    if (!user) return;
    const id = setInterval(() => {
      void refreshNotifications();
      void refreshThreads();
      // Gate on ACTIVE status, not mere non-null: a completed-but-unrated member
      // favor parked for the rating prompt must not block discovering a remote
      // booking (the 4s poll doesn't run for it either).
      const mActive = !!memberFavorRef.current && ACTIVE.includes(memberFavorRef.current.status);
      const pActive = !!palFavorRef.current && ACTIVE.includes(palFavorRef.current.status);
      if (!mActive && !pActive) void refreshActive();
    }, 20000);
    return () => clearInterval(id);
  }, [user, refreshNotifications, refreshThreads, refreshActive]);

  const clearPalCanceled = useCallback(() => setPalCanceled(false), []);
  const clearMemberCanceled = useCallback(() => setMemberCanceled(false), []);

  const value = useMemo<StoreValue>(
    () => ({
      user, isAuthenticated: !!user, restoring, maintenance, updateRequired, suspended, recheckConfig,
      signup, verifyOtp, submitVetting, login, logout, deleteAccount, updateProfile, changePassword,
      setRole, setStatus,
      pals, draftFavor, setDraft, clearDraft,
      activeMemberFavor: memberFavor, activePalFavor: palFavor,
      activePal: palById(memberFavor?.palId) ?? null, palById, history,
      palCanceled, clearPalCanceled, memberCanceled, clearMemberCanceled, locationDenied,
      requestFavor, advanceFavor, cancelFavor, rateFavor, releaseFavor, incomingFavors, refreshIncoming, acceptFavor,
      acceptOffer, refreshActive,
      declineFavor, abandonFavor, assignPal, finishFavorAsPal, rateMember,
      blockedUsers, reportUser, blockUser, unblockUser,
      cards, addCard, removeCard, transactions, earnings, cashOut,
      paymentsLive, startAddCard, syncCards, connectOnboard, connectStatus,
      threads, messagesFor, sendMessage, retrySendMessage, refreshMessages, loadEarlierMessages, refreshThreads, openThreadWith,
      notifications, markNotificationRead, markAllNotificationsRead, refreshNotifications,
    }),
    [user, restoring, maintenance, updateRequired, suspended, recheckConfig, signup, verifyOtp, submitVetting, login, logout, deleteAccount, updateProfile, changePassword, setRole, setStatus,
      pals, draftFavor, setDraft, clearDraft, memberFavor, palFavor, palCanceled, clearPalCanceled, memberCanceled, clearMemberCanceled, locationDenied, palById, history, requestFavor, advanceFavor, cancelFavor,
      rateFavor, releaseFavor, incomingFavors, refreshIncoming, acceptFavor, acceptOffer, refreshActive, declineFavor, abandonFavor, assignPal, finishFavorAsPal, rateMember, blockedUsers, reportUser,
      blockUser, unblockUser, cards, addCard, removeCard, transactions, earnings, cashOut,
      paymentsLive, startAddCard, syncCards, connectOnboard, connectStatus,
      threads, messagesFor, sendMessage, retrySendMessage,
      refreshMessages, loadEarlierMessages, refreshThreads, openThreadWith, notifications, markNotificationRead, markAllNotificationsRead, refreshNotifications]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
};

export const useStore = () => {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
};
