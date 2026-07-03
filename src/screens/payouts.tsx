import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, Modal,
  StyleSheet, KeyboardAvoidingView, Platform, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFonts, Poppins_400Regular } from '@expo-google-fonts/poppins';
import { useStore } from '../store';
import { Transaction } from '../types';

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
              <View
                key={item.id}
                style={dark.earnRow}
                accessible
                accessibilityLabel={`${fmtDate(item.date)}, Favor payout, ${money(item.amount)}`}
              >
                <PayBadge />
                <View style={{ flex: 1, marginLeft: 16 }}>
                  <Text style={dark.earnDate}>{fmtDate(item.date)}</Text>
                  {/* v.2 sub-line is the payment method; earnings carry none, so "Favor payout" */}
                  <Text style={dark.earnSub}>Favor payout</Text>
                </View>
                <Text style={dark.earnAmount}>{money(item.amount)}</Text>
                <Ionicons name="chevron-forward" size={20} color={D.text} style={{ marginTop: 3 }} />
              </View>
            ))}
          </View>
        ))}
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
        title="Bank account connected"
        message={`Your payouts will be deposited to ${bankLabel(savedLast4 ?? PAYOUT_LAST4)}. Funds arrive 2-3 business days after a favor is completed.`}
        buttonLabel="DONE"
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
