// Central route contract. Every screen module navigates by these names.
// Typing is intentionally loose (params: any) so feature modules stay decoupled.

export type RootStackParamList = {
  // --- Auth --- (app opens on Login; onboarding carousel removed)
  Login: undefined;
  Signup: undefined;
  OtpVerify: { context?: 'signup' | 'reset' } | undefined;
  ForgotPassword: undefined;
  NewPassword: undefined;

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
  ProviderDetail: { palId: string };
  FavorTracking: undefined;
  OrderComplete: undefined;

  // --- Pal: provide-a-favor flow ---
  BrowseFavors: undefined; // list of all open favor requests to browse + accept
  PalFavorDetail: { favorId: string };
  PalFavorInProgress: undefined;
  Navigation: undefined;
  PalFavorComplete: undefined;
  PalFavorSuccess: { payout?: number } | undefined;
  Earnings: undefined;
  EarningDetail: { txId: string };
  StripeOnboarding: undefined;
  BankInfo: undefined;
  Vetting: undefined; // pal identity/background verification

  // --- Shared ---
  SideDrawer: undefined;
  Messages: undefined; // conversations list (was a tab pre-v2-dashboard)
  MessageThread: { threadId: string };
  EditProfile: undefined;
  Settings: undefined;
  SetStatus: undefined;
  Payment: undefined;
  AddCard: undefined;
  History: undefined; // favor history — opened from the side menu
  FavorHistory: undefined;
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
