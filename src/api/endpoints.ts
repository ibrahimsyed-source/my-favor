import { apiRequest } from './client';
import {
  User, Favor, PaymentCard, Transaction, Thread, Message, AppNotification, Role, UserStatus, Review,
} from '../types';

// Typed wrappers over the backend routes. Response shapes mirror the server's
// serializers (server/src/lib/serialize.ts), which were built to match the
// app's domain types in src/types.

type Session = { user: User; accessToken: string; refreshToken: string };

// --- app config (public, no auth) — maintenance + minimum-version gate ---
export const getConfigApi = () =>
  apiRequest<{ maintenance: boolean; minVersion: string }>('/api/config');

// --- auth ---
export const signupApi = (data: {
  firstName: string; lastName: string; email: string; phone: string; password: string; role?: Role;
  ageAffirmed: boolean; acceptedTerms: boolean; dateOfBirth?: string;
}) => apiRequest<{ userId: string; destination: string; otpSent: boolean; devCode?: string }>('/api/auth/signup', { method: 'POST', body: data });

export const verifyOtpApi = (destination: string, code: string) =>
  apiRequest<Session>('/api/auth/verify-otp', { method: 'POST', body: { destination, code } });

export const resendOtpApi = (destination: string, purpose: 'signup' | 'login' | 'reset' = 'signup') =>
  apiRequest<{ otpSent: boolean; devCode?: string }>('/api/auth/resend-otp', { method: 'POST', body: { destination, purpose } });

export const loginApi = (email: string, password: string) =>
  apiRequest<Session>('/api/auth/login', { method: 'POST', body: { email, password } });

export const logoutApi = (refreshToken: string) =>
  apiRequest<{ ok: boolean }>('/api/auth/logout', { method: 'POST', body: { refreshToken } });

export const changePasswordApi = (currentPassword: string, newPassword: string) =>
  apiRequest<{ ok: boolean }>('/api/auth/change-password', { method: 'POST', auth: true, body: { currentPassword, newPassword } });

export const forgotPasswordApi = (email: string) =>
  apiRequest<{ otpSent: boolean; devCode?: string }>('/api/auth/forgot-password', { method: 'POST', body: { email } });

export const resetPasswordApi = (email: string, code: string, password: string) =>
  apiRequest<{ ok: boolean }>('/api/auth/reset-password', { method: 'POST', body: { email, code, password } });

export const deleteAccountApi = () =>
  apiRequest<{ ok: boolean }>('/api/auth/account', { method: 'DELETE', auth: true });

// --- profile ---
export const getMeApi = () => apiRequest<{ user: User }>('/api/profile/me', { auth: true });
export const updateProfileApi = (patch: Partial<User>) =>
  apiRequest<{ user: User }>('/api/profile/me', { method: 'PATCH', auth: true, body: patch });
export const setRoleApi = (role: Role) =>
  apiRequest<{ user: User }>('/api/profile/role', { method: 'POST', auth: true, body: { role } });
// Submit the pal vetting application (Driver Information). On success the returned
// user has palVerified=true, unlocking favor acceptance.
export const verifyPalApi = (data: {
  legalFirstName: string; legalLastName: string; ssn: string; dateOfBirth: string; consent: boolean;
}) => apiRequest<{ user: User }>('/api/profile/verify-pal', { method: 'POST', auth: true, body: data });
export const setStatusApi = (status: UserStatus) =>
  apiRequest<{ user: User }>('/api/profile/status', { method: 'POST', auth: true, body: { status } });
export const getPalsApi = () => apiRequest<{ pals: Partial<User>[] }>('/api/profile/pals', { auth: true });
export const getPalApi = (id: string) => apiRequest<{ pal: Partial<User> }>(`/api/profile/pals/${id}`, { auth: true });
export const getPalReviewsApi = (id: string) => apiRequest<{ reviews: Review[] }>(`/api/profile/pals/${id}/reviews`, { auth: true });

// --- favors ---
export type CreateFavorInput = {
  tier: string; price?: number; description: string; images?: string[];
  location: { lat: number; lng: number; address: string }; scheduledFor?: number; hours?: number;
};
export const createFavorApi = (input: CreateFavorInput) =>
  apiRequest<{ favor: Favor }>('/api/favors', { method: 'POST', auth: true, body: input });
export const getFavorsApi = () => apiRequest<{ favors: Favor[] }>('/api/favors', { auth: true });
export const getActiveFavorApi = () => apiRequest<{ favor: Favor | null }>('/api/favors/active', { auth: true });
export const getIncomingApi = () => apiRequest<{ favors: Favor[] }>('/api/favors/incoming', { auth: true });
export const getFavorApi = (id: string) => apiRequest<{ favor: Favor }>(`/api/favors/${id}`, { auth: true });
export const acceptFavorApi = (id: string) => apiRequest<{ favor: Favor }>(`/api/favors/${id}/accept`, { method: 'POST', auth: true });
export const declineFavorApi = (id: string) => apiRequest<{ ok: boolean }>(`/api/favors/${id}/decline`, { method: 'POST', auth: true });
export const abandonFavorApi = (id: string) => apiRequest<{ ok: boolean }>(`/api/favors/${id}/abandon`, { method: 'POST', auth: true });
export const assignPalApi = (id: string, palId: string) => apiRequest<{ favor: Favor }>(`/api/favors/${id}/assign`, { method: 'POST', auth: true, body: { palId } });
export const advanceFavorApi = (id: string, status: string) => apiRequest<{ favor: Favor }>(`/api/favors/${id}/advance`, { method: 'POST', auth: true, body: { status } });
export const finishFavorApi = (id: string) => apiRequest<{ favor: Favor; payout: number }>(`/api/favors/${id}/finish`, { method: 'POST', auth: true });
export const cancelFavorApi = (id: string) => apiRequest<{ favor: Favor; cancellation: { fee: number; refund: number } }>(`/api/favors/${id}/cancel`, { method: 'POST', auth: true });
export const rateFavorApi = (id: string, body: { rating: number; feedback: string; tip?: number }) =>
  apiRequest<{ favor: Favor }>(`/api/favors/${id}/rate`, { method: 'POST', auth: true, body });
export const rateMemberApi = (id: string, body: { rating: number; feedback: string }) =>
  apiRequest<{ ok: boolean }>(`/api/favors/${id}/rate-member`, { method: 'POST', auth: true, body });

// --- payments ---
export const getCardsApi = () => apiRequest<{ cards: PaymentCard[] }>('/api/payments/cards', { auth: true });
export const addCardApi = (card: { brand: string; last4: string; expMonth: number; expYear: number }) =>
  apiRequest<{ card: PaymentCard }>('/api/payments/cards', { method: 'POST', auth: true, body: card });
export const removeCardApi = (id: string) => apiRequest<{ ok: boolean }>(`/api/payments/cards/${id}`, { method: 'DELETE', auth: true });
export const getTransactionsApi = () => apiRequest<{ transactions: Transaction[] }>('/api/payments/transactions', { auth: true });
export const getEarningsApi = () => apiRequest<{ earnings: Transaction[] }>('/api/payments/earnings', { auth: true });
export const cashoutApi = () => apiRequest<{ ok: boolean; amount: number; count: number }>('/api/payments/cashout', { method: 'POST', auth: true });

// Stripe (hosted-page flow — no native SDK)
export const getPaymentsConfigApi = () => apiRequest<{ stripeEnabled: boolean }>('/api/payments/config', { auth: true });
export const createSetupCheckoutApi = (successUrl: string, cancelUrl: string) =>
  apiRequest<{ url: string }>('/api/payments/checkout/setup', { method: 'POST', auth: true, body: { successUrl, cancelUrl } });
export const syncCardsApi = () => apiRequest<{ cards: PaymentCard[] }>('/api/payments/cards/sync', { method: 'POST', auth: true });
export const connectOnboardApi = (returnUrl: string, refreshUrl: string) =>
  apiRequest<{ url: string }>('/api/payments/connect/onboard', { method: 'POST', auth: true, body: { returnUrl, refreshUrl } });
export const connectStatusApi = () =>
  apiRequest<{ onboarded: boolean; payoutsEnabled: boolean; detailsSubmitted: boolean; enabled: boolean }>('/api/payments/connect/status', { auth: true });

// --- messaging ---
export const getThreadsApi = () => apiRequest<{ threads: Thread[] }>('/api/messages/threads', { auth: true });
export const getMessagesApi = (threadId: string) => apiRequest<{ messages: Message[] }>(`/api/messages/threads/${threadId}/messages`, { auth: true });
export const sendMessageApi = (threadId: string, text: string) =>
  apiRequest<{ message: Message }>(`/api/messages/threads/${threadId}/messages`, { method: 'POST', auth: true, body: { text } });
export const createThreadApi = (withUserId: string) =>
  apiRequest<{ thread: Thread }>('/api/messages/threads', { method: 'POST', auth: true, body: { withUserId } });

// --- notifications ---
export const getNotificationsApi = () => apiRequest<{ notifications: AppNotification[] }>('/api/notifications', { auth: true });
export const markNotificationReadApi = (id: string) => apiRequest<{ ok: boolean }>(`/api/notifications/${id}/read`, { method: 'POST', auth: true });
export const markAllNotificationsReadApi = () => apiRequest<{ ok: boolean }>('/api/notifications/read-all', { method: 'POST', auth: true });

// --- moderation ---
export const reportUserApi = (userId: string, reason?: string) =>
  apiRequest<{ ok: boolean }>('/api/moderation/report', { method: 'POST', auth: true, body: { userId, reason } });
export const blockUserApi = (userId: string) =>
  apiRequest<{ ok: boolean }>('/api/moderation/block', { method: 'POST', auth: true, body: { userId } });
export const getBlockedApi = () => apiRequest<{ blocked: string[] }>('/api/moderation/blocked', { auth: true });
