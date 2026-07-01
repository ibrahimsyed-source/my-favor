import React, { useEffect, useState } from 'react';
import {
  View, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, KeyboardAvoidingView, Platform, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Txt, Button, InfoModal } from '../components';
import { tokens, fonts } from '../theme';
import { useStore } from '../store';
import { Transaction } from '../types';

// ---------------------------------------------------------------------------
// "User App v.2" DARK design. These payout surfaces (Earning History, the
// Account/Bank Information settings and the Bank Information form) are
// intentionally DARK — the shared useTheme() palette is LIGHT (used by the auth
// screens) and must NOT drive backgrounds/text here. Instead we drive every
// colour from the local dark palette below, matching the v.2 reference exactly.
// ---------------------------------------------------------------------------
const D = {
  bg: '#0C0C0C', // screen background
  card: '#171922', // summary card / raised panel
  cardAlt: '#1B222C',
  field: '#1C2331', // filled input field (navy)
  fieldAlt: '#2E3A44',
  text: '#FFFFFF',
  textSecondary: 'rgba(255,255,255,0.6)',
  textTertiary: 'rgba(255,255,255,0.4)',
  border: 'rgba(255,255,255,0.10)',
  divider: 'rgba(255,255,255,0.10)',
  red: '#ED1C24',
  star: '#FFBD00',
  success: '#02CB00',
  ctaBg: '#FFFFFF', // v.2 primary CTA — white pill…
  ctaText: '#141414', // …with dark text/icons
  badgeBg: '#FFFFFF',
} as const;

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

type PayoutAccount = { connected: boolean; last4: string };
let _payout: PayoutAccount = { connected: false, last4: PAYOUT_LAST4 };
const _payoutSubs = new Set<() => void>();

function connectPayout(last4: string) {
  _payout = { connected: true, last4 };
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

// Top bar (chevron + centered title) for the dark payout screens.
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
          <Ionicons name="chevron-back" size={26} color={D.text} />
        </TouchableOpacity>
      ) : (
        <View style={{ width: 26 }} />
      )}
      <Txt variant="h4" color={D.text}>{title}</Txt>
      <View style={{ width: 26, alignItems: 'flex-end' }}>{right}</View>
    </View>
  );
}

// Small white badge used on each earning row — a bank glyph, because pals are
// paid out to their connected bank account (Apple Pay is how the MEMBER pays in,
// never how the PAL is paid).
function BankBadge() {
  return (
    <View style={dark.payBadge}>
      <Ionicons name="business" size={15} color={D.ctaText} />
    </View>
  );
}

// Filled text field for the Bank Information form (navy raised field).
function DarkField({
  label, value, onChangeText, keyboardType,
}: { label: string; value: string; onChangeText: (t: string) => void; keyboardType?: any }) {
  return (
    <View style={{ marginBottom: 18 }}>
      <Txt variant="label" color={D.text} style={{ marginBottom: 8 }}>{label}</Txt>
      <View style={dark.field}>
        <TextInput
          style={{ color: D.text, fontSize: 18, fontFamily: fonts.bodyRegular }}
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          placeholderTextColor={D.textTertiary}
          accessibilityLabel={label}
        />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// 1. Earnings — "Earning History" (dark). Leads with a payout summary
//    (available balance, pending, total earned, next-payout date + cadence) and
//    each row names the real destination bank instead of the member's Apple Pay.
// ---------------------------------------------------------------------------
export function Earnings({ navigation }: any) {
  const { earnings, cashOut, paymentsLive, connectStatus } = useStore();
  const payout = usePayoutAccount();
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
  // Never name a bank we aren't actually paying out to.
  const rowDest = connected ? destLabel : 'Awaiting payout setup';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: D.bg }} edges={['top']}>
      <DarkTopBar
        title="Earning History"
        onBack={navigation.canGoBack() ? navigation.goBack : undefined}
        right={
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
        {/* Payout summary — answers "what's my balance and when do I get paid?" */}
        <View
          style={dark.summary}
          accessible
          accessibilityLabel={`Available balance ${money(available)}. Pending ${money(pending)}. Total earned ${money(total)}.`}
        >
          <Txt variant="bodySm" color={D.textSecondary}>Available balance</Txt>
          <Txt variant="h1" color={D.text} style={{ marginTop: 2 }}>{money(available)}</Txt>

          <View style={{ flexDirection: 'row', marginTop: 16 }}>
            <View style={{ flex: 1 }}>
              <Txt variant="caption" color={D.textTertiary}>Pending</Txt>
              <Txt variant="h4" color={D.text} style={{ marginTop: 2 }}>{money(pending)}</Txt>
            </View>
            <View style={{ flex: 1 }}>
              <Txt variant="caption" color={D.textTertiary}>Total earned</Txt>
              <Txt variant="h4" color={D.text} style={{ marginTop: 2 }}>{money(total)}</Txt>
            </View>
          </View>

          {/* Instant cash-out — only once a payout account is connected. Until
              then we show an honest setup CTA (no fake bank, no cash-out). */}
          {connected ? (
            <>
              <TouchableOpacity
                onPress={onCashOut}
                disabled={cashing || available <= 0}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`Cash out ${money(available)}`}
                accessibilityState={{ disabled: cashing || available <= 0 }}
                style={[dark.cashBtn, { opacity: cashing || available <= 0 ? 0.5 : 1 }]}
              >
                <Ionicons name="cash-outline" size={18} color={D.ctaText} />
                <Txt variant="button" color={D.ctaText} style={{ marginLeft: 8 }}>
                  {cashing ? 'Cashing out…' : available > 0 ? `Cash out ${money(available)}` : 'No balance to cash out'}
                </Txt>
              </TouchableOpacity>
              {cashError ? (
                <Txt variant="caption" color={D.red} style={{ marginTop: 8 }}>{cashError}</Txt>
              ) : null}
            </>
          ) : (
            <TouchableOpacity
              onPress={() => navigation.navigate('StripeOnboarding')}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Set up payouts to get paid"
              style={dark.cashBtn}
            >
              <Ionicons name="card-outline" size={18} color={D.ctaText} />
              <Txt variant="button" color={D.ctaText} style={{ marginLeft: 8 }}>
                Set up payouts to get paid
              </Txt>
            </TouchableOpacity>
          )}

          <View style={{ height: 1, backgroundColor: D.divider, marginVertical: 16 }} />

          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="calendar-outline" size={16} color={D.textSecondary} />
            <Txt variant="bodySm" color={D.text} style={{ marginLeft: 8, flex: 1 }}>
              {!connected
                ? 'Connect a bank account to receive your earnings.'
                : nextPayoutMs
                  ? `Next payout ${fmtDate(nextPayoutMs)} to ${destLabel}`
                  : 'No payouts scheduled'}
            </Txt>
          </View>
          <Txt variant="caption" color={D.textTertiary} style={{ marginTop: 6 }}>
            Payouts arrive 2-3 business days after a favor is completed.
          </Txt>
        </View>

        <InfoModal
          visible={cashedOut != null}
          title="Cash out started"
          message={`${money(cashedOut ?? 0)} is on its way to ${destLabel}. It typically arrives in 2-3 business days.`}
          buttonLabel="Got it"
          onClose={() => setCashedOut(null)}
        />

        {groups.map((g) => (
          <View key={g.key} style={{ marginTop: 28 }}>
            <Txt variant="h3" color={D.text}>{g.key}</Txt>
            <View style={{ height: 1, backgroundColor: D.divider, marginTop: 16 }} />
            {g.items.map((item) => (
              <View
                key={item.id}
                style={dark.earnRow}
                accessible
                accessibilityLabel={`${fmtDate(item.date)}, ${money(item.amount)}${connected ? ` to ${destLabel}` : ', awaiting payout setup'}`}
              >
                <BankBadge />
                <View style={{ flex: 1, marginLeft: 16 }}>
                  <Txt variant="body" color={D.text} style={{ fontSize: 19, lineHeight: 24 }}>
                    {fmtDate(item.date)}
                  </Txt>
                  <Txt variant="body" color={D.textSecondary} style={{ fontSize: 16, marginTop: 2 }}>
                    {rowDest}
                  </Txt>
                </View>
                <Txt variant="label" color={D.text} style={{ fontSize: 19, marginRight: 10 }}>
                  {money(item.amount)}
                </Txt>
                <Ionicons name="chevron-forward" size={22} color={D.textTertiary} />
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// 2. StripeOnboarding — "Account" settings (dark, same v.2 language). Bank
//    Information section. The first row reflects the REAL connection state: an
//    honest "Set up payouts to get paid" prompt until the pal saves valid bank
//    details (then it shows the connected bank), rather than pre-claiming a fake
//    account.
// ---------------------------------------------------------------------------
export function StripeOnboarding({ navigation }: any) {
  const payout = usePayoutAccount();
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: D.bg }} edges={['top']}>
      <DarkTopBar title="Account" onBack={navigation.canGoBack() ? navigation.goBack : undefined} />
      <View style={{ paddingHorizontal: 20 }}>
        <Txt variant="h4" color={D.textSecondary} style={{ marginTop: 20, marginBottom: 8 }}>
          Bank Information
        </Txt>
        <View style={{ height: 1, backgroundColor: D.divider }} />

        {/* Payout account — connected bank, or an honest not-yet-set-up prompt */}
        {connected ? (
          <View
            style={acct.row}
            accessible
            accessibilityLabel={`Payout account connected: ${bankLabel(payout.last4)}`}
          >
            <Ionicons name="card-outline" size={24} color={D.textSecondary} style={{ width: 30, marginRight: 14 }} />
            <Txt variant="body" color={D.text} style={{ flex: 1 }}>{paymentsLive ? 'Payouts active (Stripe)' : bankLabel(payout.last4)}</Txt>
            <Ionicons name="checkmark-circle" size={20} color={D.success} />
          </View>
        ) : (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={setupPayouts}
            style={acct.row}
            accessibilityRole="button"
            accessibilityLabel="Set up payouts to get paid"
          >
            <Ionicons name="card-outline" size={24} color={D.textSecondary} style={{ width: 30, marginRight: 14 }} />
            <Txt variant="body" color={D.text} style={{ flex: 1 }}>{opening ? 'Opening…' : 'Set up payouts to get paid'}</Txt>
            <Ionicons name="chevron-forward" size={22} color={D.textTertiary} />
          </TouchableOpacity>
        )}

        {/* Edit / add bank info — Stripe Connect when live, else the manual form */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => (paymentsLive ? setupPayouts() : navigation.navigate('BankInfo'))}
          style={acct.row}
          accessibilityRole="button"
          accessibilityLabel={connected ? 'Edit bank information' : 'Add bank information'}
        >
          <Ionicons name="pencil" size={22} color={D.textSecondary} style={{ width: 30, marginRight: 14 }} />
          <Txt variant="body" color={D.text} style={{ flex: 1 }}>
            {connected ? 'Edit Bank Information' : 'Add Bank Information'}
          </Txt>
          <Ionicons name="chevron-forward" size={22} color={D.textTertiary} />
        </TouchableOpacity>

        {/* Earning History → Earnings */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => navigation.navigate('Earnings')}
          style={[acct.row, { marginTop: 18 }]}
          accessibilityRole="button"
          accessibilityLabel="Earning History"
        >
          <Ionicons name="reader-outline" size={24} color={D.textSecondary} style={{ width: 30, marginRight: 14 }} />
          <Txt variant="h4" color={D.text} style={{ flex: 1 }}>Earning History</Txt>
          <Ionicons name="chevron-forward" size={24} color={D.textTertiary} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// 3. BankInfo — "Bank Information" form (dark). Prefilled to match the
//    reference, but SAVE VALIDATES (required fields, 9-digit routing,
//    account == confirm) and, on success, marks the payout account connected
//    and confirms it before returning — instead of silently navigating away.
// ---------------------------------------------------------------------------
export function BankInfo({ navigation }: any) {
  const { user } = useStore();
  const [accountName, setAccountName] = useState(user ? `${user.firstName} ${user.lastName}` : 'Anton Vanko');
  const [bankName, setBankName] = useState('Bank of America');
  const [routing, setRouting] = useState('123456789');
  const [accountNumber, setAccountNumber] = useState('123 - 456 - 789');
  const [confirmAccount, setConfirmAccount] = useState('123 - 456 - 789');
  const [accountType, setAccountType] = useState<'Savings' | 'Checking'>('Checking');
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
    const acct = accountNumber.replace(/\D/g, '');
    const conf = confirmAccount.replace(/\D/g, '');

    if (!name) return setError('Enter the account holder name.');
    if (!bank) return setError('Enter the bank name.');
    if (rt.length !== 9) return setError('Routing number must be 9 digits.');
    if (acct.length < 4) return setError('Enter a valid account number.');
    if (acct !== conf) return setError("Account numbers don't match.");

    setError(null);
    const last4 = acct.slice(-4);
    connectPayout(last4);
    setSavedLast4(last4);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: D.bg }} edges={['top', 'bottom']}>
      <DarkTopBar title="Bank Information" onBack={navigation.canGoBack() ? navigation.goBack : undefined} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingTop: 24, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <DarkField label="Account Name" value={accountName} onChangeText={edit(setAccountName)} />
          <DarkField label="Bank Name" value={bankName} onChangeText={edit(setBankName)} />
          <DarkField label="Routing Number" value={routing} onChangeText={edit(setRouting)} keyboardType="number-pad" />
          <DarkField label="Account Number" value={accountNumber} onChangeText={edit(setAccountNumber)} />
          <DarkField label="Confirm Account Number" value={confirmAccount} onChangeText={edit(setConfirmAccount)} />

          <Txt variant="label" color={D.text} style={{ marginBottom: 10 }}>Account Type</Txt>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {(['Savings', 'Checking'] as const).map((opt) => {
              const sel = accountType === opt;
              return (
                <TouchableOpacity
                  key={opt}
                  activeOpacity={0.8}
                  onPress={() => setAccountType(opt)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: sel }}
                  accessibilityLabel={`${opt} account`}
                  style={{
                    flex: 1,
                    height: 52,
                    borderRadius: tokens.radius.md,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    backgroundColor: sel ? D.ctaBg : D.field,
                    borderWidth: sel ? 0 : 1,
                    borderColor: D.border,
                  }}
                >
                  {sel && <Ionicons name="checkmark-circle" size={18} color={D.ctaText} />}
                  <Txt variant="label" color={sel ? D.ctaText : D.textSecondary}>{opt}</Txt>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
        <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12 }}>
          {error ? (
            <View
              accessibilityLiveRegion="polite"
              style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}
            >
              <Ionicons name="alert-circle" size={18} color={D.red} style={{ marginRight: 6 }} />
              <Txt variant="bodySm" color={D.red} style={{ flex: 1 }}>{error}</Txt>
            </View>
          ) : null}
          {/* v.2 primary CTA — white pill with dark uppercase text */}
          <Button title="Save" variant="white" onPress={onSave} />
        </View>
      </KeyboardAvoidingView>

      <InfoModal
        visible={savedLast4 !== null}
        title="Bank account connected"
        message={`Your payouts will be deposited to ${bankLabel(savedLast4 ?? PAYOUT_LAST4)}. Funds arrive 2-3 business days after a favor is completed.`}
        buttonLabel="Done"
        onClose={() => {
          setSavedLast4(null);
          // Return to the Account (StripeOnboarding) screen, which now reflects
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
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: D.border,
  },
  summary: {
    marginTop: 12,
    backgroundColor: D.card,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: D.border,
    padding: 20,
  },
  cashBtn: {
    marginTop: 18,
    height: 48,
    borderRadius: tokens.radius.md,
    backgroundColor: D.ctaBg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  payBadge: {
    width: 40,
    height: 26,
    borderRadius: 5,
    backgroundColor: D.badgeBg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  earnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: D.divider,
  },
  field: {
    backgroundColor: D.field,
    borderRadius: tokens.radius.md,
    paddingHorizontal: 16,
    minHeight: 56,
    justifyContent: 'center',
  },
});

const acct = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: D.divider },
});
