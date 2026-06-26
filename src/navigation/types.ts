// Central route contract. Every screen module navigates by these names.
// Typing is intentionally loose (params: any) so feature modules stay decoupled.

export type RootStackParamList = {
  // --- Auth ---
  Launch: undefined;
  Welcome: undefined;
  SignupLogin: undefined;
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
  PalFavorDetail: { favorId: string };
  PalFavorInProgress: undefined;
  Navigation: undefined;
  PalFavorComplete: undefined;
  PalFavorSuccess: { payout?: number } | undefined;
  Earnings: undefined;
  StripeOnboarding: undefined;
  BankInfo: undefined;
  Vetting: undefined; // pal identity/background verification

  // --- Shared ---
  SideDrawer: undefined;
  MessageThread: { threadId: string };
  EditProfile: undefined;
  Settings: undefined;
  SetStatus: undefined;
  Payment: undefined;
  AddCard: undefined;
  FavorHistory: undefined;
  FavorHistoryDetail: { favorId: string };
  Help: undefined;
  Notifications: undefined;
};

export type TabParamList = {
  Home: undefined;
  Messages: undefined;
  History: undefined;
  Earnings: undefined; // pal-only tab
  Profile: undefined;
};
