import React, { createContext, useContext, useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import {
  User, Favor, PaymentCard, Transaction, Thread, Message, AppNotification,
  Role, UserStatus, FavorTier, GeoPoint, FavorStatus, computeFees, computePayout,
} from '../types';
import { setSession, clearSession, getStoredRefresh, getStoredUser, setStoredUser, ApiError, setOnSessionExpired, setOnAccountSuspended } from '../api/client';
import { startLocationBroadcast } from '../lib/location';
import {
  signupApi, verifyOtpApi, loginApi, logoutApi, deleteAccountApi, changePasswordApi,
  getConfigApi, getMeApi, updateProfileApi, setRoleApi, verifyPalApi, setStatusApi, getPalsApi, getPalApi,
  createFavorApi, getFavorsApi, getActiveFavorApi, getFavorApi, getIncomingApi,
  acceptFavorApi, declineFavorApi, abandonFavorApi, assignPalApi, advanceFavorApi, updateFavorLocationApi, finishFavorApi, cancelFavorApi, rateFavorApi, rateMemberApi,
  getCardsApi, addCardApi, removeCardApi, getTransactionsApi, getEarningsApi, cashoutApi,
  getPaymentsConfigApi, createSetupCheckoutApi, syncCardsApi, connectOnboardApi, connectStatusApi,
  getThreadsApi, getMessagesApi, sendMessageApi, createThreadApi,
  getNotificationsApi, markNotificationReadApi, markAllNotificationsReadApi,
  reportUserApi, blockUserApi, getBlockedApi,
} from '../api/endpoints';

// ---------------------------------------------------------------------------
// Store — now backed by the real backend API (server/). The StoreValue
// interface is unchanged, so no screen had to change: synchronous mutators do
// an optimistic local update and persist in the background; collections are
// loaded from the API after auth. See src/api for the client + endpoints.
// ---------------------------------------------------------------------------

const ACTIVE = ['requested', 'matched', 'enroute', 'arrived', 'in_progress'];
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
  submitVetting: (data: { legalFirstName: string; legalLastName: string; ssn: string; dateOfBirth: string; consent: boolean }) => Promise<'approved' | 'rejected' | 'error'>;
  login: (email: string, password: string) => Promise<'ok' | 'unverified' | 'invalid' | 'error' | 'suspended'>;
  logout: () => void;
  deleteAccount: () => Promise<void>;
  updateProfile: (patch: Partial<User>) => Promise<void>;
  changePassword: (current: string, next: string) => Promise<boolean>;
  setRole: (role: Role) => void;
  setStatus: (status: UserStatus) => void;

  // favors
  pals: User[];
  draftFavor: Partial<Favor> | null;
  setDraft: (patch: Partial<Favor>) => void;
  clearDraft: () => void;
  activeFavor: Favor | null;
  activePal: User | null;
  palById: (id?: string) => User | undefined;
  history: Favor[];
  requestFavor: () => Promise<Favor>;
  advanceFavor: (status: FavorStatus) => void;
  cancelFavor: () => void;
  rateFavor: (rating: number, feedback: string, tip?: number) => void;
  // pal side
  incomingFavors: Favor[];
  refreshIncoming: () => Promise<void>;
  acceptFavor: (favorId: string) => Promise<{ ok: boolean; reason?: string; code?: 'unavailable' | 'error' }>;
  declineFavor: (favorId: string) => void;
  abandonFavor: () => Promise<boolean>;
  assignPal: (palId: string) => void;
  finishFavorAsPal: () => number;
  rateMember: (rating: number, feedback: string) => void;
  // moderation
  blockedUsers: string[];
  reportUser: (userId: string, reason?: string) => void;
  blockUser: (userId: string) => void;

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
  sendMessage: (threadId: string, text: string) => void;
  refreshMessages: (threadId: string) => Promise<void>;
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
  const [activeFavor, setActiveFavor] = useState<Favor | null>(null);
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
  // Remember the favor a pal just finished, so the post-completion screen can
  // submit the pal's rating of the member for the right favor.
  const lastFinishedRef = useRef<string | null>(null);

  const mergePal = useCallback((p: User) => {
    setPals((list) => (list.find((x) => x.id === p.id) ? list : [...list, p]));
  }, []);

  // ---- bulk loaders ----
  const loadMessagesFor = useCallback(async (list: Thread[]) => {
    const all: Message[] = [];
    for (const t of list) {
      try {
        const { messages: m } = await getMessagesApi(t.id);
        all.push(...m);
      } catch {
        /* skip a thread that fails */
      }
    }
    setMessages(all);
  }, []);

  const loadAll = useCallback(async (u: User) => {
    // Every account can both request and fulfill favors, so the open-favors
    // board is loaded for everyone (the API excludes the caller's own favors).
    void u;
    const [favors, active, cardList, txns, earn, thr, notes, palList, blocked, incoming, payCfg] =
      await Promise.allSettled([
        getFavorsApi(), getActiveFavorApi(), getCardsApi(), getTransactionsApi(), getEarningsApi(),
        getThreadsApi(), getNotificationsApi(), getPalsApi(), getBlockedApi(),
        getIncomingApi(),
        getPaymentsConfigApi(),
      ]);

    if (favors.status === 'fulfilled') setHistory(favors.value.favors);
    if (active.status === 'fulfilled') setActiveFavor(active.value.favor);
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
      void loadMessagesFor(thr.value.threads);
    }
  }, [loadMessagesFor]);

  const resetState = useCallback(() => {
    setUser(null); setPendingDest(null); setDraftFavor(null); setActiveFavor(null);
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

  // ---- live updates: poll the active favor so the member sees the pal's
  // progress (matched -> en route -> arrived -> ...) without a manual refresh. ----
  useEffect(() => {
    if (!user || !activeFavor || !ACTIVE.includes(activeFavor.status)) return;
    const activeId = activeFavor.id;
    const role = user.role;
    const id = setInterval(async () => {
      try {
        const { favor } = await getActiveFavorApi();
        if (favor) {
          setActiveFavor(favor);
          if (favor.palId && !palsRef.current.find((p) => p.id === favor.palId)) {
            try {
              const { pal } = await getPalApi(favor.palId);
              mergePal(asUser(pal));
            } catch { /* ignore */ }
          }
        } else {
          // The favor left the active set (counterparty completed or cancelled).
          // For the member, surface the final completed record so the tracking
          // screen can flip to "completed" and prompt a rating; otherwise clear
          // it. Either way activeFavor is no longer ACTIVE, so this poll stops.
          if (role === 'member') {
            try {
              const { favor: final } = await getFavorApi(activeId);
              setActiveFavor(final && final.status === 'completed' ? final : null);
            } catch { setActiveFavor(null); }
          } else {
            setActiveFavor(null);
          }
        }
      } catch { /* ignore transient errors */ }
    }, 4000);
    return () => clearInterval(id);
  }, [user, activeFavor, mergePal]);

  // ---- live updates: when THIS user is the assigned pal of an in-flight favor,
  // stream their device GPS to the server so the member can watch them approach.
  // Derived from stable fields (not the activeFavor object) so the 4s poll above,
  // which swaps in a fresh favor object each tick, doesn't restart the GPS watch. ----
  const palBroadcastFavorId =
    user?.role === 'pal' &&
    activeFavor &&
    activeFavor.palId === user.id &&
    PAL_BROADCAST_STATUSES.includes(activeFavor.status)
      ? activeFavor.id
      : null;
  useEffect(() => {
    if (!palBroadcastFavorId) return;
    let stop: (() => void) | undefined;
    let cancelled = false;
    void startLocationBroadcast((lat, lng) => {
      // Fire-and-forget; a rejected update (favor ended, permission lost) just
      // means the next tick won't post — the member's poll handles staleness.
      void updateFavorLocationApi(palBroadcastFavorId, lat, lng).catch(() => undefined);
    }).then((s) => {
      if (cancelled) s();
      else stop = s;
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [palBroadcastFavorId]);

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
    legalFirstName: string; legalLastName: string; ssn: string; dateOfBirth: string; consent: boolean;
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

  const logout = useCallback(() => {
    void (async () => {
      const refresh = await getStoredRefresh();
      if (refresh) await logoutApi(refresh).catch(() => undefined);
      await clearSession();
    })();
    resetState();
  }, [resetState]);

  const deleteAccount = useCallback(async () => {
    await deleteAccountApi().catch(() => undefined);
    await clearSession();
    resetState();
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
      const res = (await changePasswordApi(current, next)) as
        { ok: boolean; accessToken?: string; refreshToken?: string };
      if (res.accessToken && res.refreshToken) {
        await setSession({ accessToken: res.accessToken, refreshToken: res.refreshToken });
      }
      return true;
    } catch {
      return false;
    }
  }, []);

  const setRole = useCallback((role: Role) => {
    setUser((u) => (u ? { ...u, role } : u)); // optimistic
    void setRoleApi(role)
      .then(({ user: u }) => { setUser(u); return loadAll(u); })
      .catch(() => undefined);
  }, [loadAll]);

  const setStatus = useCallback((status: UserStatus) => {
    setUser((u) => (u ? { ...u, status } : u)); // optimistic
    void setStatusApi(status).catch(() => undefined);
  }, []);

  // ---- favors ----
  const setDraft = useCallback((patch: Partial<Favor>) => setDraftFavor((d) => ({ ...d, ...patch })), []);
  const clearDraft = useCallback(() => setDraftFavor(null), []);

  const requestFavor = useCallback(async () => {
    const d = draftFavor ?? {};
    const tier = (d.tier as FavorTier) ?? 'tiny';
    const location = (d.location as GeoPoint) ?? { lat: 25.77, lng: -80.19, address: 'Current location' };
    const { favor } = await createFavorApi({
      tier,
      ...(d.price != null ? { price: d.price } : {}),
      description: d.description ?? '',
      images: d.images ?? [],
      location,
      ...(d.scheduledFor != null ? { scheduledFor: d.scheduledFor } : {}),
      ...(d.hours != null ? { hours: d.hours } : {}),
    });
    setActiveFavor(favor);
    setDraftFavor(null); // clear the draft so the next favor starts fresh
    void getFavorsApi().then(({ favors }) => setHistory(favors)).catch(() => undefined);
    return favor;
  }, [draftFavor]);

  const advanceFavor = useCallback((status: FavorStatus) => {
    setActiveFavor((f) => (f ? { ...f, status } : f)); // optimistic
    const id = activeFavor?.id;
    if (id && ['enroute', 'arrived', 'in_progress'].includes(status)) {
      void advanceFavorApi(id, status)
        .then(({ favor }) => setActiveFavor(favor))
        .catch(() => undefined);
    }
  }, [activeFavor]);

  const cancelFavor = useCallback(() => {
    const id = activeFavor?.id;
    setActiveFavor((f) => {
      if (f) setHistory((h) => [{ ...f, status: 'cancelled' }, ...h]);
      return null;
    });
    if (id) {
      void cancelFavorApi(id)
        .then(() => Promise.all([getFavorsApi(), getTransactionsApi()]))
        .then(([f, t]) => { setHistory(f.favors); setTransactions(t.transactions); })
        .catch(() => undefined);
    }
  }, [activeFavor]);

  const rateFavor = useCallback((rating: number, feedback: string, tip?: number) => {
    const id = activeFavor?.id;
    setActiveFavor((f) => {
      if (f) setHistory((h) => [{ ...f, status: 'completed', rating, feedback, tip }, ...h]);
      return null;
    });
    if (id) {
      void rateFavorApi(id, { rating, feedback: feedback ?? '', ...(tip ? { tip } : {}) })
        .then(() => getFavorsApi())
        .then(({ favors }) => setHistory(favors))
        .catch(() => undefined);
    }
  }, [activeFavor]);

  // Re-fetch the open-favors feed (pull-to-refresh / focus on the browse list).
  const refreshIncoming = useCallback(async () => {
    if (!user) return;
    try {
      const { favors } = await getIncomingApi();
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

  const acceptFavor = useCallback(async (favorId: string): Promise<{ ok: boolean; reason?: string; code?: 'unavailable' | 'error' }> => {
    // One favor at a time: since a single account can both request and fulfill,
    // guard the single active-favor slot so a user mid-favor can't accept another
    // (which would silently overwrite their in-progress favor).
    if (activeFavor) {
      return { ok: false, reason: 'You already have an active favor. Finish it before accepting another.' };
    }
    try {
      const { favor } = await acceptFavorApi(favorId);
      setIncomingFavors((list) => list.filter((x) => x.id !== favorId));
      setActiveFavor(favor);
      return { ok: true };
    } catch (e: any) {
      // lost the race / already taken — refresh the feed + active state
      void getIncomingApi().then(({ favors }) => setIncomingFavors(favors)).catch(() => undefined);
      void getActiveFavorApi().then(({ favor }) => setActiveFavor(favor)).catch(() => undefined);
      // 409 (already matched) / 404 (deleted) => the favor is truly gone.
      const gone = e?.status === 409 || e?.status === 404;
      return { ok: false, reason: e?.message || 'This favor is no longer available.', code: gone ? 'unavailable' : 'error' };
    }
  }, [activeFavor]);

  const declineFavor = useCallback((favorId: string) => {
    setIncomingFavors((list) => list.filter((x) => x.id !== favorId));
    void declineFavorApi(favorId).catch(() => undefined);
  }, []);

  // A pal steps back from an accepted favor: it returns to the open board and
  // the member's request lives on (never stranded). Clears the pal's active slot.
  const abandonFavor = useCallback(async (): Promise<boolean> => {
    const id = activeFavor?.id;
    if (!id) return false;
    try {
      await abandonFavorApi(id);
      setActiveFavor(null);
      void refreshIncoming();
      return true;
    } catch {
      return false;
    }
  }, [activeFavor, refreshIncoming]);

  const assignPal = useCallback((palId: string) => {
    const id = activeFavor?.id;
    setActiveFavor((f) => (f ? { ...f, palId, status: 'matched' } : f)); // optimistic
    if (id) {
      void assignPalApi(id, palId)
        .then(({ favor }) => setActiveFavor(favor))
        .catch(() => undefined);
    }
  }, [activeFavor]);

  const finishFavorAsPal = useCallback(() => {
    const f = activeFavor;
    const { payout } = computePayout(f?.price ?? 20, f?.tip ?? 0);
    if (f) {
      const optimistic: Transaction = {
        id: `pending_${f.id}`, favorId: f.id,
        title: (f.description && f.description.slice(0, 40)) || 'Favor',
        amount: payout, status: 'completed', date: f.createdAt, kind: 'earning',
      };
      setEarnings((e) => [optimistic, ...e]);
      setHistory((h) => [{ ...f, palId: user?.id, status: 'completed' }, ...h]);
      lastFinishedRef.current = f.id;
      void finishFavorApi(f.id)
        .then(() => Promise.all([getEarningsApi(), getFavorsApi()]))
        .then(([e, hist]) => { setEarnings(e.earnings); setHistory(hist.favors); })
        .catch(() => {
          // The favor is still in_progress server-side; reconcile to server truth
          // so the phantom earning/history clear and the favor can be re-finished.
          lastFinishedRef.current = null;
          void Promise.all([getActiveFavorApi(), getEarningsApi(), getFavorsApi()])
            .then(([a, e, hist]) => { setActiveFavor(a.favor); setEarnings(e.earnings); setHistory(hist.favors); })
            .catch(() => undefined);
        });
    }
    setActiveFavor(null);
    return payout;
  }, [activeFavor, user]);

  // Pal rates the member they just helped (persists to the finished favor).
  const rateMember = useCallback((rating: number, feedback: string) => {
    const id = lastFinishedRef.current;
    if (id) void rateMemberApi(id, { rating, feedback: feedback ?? '' }).catch(() => undefined);
  }, []);

  // ---- moderation ----
  const reportUser = useCallback((userId: string, reason?: string) => {
    setNotifications((n) => [
      { id: `local_${userId}_${Date.now()}_${localSeq++}`, type: 'general', title: 'Report received',
        body: 'Thanks — our Trust & Safety team will review this shortly.', date: Date.now(), read: false },
      ...n,
    ]);
    void reportUserApi(userId, reason).catch(() => undefined);
  }, []);

  const blockUser = useCallback((userId: string) => {
    setBlockedUsers((b) => (b.includes(userId) ? b : [...b, userId]));
    void blockUserApi(userId).catch(() => undefined);
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
    setCards((c) => c.filter((x) => x.id !== id)); // optimistic
    void removeCardApi(id).catch(() => undefined);
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
    const optimistic: Message = { id: `pending_${Date.now()}`, threadId, fromMe: true, text, createdAt: Date.now() };
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
      .catch(() => undefined);
  }, []);

  // Live-ish messaging: re-fetch a thread's messages (polled while it's open).
  // Keep any still-in-flight optimistic (pending_) sends so a poll mid-send
  // doesn't make the user's just-sent bubble vanish.
  const refreshMessages = useCallback(async (threadId: string) => {
    try {
      const { messages: m } = await getMessagesApi(threadId);
      setMessages((prev) => {
        const others = prev.filter((x) => x.threadId !== threadId);
        const pending = prev.filter((x) => x.threadId === threadId && x.id.startsWith('pending_'));
        return [...others, ...m, ...pending];
      });
    } catch {
      /* ignore */
    }
  }, []);

  const refreshThreads = useCallback(async () => {
    try {
      const { threads: t } = await getThreadsApi();
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
    void markNotificationReadApi(id).catch(() => undefined);
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    setNotifications((n) => n.map((x) => ({ ...x, read: true })));
    void markAllNotificationsReadApi().catch(() => undefined);
  }, []);

  const refreshNotifications = useCallback(async () => {
    try {
      const { notifications: n } = await getNotificationsApi();
      setNotifications(n);
    } catch {
      /* ignore */
    }
  }, []);

  // Poll notifications so the bell's unread count + the list stay current.
  // (Real device push needs expo-notifications + APNs/FCM — see NEXT_STEPS.)
  useEffect(() => {
    if (!user) return;
    const id = setInterval(() => { void refreshNotifications(); }, 20000);
    return () => clearInterval(id);
  }, [user, refreshNotifications]);

  const value = useMemo<StoreValue>(
    () => ({
      user, isAuthenticated: !!user, restoring, maintenance, updateRequired, suspended, recheckConfig,
      signup, verifyOtp, submitVetting, login, logout, deleteAccount, updateProfile, changePassword,
      setRole, setStatus,
      pals, draftFavor, setDraft, clearDraft,
      activeFavor, activePal: palById(activeFavor?.palId) ?? null, palById, history,
      requestFavor, advanceFavor, cancelFavor, rateFavor, incomingFavors, refreshIncoming, acceptFavor,
      declineFavor, abandonFavor, assignPal, finishFavorAsPal, rateMember,
      blockedUsers, reportUser, blockUser,
      cards, addCard, removeCard, transactions, earnings, cashOut,
      paymentsLive, startAddCard, syncCards, connectOnboard, connectStatus,
      threads, messagesFor, sendMessage, refreshMessages, refreshThreads, openThreadWith,
      notifications, markNotificationRead, markAllNotificationsRead, refreshNotifications,
    }),
    [user, restoring, maintenance, updateRequired, suspended, recheckConfig, signup, verifyOtp, submitVetting, login, logout, deleteAccount, updateProfile, changePassword, setRole, setStatus,
      pals, draftFavor, setDraft, clearDraft, activeFavor, palById, history, requestFavor, advanceFavor, cancelFavor,
      rateFavor, incomingFavors, refreshIncoming, acceptFavor, declineFavor, abandonFavor, assignPal, finishFavorAsPal, rateMember, blockedUsers, reportUser,
      blockUser, cards, addCard, removeCard, transactions, earnings, cashOut,
      paymentsLive, startAddCard, syncCards, connectOnboard, connectStatus,
      threads, messagesFor, sendMessage,
      refreshMessages, refreshThreads, openThreadWith, notifications, markNotificationRead, markAllNotificationsRead, refreshNotifications]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
};

export const useStore = () => {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
};
