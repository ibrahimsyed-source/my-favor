import React, { createContext, useContext, useMemo, useState, useCallback } from 'react';
import {
  User, Favor, PaymentCard, Transaction, Thread, Message, AppNotification,
  Role, UserStatus, FavorTier, GeoPoint, FavorStatus, computeFees, computePayout,
} from '../types';
import * as seed from '../data/mockData';

// ---- Mock service layer ------------------------------------------------------
// Every async call below stands in for a real API. Replace the bodies with
// fetch()/Stripe/Twilio calls when wiring real services — the signatures stay.
const delay = (ms = 600) => new Promise((r) => setTimeout(r, ms));
let idCounter = 1000;
const nextId = (p: string) => `${p}_${++idCounter}`;
// Deterministic "now" surrogate that advances on each call (Date.now banned in some envs).
let clock = 1717000000000;
const now = () => (clock += 1000);

interface StoreValue {
  // auth
  user: User | null;
  isAuthenticated: boolean;
  signup: (data: Partial<User> & { password: string }) => Promise<void>;
  verifyOtp: (code: string) => Promise<boolean>;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
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
  activePal: User | null; // the pal the member booked (drives tracking)
  palById: (id?: string) => User | undefined;
  history: Favor[];
  requestFavor: () => Promise<Favor>;
  advanceFavor: (status: FavorStatus) => void;
  cancelFavor: () => void;
  rateFavor: (rating: number, feedback: string, tip?: number) => void;
  // pal side
  incomingFavors: Favor[];
  acceptFavor: (favorId: string) => void;
  declineFavor: (favorId: string) => void;
  assignPal: (palId: string) => void; // member books a specific pal
  finishFavorAsPal: () => number; // completes active favor as pal, returns payout
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

  // messaging
  threads: Thread[];
  messagesFor: (threadId: string) => Message[];
  sendMessage: (threadId: string, text: string) => void;

  // notifications
  notifications: AppNotification[];
  markNotificationRead: (id: string) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [pendingSignup, setPendingSignup] = useState<(Partial<User> & { password: string }) | null>(null);
  const [draftFavor, setDraftFavor] = useState<Partial<Favor> | null>(null);
  const [activeFavor, setActiveFavor] = useState<Favor | null>(null);
  const [history, setHistory] = useState<Favor[]>(seed.history);
  const [incomingFavors, setIncomingFavors] = useState<Favor[]>(seed.favorsSeed);
  const [cards, setCards] = useState<PaymentCard[]>(seed.cards);
  const [transactions, setTransactions] = useState<Transaction[]>(seed.transactions);
  const [earnings, setEarnings] = useState<Transaction[]>(seed.earnings);
  const [threads, setThreads] = useState<Thread[]>(seed.threads);
  const [messages, setMessages] = useState<Message[]>(seed.messages);
  const [notifications, setNotifications] = useState<AppNotification[]>(seed.notifications);
  const [blockedUsers, setBlockedUsers] = useState<string[]>([]);

  // Resolve a pal record (the member's booked pal, message counterparties, etc.)
  const palById = useCallback(
    (id?: string) => (id ? seed.nearbyPals.find((p) => p.id === id) : undefined),
    []
  );

  // ---- auth ----
  const signup = useCallback(async (data: Partial<User> & { password: string }) => {
    await delay();
    setPendingSignup(data);
  }, []);

  const verifyOtp = useCallback(async (code: string) => {
    await delay();
    if (code.length === 4) {
      setUser({ ...seed.currentUser, ...pendingSignup });
      setPendingSignup(null);
      return true;
    }
    return false;
  }, [pendingSignup]);

  const login = useCallback(async (email: string, _password: string) => {
    await delay();
    setUser({ ...seed.currentUser, email: email || seed.currentUser.email });
    return true;
  }, []);

  const logout = useCallback(() => {
    // Reset session-scoped state so it can't bleed into the next login.
    setUser(null);
    setPendingSignup(null);
    setDraftFavor(null);
    setActiveFavor(null);
    setHistory(seed.history);
    setIncomingFavors(seed.favorsSeed);
    setCards(seed.cards);
    setTransactions(seed.transactions);
    setEarnings(seed.earnings);
    setBlockedUsers([]);
  }, []);

  const updateProfile = useCallback(async (patch: Partial<User>) => {
    await delay();
    setUser((u) => (u ? { ...u, ...patch } : u));
  }, []);

  const changePassword = useCallback(async (current: string, next: string) => {
    await delay();
    // Mock: a real impl would verify `current` server-side. Require both present.
    return current.trim().length > 0 && next.trim().length >= 6;
  }, []);

  const setRole = useCallback((role: Role) => setUser((u) => (u ? { ...u, role } : u)), []);
  const setStatus = useCallback((status: UserStatus) => setUser((u) => (u ? { ...u, status } : u)), []);

  // ---- favors ----
  const setDraft = useCallback((patch: Partial<Favor>) => setDraftFavor((d) => ({ ...d, ...patch })), []);
  const clearDraft = useCallback(() => setDraftFavor(null), []);

  const requestFavor = useCallback(async () => {
    const base = draftFavor?.price ?? 20;
    const fees = computeFees(base);
    const favor: Favor = {
      id: nextId('f'),
      memberId: user?.id ?? 'u_me',
      tier: (draftFavor?.tier as FavorTier) ?? 'tiny',
      price: base,
      description: draftFavor?.description ?? '',
      images: draftFavor?.images ?? [],
      location: (draftFavor?.location as GeoPoint) ?? { lat: 25.77, lng: -80.19, address: 'Current location' },
      status: 'requested',
      createdAt: now(),
      scheduledFor: draftFavor?.scheduledFor,
      hours: draftFavor?.hours,
      ...fees,
      etaWindow: '11:50 - 12:10PM',
    };
    setActiveFavor(favor);
    return favor;
  }, [draftFavor, user]);

  const advanceFavor = useCallback((status: FavorStatus) => {
    setActiveFavor((f) => (f ? { ...f, status } : f));
  }, []);

  const cancelFavor = useCallback(() => {
    setActiveFavor((f) => {
      if (f) setHistory((h) => [{ ...f, status: 'cancelled' }, ...h]);
      return null;
    });
  }, []);

  const rateFavor = useCallback((rating: number, feedback: string, tip?: number) => {
    setActiveFavor((f) => {
      if (f) setHistory((h) => [{ ...f, status: 'completed', rating, feedback, tip }, ...h]);
      return null;
    });
  }, []);

  const acceptFavor = useCallback((favorId: string) => {
    setIncomingFavors((list) => {
      const found = list.find((x) => x.id === favorId);
      if (found) setActiveFavor({ ...found, palId: user?.id ?? 'u_me', status: 'matched' });
      return list.filter((x) => x.id !== favorId);
    });
  }, [user]);

  // Pal dismisses an offer — removed so Home surfaces the next one instead of re-offering it.
  const declineFavor = useCallback((favorId: string) => {
    setIncomingFavors((list) => list.filter((x) => x.id !== favorId));
  }, []);

  // Member books a specific pal from the results: bind them to the active favor.
  const assignPal = useCallback((palId: string) => {
    setActiveFavor((f) => (f ? { ...f, palId, status: 'matched' } : f));
  }, []);

  // Pal completes the active favor: record the payout in Earning History + history.
  const finishFavorAsPal = useCallback(() => {
    const f = activeFavor;
    const base = f?.price ?? 20;
    const { payout } = computePayout(base, f?.tip ?? 0);
    if (f) {
      const earning: Transaction = {
        id: nextId('e'), favorId: f.id,
        title: (f.description && f.description.slice(0, 40)) || 'Favor',
        amount: payout, status: 'completed', date: now(), kind: 'earning',
      };
      setEarnings((e) => [earning, ...e]);
      setHistory((h) => [{ ...f, palId: user?.id ?? 'u_me', status: 'completed' }, ...h]);
    }
    setActiveFavor(null);
    return payout;
  }, [activeFavor, user]);

  // ---- moderation ----
  const reportUser = useCallback((_userId: string, _reason?: string) => {
    setNotifications((n) => [
      { id: nextId('n'), type: 'general', title: 'Report received',
        body: 'Thanks — our Trust & Safety team will review this shortly.', date: now(), read: false },
      ...n,
    ]);
  }, []);
  const blockUser = useCallback((userId: string) => {
    setBlockedUsers((b) => (b.includes(userId) ? b : [...b, userId]));
  }, []);

  // ---- payments ----
  const addCard = useCallback(async (card: Omit<PaymentCard, 'id' | 'isDefault'>) => {
    await delay();
    const created: PaymentCard = { ...card, id: nextId('c'), isDefault: cards.length === 0 };
    setCards((c) => [...c, created]);
    return created;
  }, [cards.length]);

  const removeCard = useCallback((id: string) => setCards((c) => c.filter((x) => x.id !== id)), []);

  // ---- messaging ----
  const messagesFor = useCallback((threadId: string) => messages.filter((m) => m.threadId === threadId), [messages]);

  const sendMessage = useCallback((threadId: string, text: string) => {
    const msg: Message = { id: nextId('m'), threadId, fromMe: true, text, createdAt: now() };
    setMessages((m) => [...m, msg]);
    setThreads((t) => t.map((th) => (th.id === threadId ? { ...th, lastMessage: text, unread: 0 } : th)));
  }, []);

  // ---- notifications ----
  const markNotificationRead = useCallback(
    (id: string) => setNotifications((n) => n.map((x) => (x.id === id ? { ...x, read: true } : x))),
    []
  );

  const value = useMemo<StoreValue>(
    () => ({
      user, isAuthenticated: !!user, signup, verifyOtp, login, logout, updateProfile, changePassword,
      setRole, setStatus,
      pals: seed.nearbyPals, draftFavor, setDraft, clearDraft,
      activeFavor, activePal: palById(activeFavor?.palId) ?? null, palById, history,
      requestFavor, advanceFavor, cancelFavor, rateFavor, incomingFavors, acceptFavor,
      declineFavor, assignPal, finishFavorAsPal,
      blockedUsers, reportUser, blockUser,
      cards, addCard, removeCard, transactions, earnings,
      threads, messagesFor, sendMessage, notifications, markNotificationRead,
    }),
    [user, signup, verifyOtp, login, logout, updateProfile, changePassword, setRole, setStatus, draftFavor,
      setDraft, clearDraft, activeFavor, palById, history, requestFavor, advanceFavor, cancelFavor, rateFavor,
      incomingFavors, acceptFavor, declineFavor, assignPal, finishFavorAsPal, blockedUsers, reportUser, blockUser,
      cards, addCard, removeCard, transactions, earnings, threads, messagesFor, sendMessage,
      notifications, markNotificationRead]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
};

export const useStore = () => {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
};
