import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, Modal,
  StyleSheet, KeyboardAvoidingView, Platform, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFonts, Poppins_400Regular } from '@expo-google-fonts/poppins';
import { useStore } from '../store';
import { Favor, Transaction } from '../types';

// ---------------------------------------------------------------------------
// PROVIDER APP v.2 DARK design — "Accounts" (181:10039), "Earning History" and
// "Bank Information" (figma-ref/v2/accounts-profile-v2.png,
// earning-history-v2.png, bank-info-v2.png). Page fill #0D0A0A, navy sheets
// #252A38 (fields a shade lighter #2E3442), white primary buttons with black
// Poppins Medium labels, white Poppins headings, gray #B9B4B4 secondary.
// The shared useTheme() palette is LIGHT and must NOT drive colours here.
// ---------------------------------------------------------------------------
const D = {
  bg: '#0D0A0A', // page background
  sheet: '#252A38', // navy card / modal
  field: '#2E3442', // filled input field (a shade lighter than the sheet)
  text: '#FFFFFF',
  gray: '#B9B4B4', // secondary text
  grayDim: 'rgba(255,255,255,0.4)',
  divider: 'rgba(255,255,255,0.12)',
  border: 'rgba(255,255,255,0.10)',
  red: '#ED1C24',
  success: '#02CB00',
  ctaBg: '#FFFFFF', // v.2 primary CTA — white pill…
  ctaText: '#000000', // …with black Poppins Medium label
} as const;

const P_REGULAR = 'Poppins_400Regular'; // loaded locally (App.tsx registers 500/600/700)
const P_MEDIUM = 'Poppins_500Medium'; // registered app-wide in App.tsx
const P_SEMI = 'Poppins_600SemiBold';

// Poppins Regular isn't registered app-wide; expo-font caches globally so this
// resolves instantly after the first mount anywhere in the app.
function usePoppinsRegular() {
  const [loaded] = useFonts({ Poppins_400Regular });
  return loaded;
}

const DAY = 86400000;

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MON_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtDate(ms: number) {
  const d = new Date(ms);
  return `${d.getDate()} ${MON_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

// "24 Mar 2021, 12:00 PM" — receipt stamp for the Earning Detail Payment section.
function fmtStamp(ms: number) {
  const d = new Date(ms);
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h %= 12;
  if (h === 0) h = 12;
  const mm = m < 10 ? `0${m}` : `${m}`;
  return `${d.getDate()} ${MON_SHORT[d.getMonth()]} ${d.getFullYear()}, ${h}:${mm} ${ampm}`;
}

// Stable, per-favor transaction id (FNV-1a) so each receipt shows its own
// consistent id — mirrors the member Payment History Detail receipt.
function txnId(id?: string): string {
  if (!id) return 'N/A';
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const a = h.toString(36);
  const b = (Math.imul(h ^ 0x5bd1e995, 0x01000193) >>> 0).toString(36);
  return (a + b).padEnd(13, '0').slice(0, 13);
}

const money = (n: number) => `$${n.toFixed(2)}`;
const sumAmt = (items: Transaction[]) => items.reduce((s, t) => s + t.amount, 0);

function groupByMonth(items: Transaction[]) {
  const sorted = [...items].sort((a, b) => b.date - a.date);
  const groups: { key: string; items: Transaction[] }[] = [];
  for (const it of sorted) {
    const d = new Date(it.date);
    const key = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = { key, items: [] };
      groups.push(g);
    }
    g.items.push(it);
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Lightweight payout-account state, shared across the three screens in this
// file (the global store is owned by another module and must not be touched).
// A pal starts NOT connected — they only become payout-ready after saving valid
// bank details in BankInfo — instead of the old screen pre-claiming a fake
// "Stripe *1234" as connected on first visit.
// ---------------------------------------------------------------------------
const PAYOUT_LAST4 = '6789'; // matches the bank-info account (…789) the seed earnings paid to
const bankLabel = (last4: string) => `Bank ****${last4}`;

type AccountType = 'Savings' | 'Checking';
type PayoutAccount = { connected: boolean; last4: string; accountType: AccountType };
let _payout: PayoutAccount = { connected: false, last4: PAYOUT_LAST4, accountType: 'Savings' };
const _payoutSubs = new Set<() => void>();

function connectPayout(last4: string) {
  _payout = { ..._payout, connected: true, last4 };
  _payoutSubs.forEach((fn) => fn());
}

// v.2 Accounts frame carries a Savings ◉ / Checking ○ radio group — shared so
// the choice made on Accounts and on the Bank Information form stay in sync.
function setAccountType(t: AccountType) {
  _payout = { ..._payout, accountType: t };
  _payoutSubs.forEach((fn) => fn());
}

function usePayoutAccount(): PayoutAccount {
  const [, setTick] = useState(0);
  useEffect(() => {
    const fn = () => setTick((t) => t + 1);
    _payoutSubs.add(fn);
    return () => { _payoutSubs.delete(fn); };
  }, []);
  return _payout;
}

// Top bar per v.2 dark frames: back ARROW (not chevron) + centered title.
function DarkTopBar({ title, onBack, right }: { title: string; onBack?: () => void; right?: React.ReactNode }) {
  return (
    <View style={dark.topbar}>
      {onBack ? (
        <TouchableOpacity
          onPress={onBack}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={26} color={D.text} />
        </TouchableOpacity>
      ) : (
        <View style={{ width: 26 }} />
      )}
      <Text style={dark.topbarTitle}>{title}</Text>
      <View style={{ width: 26, alignItems: 'flex-end' }}>{right}</View>
    </View>
  );
}

// Small white payment badge on each row (v.2 frames show an Apple-Pay-style
// white chip; we render a card glyph since pal payouts land in their bank).
function PayBadge() {
  return (
    <View style={dark.payBadge}>
      <Ionicons name="card" size={15} color={D.ctaText} />
    </View>
  );
}

// v.2 radio — white ring, white inner dot when selected (Accounts frame).
function Radio({ selected }: { selected: boolean }) {
  return (
    <View style={dark.radioRing}>
      {selected ? <View style={dark.radioDot} /> : null}
    </View>
  );
}

// Rating stars for the Earning Detail Feedback section (amber, matching the
// shared theme's rating-star colour).
const STAR = '#FFBD00';
function Stars({ value }: { value: number }) {
  const filled = Math.round(value);
  return (
    <View style={{ flexDirection: 'row' }} accessibilityLabel={`${filled} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons
          key={i}
          name={i <= filled ? 'star' : 'star-outline'}
          size={20}
          color={STAR}
          style={{ marginRight: 4 }}
        />
      ))}
    </View>
  );
}

// v.2 primary button — white, 48h, r8, black Poppins Medium 15 label.
function WhiteBtn({
  label, onPress, disabled, accessibilityLabel, style,
}: {
  label: string; onPress: () => void; disabled?: boolean;
  accessibilityLabel?: string; style?: any;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      style={[dark.whiteBtn, { opacity: disabled ? 0.5 : 1 }, style]}
    >
      <Text style={dark.whiteBtnLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

// v.2 modal-card pattern for dark screens — centered navy card (#252A38, r16,
// ~85% width), white Poppins Medium title, gray body, white primary button.
function DarkInfoModal({
  visible, title, message, buttonLabel, onClose,
}: { visible: boolean; title: string; message: string; buttonLabel: string; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={dark.scrim}>
        <View style={dark.modalCard}>
          <Text style={dark.modalTitle}>{title}</Text>
          <Text style={dark.modalBody}>{message}</Text>
          <WhiteBtn label={buttonLabel} onPress={onClose} style={{ marginTop: 24, alignSelf: 'stretch' }} />
        </View>
      </View>
    </Modal>
  );
}

// Filled text field for the Bank Information form (navy #2E3442 fill).
function DarkField({
  label, value, onChangeText, keyboardType,
}: { label: string; value: string; onChangeText: (t: string) => void; keyboardType?: any }) {
  return (
    <View style={{ marginBottom: 20 }}>
      <Text style={dark.fieldLabel}>{label}</Text>
      <View style={dark.field}>
        <TextInput
          style={{ color: D.text, fontSize: 18, fontFamily: P_REGULAR }}
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          placeholderTextColor={D.grayDim}
          accessibilityLabel={label}
        />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// 1. Earnings — "Earning History" (dark, v.2): month section headers, rows of
//    white pay-badge + date + gray sub-line + $amount + chevron. The payout
//    summary (balance / pending / CASH OUT / next-payout) at the top is an
//    app addition — no v2 frame — restyled to the navy-card language.
// ---------------------------------------------------------------------------
export function Earnings({ navigation }: any) {
  const { earnings, cashOut, paymentsLive, connectStatus } = useStore();
  const payout = usePayoutAccount();
  const fontsReady = usePoppinsRegular();
  const groups = groupByMonth(earnings);
  const [cashing, setCashing] = useState(false);
  const [cashedOut, setCashedOut] = useState<number | null>(null);
  const [cashError, setCashError] = useState('');
  const [conn, setConn] = useState<{ onboarded: boolean; payoutsEnabled: boolean } | null>(null);

  // Reflect the real payout-account connection state (mirrors StripeOnboarding):
  // a pal is only payout-ready once a bank / Connect account is actually linked.
  useEffect(() => {
    if (!paymentsLive) return;
    const load = () => { void connectStatus().then(setConn); };
    load();
    const unsub = navigation.addListener('focus', load);
    return unsub;
  }, [navigation, paymentsLive]); // eslint-disable-line react-hooks/exhaustive-deps

  const connected = paymentsLive ? !!conn?.payoutsEnabled : payout.connected;

  const available = sumAmt(earnings.filter((e) => e.status === 'completed'));

  const onCashOut = async () => {
    if (cashing || available <= 0 || !connected) return;
    setCashing(true);
    setCashError('');
    try {
      const amount = await cashOut();
      setCashedOut(amount);
    } catch (e: any) {
      setCashError(e?.message || 'Could not cash out right now. Please try again.');
    } finally {
      setCashing(false);
    }
  };
  const pendingItems = earnings.filter((e) => e.status === 'in_progress');
  const pending = sumAmt(pendingItems);
  const total = sumAmt(earnings);
  const nextPayoutMs = pendingItems.length
    ? Math.max(...pendingItems.map((e) => e.date)) + 3 * DAY
    : null;
  const destLabel = bankLabel(payout.last4);

  if (!fontsReady) return <View style={{ flex: 1, backgroundColor: D.bg }} />; // flash-guard

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: D.bg }} edges={['top']}>
      <DarkTopBar
        title="Earning History"
        onBack={navigation.canGoBack() ? navigation.goBack : undefined}
        right={
          // app addition — no v2 frame (quick hop to the Accounts screen)
          <TouchableOpacity
            onPress={() => navigation.navigate('StripeOnboarding')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Payout account settings"
          >
            <Ionicons name="wallet-outline" size={23} color={D.text} />
          </TouchableOpacity>
        }
      />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Payout summary — app addition, no v2 frame (balance + cash out).
            Restyled to the v.2 navy card. */}
        <View
          style={dark.summary}
          accessible
          accessibilityLabel={`Available balance ${money(available)}. Pending ${money(pending)}. Total earned ${money(total)}.`}
        >
          <Text style={dark.summaryLabel}>Available balance</Text>
          <Text style={dark.summaryBalance}>{money(available)}</Text>

          <View style={{ flexDirection: 'row', marginTop: 16 }}>
            <View style={{ flex: 1 }}>
              <Text style={dark.summaryCaption}>Pending</Text>
              <Text style={dark.summaryStat}>{money(pending)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={dark.summaryCaption}>Total earned</Text>
              <Text style={dark.summaryStat}>{money(total)}</Text>
            </View>
          </View>

          {/* Instant cash-out — only once a payout account is connected. Until
              then we show an honest setup CTA (no fake bank, no cash-out). */}
          {connected ? (
            <>
              <WhiteBtn
                label={cashing ? 'CASHING OUT…' : available > 0 ? `CASH OUT ${money(available)}` : 'NO BALANCE TO CASH OUT'}
                onPress={onCashOut}
                disabled={cashing || available <= 0}
                accessibilityLabel={`Cash out ${money(available)}`}
                style={{ marginTop: 18 }}
              />
              {cashError ? (
                <Text style={dark.errorSm}>{cashError}</Text>
              ) : null}
            </>
          ) : (
            <WhiteBtn
              label="SET UP PAYOUTS TO GET PAID"
              onPress={() => navigation.navigate('StripeOnboarding')}
              accessibilityLabel="Set up payouts to get paid"
              style={{ marginTop: 18 }}
            />
          )}

          <View style={{ height: 1, backgroundColor: D.divider, marginVertical: 16 }} />

          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="calendar-outline" size={16} color={D.gray} />
            <Text style={dark.summaryNext}>
              {!connected
                ? 'Connect a bank account to receive your earnings.'
                : nextPayoutMs
                  ? `Next payout ${fmtDate(nextPayoutMs)} to ${destLabel}`
                  : 'No payouts scheduled'}
            </Text>
          </View>
          <Text style={dark.summaryFoot}>
            Payouts arrive 2-3 business days after a favor is completed.
          </Text>
        </View>

        <DarkInfoModal
          visible={cashedOut != null}
          title="Cash out started"
          message={`${money(cashedOut ?? 0)} is on its way to ${destLabel}. It typically arrives in 2-3 business days.`}
          buttonLabel="GOT IT"
          onClose={() => setCashedOut(null)}
        />

        {/* v.2 Earning History list — "March 2021" month headers, then rows:
            badge · "24 Mar 2021" / gray sub-line · $33.00 · chevron. */}
        {groups.map((g) => (
          <View key={g.key} style={{ marginTop: 32 }}>
            <Text style={dark.monthHeader}>{g.key}</Text>
            <View style={{ height: 1, backgroundColor: D.divider, marginTop: 14 }} />
            {g.items.map((item) => (
              <TouchableOpacity
                key={item.id}
                activeOpacity={0.7}
                onPress={() => navigation.navigate('EarningDetail', { txId: item.id })}
                style={dark.earnRow}
                accessibilityRole="button"
                accessibilityLabel={`${fmtDate(item.date)}, Favor payout, ${money(item.amount)}. View earning details`}
              >
                <PayBadge />
                <View style={{ flex: 1, marginLeft: 16 }}>
                  <Text style={dark.earnDate}>{fmtDate(item.date)}</Text>
                  {/* v.2 sub-line is the payment method; earnings carry none, so "Favor payout" */}
                  <Text style={dark.earnSub}>Favor payout</Text>
                </View>
                <Text style={dark.earnAmount}>{money(item.amount)}</Text>
                <Ionicons name="chevron-forward" size={20} color={D.text} style={{ marginTop: 3 }} />
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// 1b. EarningDetail — "Earning History → Detailed View" (dark, v.2). Reached by
//     tapping an Earning History row: the favor behind a payout, rendered in the
//     navy-sheet language with Description / Address / Favor Member / Payment
//     (amount + date-time + transaction id) / Feedback + Rating / Comment, wired
//     to the Transaction + its Favor from the store.
// ---------------------------------------------------------------------------
export function EarningDetail({ navigation, route }: any) {
  const { earnings, history, activeFavor } = useStore();
  const fontsReady = usePoppinsRegular();

  const txId: string | undefined = route?.params?.txId;
  const tx: Transaction | undefined = earnings.find((t) => t.id === txId) ?? earnings[0];
  const favor: Favor | undefined =
    history.find((f) => f.id === tx?.favorId) ??
    (activeFavor?.id === tx?.favorId ? activeFavor : undefined);

  const ts = tx?.date ?? favor?.scheduledFor ?? favor?.createdAt ?? Date.now();
  const amount = tx?.amount ?? favor?.total ?? 0;
  const memberName = favor?.memberName ?? 'Favor Member';
  const rating = favor?.rating ?? 0;

  const Divider = () => <View style={dark.detailDivider} />;

  if (!fontsReady) return <View style={{ flex: 1, backgroundColor: D.bg }} />; // flash-guard

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: D.bg }} edges={['top']}>
      <DarkTopBar title="Earning Detail" onBack={navigation.canGoBack() ? navigation.goBack : undefined} />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header — favor title + when it was completed */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
          <PayBadge />
          <View style={{ flex: 1, marginLeft: 16 }}>
            <Text style={dark.detailTitle}>{tx?.title ?? favor?.description ?? 'Favor payout'}</Text>
            <Text style={dark.detailStamp}>{fmtStamp(ts)}</Text>
          </View>
        </View>

        <Divider />

        {/* Description */}
        <View style={dark.detailSectionHead}>
          <Ionicons name="document-text" size={20} color={D.text} />
          <Text style={[dark.detailHeading, { marginLeft: 12 }]}>Description</Text>
        </View>
        <Text style={dark.detailBody}>
          {favor?.description ?? 'Details for this favor are unavailable.'}
        </Text>

        <Divider />

        {/* Address */}
        <View style={dark.detailSectionHead}>
          <Ionicons name="location" size={20} color={D.text} />
          <Text style={[dark.detailHeading, { marginLeft: 12 }]}>Address</Text>
        </View>
        <Text style={dark.detailBody}>{favor?.location?.address ?? 'Address unavailable.'}</Text>

        <Divider />

        {/* Favor Member */}
        <Text style={dark.detailHeading}>Favor Member</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14 }}>
          <View style={dark.memberAvatar}>
            <Ionicons name="person" size={22} color={D.text} />
          </View>
          <Text style={[dark.memberName, { marginLeft: 14 }]}>{memberName}</Text>
        </View>

        <Divider />

        {/* Payment — amount + date/time + transaction id */}
        <Text style={dark.detailHeading}>Payment</Text>
        <View style={dark.detailPayRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <PayBadge />
            <Text style={[dark.memberName, { marginLeft: 14 }]}>Favor payout</Text>
          </View>
          <Text style={dark.detailAmount}>{`+${money(amount)}`}</Text>
        </View>
        <View style={[dark.detailMetaRow, { marginTop: 16 }]}>
          <Text style={dark.detailRowLabel}>Date &amp; Time</Text>
          <Text style={dark.detailRowValue}>{fmtStamp(ts)}</Text>
        </View>
        <View style={[dark.detailMetaRow, { marginTop: 8 }]}>
          <Text style={dark.detailRowLabel}>Transaction ID</Text>
          <Text style={dark.detailRowValue}>{txnId(tx?.id ?? favor?.id)}</Text>
        </View>

        <Divider />

        {/* Feedback + Rating */}
        <Text style={dark.detailHeading}>Feedback</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14 }}>
          <Text style={[dark.detailHeading, { marginRight: 24 }]}>Rating</Text>
          <Stars value={rating} />
        </View>

        {/* Comment */}
        <Text style={[dark.detailHeading, { marginTop: 24 }]}>Comment</Text>
        <Text style={dark.detailBody}>{favor?.feedback ?? 'No comment was left for this favor.'}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// 2. StripeOnboarding — "Accounts" (181:10039, dark). "Bank Information"
//    section: Bank >, + Add Payment Method >, then Earning History >, then the
//    Savings ◉ / Checking ○ radio group. The first row keeps the REAL
//    connection behavior: it launches payout setup until the pal saves valid
//    bank details (then it shows the connected bank), rather than pre-claiming
//    a fake account.
// ---------------------------------------------------------------------------
export function StripeOnboarding({ navigation }: any) {
  const payout = usePayoutAccount();
  const fontsReady = usePoppinsRegular();
  const { paymentsLive, connectOnboard, connectStatus } = useStore();
  const [conn, setConn] = useState<{ onboarded: boolean; payoutsEnabled: boolean } | null>(null);
  const [opening, setOpening] = useState(false);

  // When payouts are live, reflect the real Connect status (refreshed on focus,
  // since onboarding completes on Stripe's hosted page).
  useEffect(() => {
    if (!paymentsLive) return;
    const load = () => { void connectStatus().then(setConn); };
    load();
    const unsub = navigation.addListener('focus', load);
    return unsub;
  }, [navigation, paymentsLive]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live: launch Stripe Connect onboarding. Mock: the manual bank form.
  const setupPayouts = async () => {
    if (!paymentsLive) { navigation.navigate('BankInfo'); return; }
    setOpening(true);
    try {
      const url = await connectOnboard();
      if (url) await Linking.openURL(url);
    } finally {
      setOpening(false);
    }
  };

  const connected = paymentsLive ? !!conn?.payoutsEnabled : payout.connected;

  if (!fontsReady) return <View style={{ flex: 1, backgroundColor: D.bg }} />; // flash-guard

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: D.bg }} edges={['top']}>
      <DarkTopBar title="Accounts" onBack={navigation.canGoBack() ? navigation.goBack : undefined} />
      <View style={{ paddingHorizontal: 20 }}>
        <Text style={acct.section}>Bank Information</Text>
        <View style={{ height: 1, backgroundColor: D.divider }} />

        {/* "Bank >" — the payout account. Not connected → launches payout setup
            (Stripe Connect when live, the manual form otherwise). Connected →
            opens the saved bank details for editing. */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={setupPayouts}
          style={acct.row}
          accessibilityRole="button"
          accessibilityLabel={connected
            ? `Bank. Payout account connected: ${paymentsLive ? 'Stripe payouts active' : bankLabel(payout.last4)}`
            : 'Bank. Set up payouts to get paid'}
        >
          <PayBadge />
          <View style={{ flex: 1, marginLeft: 16 }}>
            <Text style={acct.rowLabel}>{opening ? 'Opening…' : 'Bank'}</Text>
            {/* app addition — no v2 frame: honest connection status sub-line */}
            <Text style={acct.rowSub}>
              {connected
                ? (paymentsLive ? 'Payouts active (Stripe)' : bankLabel(payout.last4))
                : 'Set up payouts to get paid'}
            </Text>
          </View>
          {connected ? (
            <Ionicons name="checkmark-circle" size={18} color={D.success} style={{ marginRight: 8 }} />
          ) : null}
          <Ionicons name="chevron-forward" size={22} color={D.text} />
        </TouchableOpacity>

        {/* "+ Add Payment Method >" — add/edit bank info (Stripe Connect when
            live, else the manual form). */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => (paymentsLive ? setupPayouts() : navigation.navigate('BankInfo'))}
          style={acct.row}
          accessibilityRole="button"
          accessibilityLabel="Add Payment Method"
        >
          <View style={acct.iconSlot}>
            <Ionicons name="add" size={28} color={D.text} />
          </View>
          <Text style={[acct.rowLabel, { flex: 1, marginLeft: 16 }]}>Add Payment Method</Text>
          <Ionicons name="chevron-forward" size={22} color={D.text} />
        </TouchableOpacity>

        {/* gap between the payment rows and Earning History, per frame */}
        <View style={{ height: 34 }} />
        <View style={{ height: 1, backgroundColor: D.divider }} />

        {/* "Earning History >" */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => navigation.navigate('Earnings')}
          style={acct.row}
          accessibilityRole="button"
          accessibilityLabel="Earning History"
        >
          <View style={acct.iconSlot}>
            <Ionicons name="reader-outline" size={24} color={D.text} />
          </View>
          <Text style={[acct.rowLabel, { flex: 1, marginLeft: 16 }]}>Earning History</Text>
          <Ionicons name="chevron-forward" size={22} color={D.text} />
        </TouchableOpacity>

        {/* Savings ◉ / Checking ○ radio group, per frame */}
        <View style={{ marginTop: 30 }}>
          {(['Savings', 'Checking'] as const).map((opt) => {
            const sel = payout.accountType === opt;
            return (
              <TouchableOpacity
                key={opt}
                activeOpacity={0.7}
                onPress={() => setAccountType(opt)}
                style={acct.radioRow}
                accessibilityRole="radio"
                accessibilityState={{ selected: sel }}
                accessibilityLabel={`${opt} account`}
              >
                <Radio selected={sel} />
                <Text style={acct.radioLabel}>{opt} account</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// 3. BankInfo — "Bank Information" form (dark, v.2 bank-info frame). Prefilled
//    to match the reference, but SAVE VALIDATES (required fields, 9-digit
//    routing, account == confirm) and, on success, marks the payout account
//    connected and confirms it before returning — instead of silently
//    navigating away.
// ---------------------------------------------------------------------------
export function BankInfo({ navigation }: any) {
  const { user } = useStore();
  const payout = usePayoutAccount();
  const fontsReady = usePoppinsRegular();
  const [accountName, setAccountName] = useState(user ? `${user.firstName} ${user.lastName}` : 'Anton Vanko');
  const [bankName, setBankName] = useState('Bank of America');
  const [routing, setRouting] = useState('123456789');
  const [accountNumber, setAccountNumber] = useState('123 - 456 - 789');
  const [confirmAccount, setConfirmAccount] = useState('123 - 456 - 789');
  const [error, setError] = useState<string | null>(null);
  const [savedLast4, setSavedLast4] = useState<string | null>(null);

  // Clear the validation error as soon as the pal edits any field.
  const edit = (setter: (t: string) => void) => (t: string) => {
    setter(t);
    if (error) setError(null);
  };

  const onSave = () => {
    const name = accountName.trim();
    const bank = bankName.trim();
    const rt = routing.replace(/\D/g, '');
    const acctNo = accountNumber.replace(/\D/g, '');
    const conf = confirmAccount.replace(/\D/g, '');

    if (!name) return setError('Enter the account holder name.');
    if (!bank) return setError('Enter the bank name.');
    if (rt.length !== 9) return setError('Routing number must be 9 digits.');
    if (acctNo.length < 4) return setError('Enter a valid account number.');
    if (acctNo !== conf) return setError("Account numbers don't match.");

    setError(null);
    const last4 = acctNo.slice(-4);
    connectPayout(last4);
    setSavedLast4(last4);
  };

  if (!fontsReady) return <View style={{ flex: 1, backgroundColor: D.bg }} />; // flash-guard

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: D.bg }} edges={['top', 'bottom']}>
      <DarkTopBar title="Bank Information" onBack={navigation.canGoBack() ? navigation.goBack : undefined} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingTop: 28, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <DarkField label="Account Name" value={accountName} onChangeText={edit(setAccountName)} />
          <DarkField label="Bank Name" value={bankName} onChangeText={edit(setBankName)} />
          <DarkField label="Routing Number" value={routing} onChangeText={edit(setRouting)} keyboardType="number-pad" />
          <DarkField label="Account Number" value={accountNumber} onChangeText={edit(setAccountNumber)} />
          <DarkField label="Confirm Account Number" value={confirmAccount} onChangeText={edit(setConfirmAccount)} />

          {/* app addition — no v2 frame (v.2 shows this radio group on the
              Accounts screen); kept here too, styled to the same radios and
              synced with the Accounts selection. */}
          <Text style={[dark.fieldLabel, { marginTop: 4, marginBottom: 12 }]}>Account Type</Text>
          {(['Savings', 'Checking'] as const).map((opt) => {
            const sel = payout.accountType === opt;
            return (
              <TouchableOpacity
                key={opt}
                activeOpacity={0.7}
                onPress={() => setAccountType(opt)}
                style={acct.radioRow}
                accessibilityRole="radio"
                accessibilityState={{ selected: sel }}
                accessibilityLabel={`${opt} account`}
              >
                <Radio selected={sel} />
                <Text style={acct.radioLabel}>{opt} account</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12 }}>
          {error ? (
            <View
              accessibilityLiveRegion="polite"
              style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}
            >
              <Ionicons name="alert-circle" size={18} color={D.red} style={{ marginRight: 6 }} />
              <Text style={[dark.errorSm, { flex: 1, marginTop: 0 }]}>{error}</Text>
            </View>
          ) : null}
          {/* v.2 primary CTA — white, black Poppins Medium "SAVE" */}
          <WhiteBtn label="SAVE" onPress={onSave} />
        </View>
      </KeyboardAvoidingView>

      <DarkInfoModal
        visible={savedLast4 !== null}
        title="Card Added"
        message={`You have successfully added your Bank Card information. Your payouts will be deposited to ${bankLabel(savedLast4 ?? PAYOUT_LAST4)}, arriving 2-3 business days after a favor is completed.`}
        buttonLabel="OKAY"
        onClose={() => {
          setSavedLast4(null);
          // Return to the Accounts (StripeOnboarding) screen, which now reflects
          // the connected payout account via the usePayoutAccount() subscription.
          if (navigation.canGoBack()) navigation.goBack();
          else navigation.navigate('StripeOnboarding');
        }}
      />
    </SafeAreaView>
  );
}

const dark = StyleSheet.create({
  topbar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: D.border,
  },
  topbarTitle: { fontFamily: P_MEDIUM, fontSize: 21, color: D.text },
  // Payout summary (app addition) — navy v.2 card
  summary: {
    marginTop: 12,
    backgroundColor: D.sheet,
    borderRadius: 16,
    padding: 20,
  },
  summaryLabel: { fontFamily: P_REGULAR, fontSize: 14, color: D.gray },
  summaryBalance: { fontFamily: P_SEMI, fontSize: 30, color: D.text, marginTop: 2 },
  summaryCaption: { fontFamily: P_REGULAR, fontSize: 13, color: D.gray },
  summaryStat: { fontFamily: P_MEDIUM, fontSize: 20, color: D.text, marginTop: 2 },
  summaryNext: { fontFamily: P_REGULAR, fontSize: 14, color: D.text, marginLeft: 8, flex: 1 },
  summaryFoot: { fontFamily: P_REGULAR, fontSize: 13, color: D.gray, marginTop: 6 },
  errorSm: { fontFamily: P_REGULAR, fontSize: 13, color: D.red, marginTop: 8 },
  whiteBtn: {
    height: 48,
    borderRadius: 8,
    backgroundColor: D.ctaBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  whiteBtnLabel: { fontFamily: P_MEDIUM, fontSize: 15, color: D.ctaText, letterSpacing: 0.5 },
  payBadge: {
    width: 38,
    height: 26,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  monthHeader: { fontFamily: P_MEDIUM, fontSize: 20, color: D.text },
  earnRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: D.divider,
  },
  earnDate: { fontFamily: P_MEDIUM, fontSize: 19, lineHeight: 26, color: D.text },
  earnSub: { fontFamily: P_REGULAR, fontSize: 16, color: D.gray, marginTop: 6 },
  earnAmount: { fontFamily: P_MEDIUM, fontSize: 19, lineHeight: 26, color: D.text, marginRight: 12 },
  radioRing: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: '#FFFFFF' },
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCard: {
    width: '85%',
    backgroundColor: D.sheet,
    borderRadius: 16,
    paddingHorizontal: 24,
    paddingVertical: 28,
    alignItems: 'center',
  },
  modalTitle: { fontFamily: P_MEDIUM, fontSize: 22, color: D.text, textAlign: 'center' },
  modalBody: { fontFamily: P_REGULAR, fontSize: 15, lineHeight: 22, color: D.gray, textAlign: 'center', marginTop: 12 },
  fieldLabel: { fontFamily: P_REGULAR, fontSize: 17, color: D.text, marginBottom: 8 },
  field: {
    backgroundColor: D.field,
    borderRadius: 10,
    paddingHorizontal: 18,
    minHeight: 56,
    justifyContent: 'center',
  },
  // Earning Detail (dark "Detailed View") sections
  detailDivider: { height: 1, backgroundColor: D.divider, marginVertical: 20 },
  detailSectionHead: { flexDirection: 'row', alignItems: 'center' },
  detailTitle: { fontFamily: P_SEMI, fontSize: 20, color: D.text },
  detailStamp: { fontFamily: P_REGULAR, fontSize: 14, color: D.gray, marginTop: 4 },
  detailHeading: { fontFamily: P_MEDIUM, fontSize: 17, color: D.text },
  detailBody: { fontFamily: P_REGULAR, fontSize: 15, lineHeight: 22, color: D.gray, marginTop: 8 },
  detailPayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  detailAmount: { fontFamily: P_MEDIUM, fontSize: 19, color: D.text },
  detailMetaRow: { flexDirection: 'row', alignItems: 'center' },
  detailRowLabel: { fontFamily: P_REGULAR, fontSize: 14, color: D.gray, width: 120 },
  detailRowValue: { fontFamily: P_REGULAR, fontSize: 14, color: D.text, flex: 1 },
  memberAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: D.field,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberName: { fontFamily: P_MEDIUM, fontSize: 18, color: D.text },
});

const acct = StyleSheet.create({
  section: { fontFamily: P_MEDIUM, fontSize: 18, color: D.text, marginTop: 28, marginBottom: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: D.divider,
  },
  iconSlot: { width: 38, alignItems: 'center', marginTop: 2 },
  rowLabel: { fontFamily: P_MEDIUM, fontSize: 19, color: D.text },
  rowSub: { fontFamily: P_REGULAR, fontSize: 13, color: D.gray, marginTop: 2 },
  radioRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  radioLabel: { fontFamily: P_REGULAR, fontSize: 19, color: D.text, marginLeft: 16 },
});
