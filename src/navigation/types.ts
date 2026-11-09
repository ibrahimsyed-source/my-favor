// Central route contract. Every screen module navigates by these names.
// Typing is intentionally loose (params: any) so feature modules stay decoupled.

export type RootStackParamList = {
  // --- Auth --- (app opens on Login; onboarding carousel removed)
  Login: undefined;
  Signup: undefined;
  // destination = the email the code was sent to; password rides along on the
  // signup path so verify can auto-login.
  OtpVerify: {
    destination: string;
    password?: string;
    context?: 'signup' | 'reset';
    error?: string;
    // Local signup avatar — uploaded post-verification (uploads are authed).
    avatar?: import('../lib/upload').PickedImage;
  };
  ForgotPassword: undefined;
  NewPassword: { email: string; code: string };

  // --- App shell ---
  Tabs: undefined;

  // --- Member: request-a-favor flow ---
  SelectFavor: undefined;
  FavorDescription: undefined;
  Negotiate: undefined;
  ConfirmAddress: undefined;
  FavorSummary: undefined;
  SelectPayment: undefined;
  Searching: undefined;
  ProviderResults: undefined;
  ProviderDetail: {
    palId: string;
    // Optional snapshot from the directory list so the detail renders instantly
    // while (or if) the by-id fetch lags.
    pal?: {
      id: string; firstName: string; lastName: string; avatar?: string; bio?: string;
      city?: string; state?: string; rating: number; totalFavors: number;
    };
  };
  MemberProfile: { userId: string };
  FavorTracking: undefined;
  OrderComplete: undefined;

  // --- Pal: provide-a-favor flow ---
  BrowseFavors: undefined; // list of all open favor requests to browse + accept
  PalFavorDetail: { favorId: string };
  PalFavorInProgress: undefined;
  // Finished work parked until the member releases the payment. Params are the
  // finish-response snapshot; omitted on a pill tap / cold reopen (the screen
  // reads the pal slot).
  PalAwaitingRelease: { favorId?: string; payout?: number } | undefined;
  Navigation: undefined;
  // favorId is load-bearing on both: Complete's rate-the-member submit posts
  // against it (store's lastFinishedRef is only a fallback).
  PalFavorComplete: { favorId?: string } | undefined;
  PalFavorSuccess: { payout?: number; favorId?: string; ledgerStatus?: 'completed' | 'incomplete' } | undefined;
  Earnings: undefined;
  EarningDetail: { txId: string };
  StripeOnboarding: undefined;
  BankInfo: undefined;
  Vetting: undefined; // pal identity/background verification
  PalAgreement: undefined; // independent-contractor Favor Pal Agreement signing gate

  // --- Shared ---
  SideDrawer: undefined;
  Messages: undefined; // conversations list (was a tab pre-v2-dashboard)
  MessageThread: { threadId: string };
  EditProfile: undefined;
  Settings: undefined;
  SetStatus: undefined;
  Payment: undefined;
  AddCard: { cardId?: string } | undefined; // cardId → edit an existing card
  History: undefined; // favor history — opened from the side menu
  FavorHistoryDetail: { favorId: string };
  Help: undefined;
  Notifications: undefined;
  Legal: { doc: 'privacy' | 'terms' };

  // --- System / connectivity states (src/screens/system.tsx) ---
  // Registered in BOTH the auth and app groups: these can surface whether or
  // not the user is signed in.
  Offline: undefined;
  ServerError: undefined;
  Maintenance: undefined;
  UpdateRequired: undefined;
  NotFound: undefined;
  SessionExpired: undefined;

  // --- Flow / permission dead-ends (src/screens/scenarios.tsx) ---
  // Authed-only surfaces reached mid-flow.
  PermissionDenied: { kind: 'camera' | 'photos' | 'location' | 'notifications' };
  PaymentFailed: undefined;
  NoPaymentMethod: undefined;
  FavorUnavailable: undefined;
  AccountSuspended: undefined;
  PalApplicationRejected: undefined;
};

// Dashboard Main v2 (1660:15783) tab bar: HOME / ACCOUNT / ACTIVITY.
// Messages, Browse and Earnings live as stack routes (drawer / flows), not tabs.
export type TabParamList = {
  Home: undefined;
  Account: undefined; // profile
  Activity: undefined; // notifications inbox (red unread badge in the bar)
};
