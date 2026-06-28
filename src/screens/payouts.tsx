import React, { useEffect, useState } from 'react';
import {
  View, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Txt, Button, TopBar, InfoModal } from '../components';
import { useTheme, tokens, darkTokens } from '../theme';
import { useStore } from '../store';
import { Transaction } from '../types';

// ---------------------------------------------------------------------------
// Palette for the dark payout surfaces (Earnings + Bank Information). The
// shared theme is a light theme, so these screens roll their own black canvas
// (figma-ref/earnings.png + bank-info.png are pure black); every raised
// surface/field/divider on top of it comes from darkTokens.
// ---------------------------------------------------------------------------
const BLACK = '#000000';
const ERROR_RED = '#FF6B6B';
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
const PAYOUT_LAST4 = '6789'; // matches the bank-info.png account (…789) the seed earnings paid to
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

// Dark top bar (white chevron + centered title) for the black screens.
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
          <Ionicons name="chevron-back" size={26} color="#FFFFFF" />
        </TouchableOpacity>
      ) : (
        <View style={{ width: 26 }} />
      )}
      <Txt variant="h4" color="#FFFFFF">{title}</Txt>
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
      <Ionicons name="business" size={15} color="#000000" />
    </View>
  );
}

// Filled navy text field for the dark Bank Information form.
function DarkField({
  label, value, onChangeText, keyboardType,
}: { label: string; value: string; onChangeText: (t: string) => void; keyboardType?: any }) {
  return (
    <View style={{ marginBottom: 18 }}>
      <Txt variant="label" color="#FFFFFF" style={{ marginBottom: 8 }}>{label}</Txt>
      <View style={dark.field}>
        <TextInput
          style={{ color: '#FFFFFF', fontSize: 18 }}
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          placeholderTextColor="#6B7280"
          accessibilityLabel={label}
        />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// 1. Earnings — "Earning History" (black). Now leads with a payout summary
//    (available balance, pending, total earned, next-payout date + cadence) and
//    each row names the real destination bank instead of the member's Apple Pay.
// ---------------------------------------------------------------------------
export function Earnings({ navigation }: any) {
  const { earnings, cashOut } = useStore();
  const payout = usePayoutAccount();
  const groups = groupByMonth(earnings);
  const [cashing, setCashing] = useState(false);
  const [cashedOut, setCashedOut] = useState<number | null>(null);
  const [cashError, setCashError] = useState('');

  const available = sumAmt(earnings.filter((e) => e.status === 'completed'));

  const onCashOut = async () => {
    if (cashing || available <= 0) return;
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BLACK }} edges={['top']}>
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
            <Ionicons name="wallet-outline" size={23} color="#FFFFFF" />
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
          <Txt variant="bodySm" color={darkTokens.textSubtle}>Available balance</Txt>
          <Txt variant="h1" color="#FFFFFF" style={{ marginTop: 2 }}>{money(available)}</Txt>

          <View style={{ flexDirection: 'row', marginTop: 16 }}>
            <View style={{ flex: 1 }}>
              <Txt variant="caption" color={darkTokens.textMuted}>Pending</Txt>
              <Txt variant="h4" color="#FFFFFF" style={{ marginTop: 2 }}>{money(pending)}</Txt>
            </View>
            <View style={{ flex: 1 }}>
              <Txt variant="caption" color={darkTokens.textMuted}>Total earned</Txt>
              <Txt variant="h4" color="#FFFFFF" style={{ marginTop: 2 }}>{money(total)}</Txt>
            </View>
          </View>

          {/* Instant cash-out of the available balance. */}
          <TouchableOpacity
            onPress={onCashOut}
            disabled={cashing || available <= 0}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`Cash out ${money(available)}`}
            accessibilityState={{ disabled: cashing || available <= 0 }}
            style={[dark.cashBtn, { opacity: cashing || available <= 0 ? 0.5 : 1 }]}
          >
            <Ionicons name="cash-outline" size={18} color="#FFFFFF" />
            <Txt variant="button" color="#FFFFFF" style={{ marginLeft: 8 }}>
              {cashing ? 'Cashing out…' : available > 0 ? `Cash out ${money(available)}` : 'No balance to cash out'}
            </Txt>
          </TouchableOpacity>
          {cashError ? (
            <Txt variant="caption" color={ERROR_RED} style={{ marginTop: 8 }}>{cashError}</Txt>
          ) : null}

          <View style={{ height: 1, backgroundColor: darkTokens.border, marginVertical: 16 }} />

          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="calendar-outline" size={16} color={darkTokens.textSubtle} />
            <Txt variant="bodySm" color="#FFFFFF" style={{ marginLeft: 8, flex: 1 }}>
              {nextPayoutMs
                ? `Next payout ${fmtDate(nextPayoutMs)} to ${destLabel}`
                : 'No payouts scheduled'}
            </Txt>
          </View>
          <Txt variant="caption" color={darkTokens.textMuted} style={{ marginTop: 6 }}>
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
            <Txt variant="h3" color="#FFFFFF">{g.key}</Txt>
            <View style={{ height: 1, backgroundColor: darkTokens.divider, marginTop: 16 }} />
            {g.items.map((item) => (
              <View
                key={item.id}
                style={dark.earnRow}
                accessible
                accessibilityLabel={`${fmtDate(item.date)}, ${money(item.amount)} to ${destLabel}`}
              >
                <BankBadge />
                <View style={{ flex: 1, marginLeft: 16 }}>
                  <Txt variant="body" color="#FFFFFF" style={{ fontSize: 19, lineHeight: 24 }}>
                    {fmtDate(item.date)}
                  </Txt>
                  <Txt variant="body" color={darkTokens.textSubtle} style={{ fontSize: 16, marginTop: 2 }}>
                    {destLabel}
                  </Txt>
                </View>
                <Txt variant="label" color="#FFFFFF" style={{ fontSize: 19, marginRight: 10 }}>
                  {money(item.amount)}
                </Txt>
                <Ionicons name="chevron-forward" size={22} color="#FFFFFF" />
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// 2. StripeOnboarding — "Account" (white). Bank Information section. The first
//    row now reflects the REAL connection state: an honest "Set up payouts to
//    get paid" prompt until the pal saves valid bank details (then it shows the
//    connected bank), rather than pre-claiming a fake account.
// ---------------------------------------------------------------------------
export function StripeOnboarding({ navigation }: any) {
  const { theme } = useTheme();
  const payout = usePayoutAccount();
  return (
    <Screen padded={false}>
      <TopBar title="Account" onBack={navigation.canGoBack() ? navigation.goBack : undefined} />
      <View style={{ paddingHorizontal: 20 }}>
        <Txt variant="h4" color={theme.textSecondary} style={{ marginTop: 20, marginBottom: 8 }}>
          Bank Information
        </Txt>
        <View style={{ height: 1, backgroundColor: theme.divider }} />

        {/* Payout account — connected bank, or an honest not-yet-set-up prompt */}
        {payout.connected ? (
          <View
            style={[acct.row, { borderBottomColor: theme.divider }]}
            accessible
            accessibilityLabel={`Payout account connected: ${bankLabel(payout.last4)}`}
          >
            <Ionicons name="card-outline" size={24} color="#8A909B" style={{ width: 30, marginRight: 14 }} />
            <Txt variant="body" color="#8A909B" style={{ flex: 1 }}>{bankLabel(payout.last4)}</Txt>
            <Ionicons name="checkmark-circle" size={20} color={theme.success} />
          </View>
        ) : (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => navigation.navigate('BankInfo')}
            style={[acct.row, { borderBottomColor: theme.divider }]}
            accessibilityRole="button"
            accessibilityLabel="Set up payouts to get paid"
          >
            <Ionicons name="card-outline" size={24} color="#8A909B" style={{ width: 30, marginRight: 14 }} />
            <Txt variant="body" color="#8A909B" style={{ flex: 1 }}>Set up payouts to get paid</Txt>
            <Ionicons name="chevron-forward" size={22} color="#8A909B" />
          </TouchableOpacity>
        )}

        {/* Edit / add Bank Information → BankInfo */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => navigation.navigate('BankInfo')}
          style={[acct.row, { borderBottomColor: theme.divider }]}
          accessibilityRole="button"
          accessibilityLabel={payout.connected ? 'Edit bank information' : 'Add bank information'}
        >
          <Ionicons name="pencil" size={22} color="#8A909B" style={{ width: 30, marginRight: 14 }} />
          <Txt variant="body" color="#8A909B" style={{ flex: 1 }}>
            {payout.connected ? 'Edit Bank Information' : 'Add Bank Information'}
          </Txt>
          <Ionicons name="chevron-forward" size={22} color="#8A909B" />
        </TouchableOpacity>

        {/* Earning History → Earnings */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => navigation.navigate('Earnings')}
          style={[acct.row, { marginTop: 18, borderBottomColor: theme.divider }]}
          accessibilityRole="button"
          accessibilityLabel="Earning History"
        >
          <Ionicons name="reader-outline" size={24} color="#525A66" style={{ width: 30, marginRight: 14 }} />
          <Txt variant="h4" color="#525A66" style={{ flex: 1 }}>Earning History</Txt>
          <Ionicons name="chevron-forward" size={24} color="#525A66" />
        </TouchableOpacity>
      </View>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// 3. BankInfo — "Bank Information" form (black). Prefilled to match the
//    reference, but SAVE now VALIDATES (required fields, 9-digit routing,
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
    <SafeAreaView style={{ flex: 1, backgroundColor: BLACK }} edges={['top', 'bottom']}>
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

          <Txt variant="label" color="#FFFFFF" style={{ marginBottom: 10 }}>Account Type</Txt>
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
                    backgroundColor: sel ? '#FFFFFF' : darkTokens.field,
                    borderWidth: sel ? 0 : 1,
                    borderColor: '#39415A',
                  }}
                >
                  {sel && <Ionicons name="checkmark-circle" size={18} color="#141414" />}
                  <Txt variant="label" color={sel ? '#141414' : '#9AA1B2'}>{opt}</Txt>
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
              <Ionicons name="alert-circle" size={18} color={ERROR_RED} style={{ marginRight: 6 }} />
              <Txt variant="bodySm" color={ERROR_RED} style={{ flex: 1 }}>{error}</Txt>
            </View>
          ) : null}
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
          navigation.navigate('Tabs');
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
    borderBottomColor: '#1C1C1C',
  },
  summary: {
    marginTop: 12,
    backgroundColor: darkTokens.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: darkTokens.border,
    padding: 20,
  },
  cashBtn: {
    marginTop: 18,
    height: 48,
    borderRadius: tokens.radius.md,
    backgroundColor: '#ED1C24',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  payBadge: {
    width: 40,
    height: 26,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  earnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: darkTokens.divider,
  },
  field: {
    backgroundColor: darkTokens.field,
    borderRadius: tokens.radius.md,
    paddingHorizontal: 16,
    minHeight: 56,
    justifyContent: 'center',
  },
});

const acct = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 18, borderBottomWidth: 1 },
});
