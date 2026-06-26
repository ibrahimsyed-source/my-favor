import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Txt, Button, TopBar } from '../components';
import { useTheme, tokens } from '../theme';
import { useStore } from '../store';
import { Transaction } from '../types';

// ---------------------------------------------------------------------------
// Palette for the dark payout surfaces (Earnings + Bank Information). The
// shared theme is a light theme, so these screens roll their own black canvas.
// ---------------------------------------------------------------------------
const BLACK = '#000000';
const FIELD_NAVY = '#262C40';
const DARK_DIVIDER = '#2B2B2B';
const SUBTLE_GRAY = '#8A8A8A';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MON_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtDate(ms: number) {
  const d = new Date(ms);
  return `${d.getDate()} ${MON_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

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

// Dark top bar (white chevron + centered title) for the black screens.
function DarkTopBar({ title, onBack, right }: { title: string; onBack?: () => void; right?: React.ReactNode }) {
  return (
    <View style={dark.topbar}>
      {onBack ? (
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
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

// Small Apple Pay logo badge used on each earning row.
function ApplePayBadge() {
  return (
    <View style={dark.applePay}>
      <Ionicons name="logo-apple" size={11} color="#000000" />
      <Text style={dark.applePayText}>Pay</Text>
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
        />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// 1. Earnings — "Earning History" (black). Balance-free list grouped by month,
//    each row = Apple Pay badge + date + amount, sourced from useStore().earnings.
//    Wallet action (top-right) sets up payouts → StripeOnboarding.
// ---------------------------------------------------------------------------
export function Earnings({ navigation }: any) {
  const { earnings } = useStore();
  const groups = groupByMonth(earnings);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BLACK }} edges={['top']}>
      <DarkTopBar
        title="Earning History"
        onBack={navigation.canGoBack() ? navigation.goBack : undefined}
        right={
          <TouchableOpacity
            onPress={() => navigation.navigate('StripeOnboarding')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="wallet-outline" size={23} color="#FFFFFF" />
          </TouchableOpacity>
        }
      />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {groups.map((g) => (
          <View key={g.key} style={{ marginTop: 28 }}>
            <Txt variant="h3" color="#FFFFFF">{g.key}</Txt>
            <View style={{ height: 1, backgroundColor: DARK_DIVIDER, marginTop: 16 }} />
            {g.items.map((item) => (
              <View key={item.id} style={dark.earnRow}>
                <ApplePayBadge />
                <View style={{ flex: 1, marginLeft: 16 }}>
                  <Txt variant="body" color="#FFFFFF" style={{ fontSize: 19, lineHeight: 24 }}>
                    {fmtDate(item.date)}
                  </Txt>
                  <Txt variant="body" color={SUBTLE_GRAY} style={{ fontSize: 16, marginTop: 2 }}>
                    Apple Pay
                  </Txt>
                </View>
                <Txt variant="label" color="#FFFFFF" style={{ fontSize: 19, marginRight: 10 }}>
                  ${item.amount.toFixed(2)}
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
// 2. StripeOnboarding — "Account" (white). Bank Information section with the
//    connected Stripe account, an edit row (→ BankInfo) and earning history.
// ---------------------------------------------------------------------------
export function StripeOnboarding({ navigation }: any) {
  const { theme } = useTheme();
  return (
    <Screen padded={false}>
      <TopBar title="Account" onBack={navigation.canGoBack() ? navigation.goBack : undefined} />
      <View style={{ paddingHorizontal: 20 }}>
        <Txt variant="h4" color={theme.textSecondary} style={{ marginTop: 20, marginBottom: 8 }}>
          Bank Information
        </Txt>
        <View style={{ height: 1, backgroundColor: theme.divider }} />

        {/* Connected Stripe account */}
        <View style={[acct.row, { borderBottomColor: theme.divider }]}>
          <Ionicons name="card-outline" size={24} color="#8A909B" style={{ width: 30, marginRight: 14 }} />
          <Txt variant="body" color="#8A909B" style={{ flex: 1 }}>Stripe *1234</Txt>
        </View>

        {/* Edit Bank Information → BankInfo (the "Set Up Account" path) */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => navigation.navigate('BankInfo')}
          style={[acct.row, { borderBottomColor: theme.divider }]}
        >
          <Ionicons name="pencil" size={22} color="#8A909B" style={{ width: 30, marginRight: 14 }} />
          <Txt variant="body" color="#8A909B" style={{ flex: 1 }}>Edit Bank Information</Txt>
          <Ionicons name="chevron-forward" size={22} color="#8A909B" />
        </TouchableOpacity>

        {/* Earning History → Earnings */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => navigation.navigate('Earnings')}
          style={[acct.row, { marginTop: 18, borderBottomColor: theme.divider }]}
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
//    reference; white SAVE pill → Tabs.
// ---------------------------------------------------------------------------
export function BankInfo({ navigation }: any) {
  const { user } = useStore();
  const [accountName, setAccountName] = useState(user ? `${user.firstName} ${user.lastName}` : 'Anton Vanko');
  const [bankName, setBankName] = useState('Bank of America');
  const [routing, setRouting] = useState('123456789');
  const [accountNumber, setAccountNumber] = useState('123 - 456 - 789');
  const [confirmAccount, setConfirmAccount] = useState('123 - 456 - 789');
  const [accountType, setAccountType] = useState<'Savings' | 'Checking'>('Checking');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BLACK }} edges={['top', 'bottom']}>
      <DarkTopBar title="Bank Information" onBack={navigation.canGoBack() ? navigation.goBack : undefined} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingTop: 24, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <DarkField label="Account Name" value={accountName} onChangeText={setAccountName} />
          <DarkField label="Bank Name" value={bankName} onChangeText={setBankName} />
          <DarkField label="Routing Number" value={routing} onChangeText={setRouting} keyboardType="number-pad" />
          <DarkField label="Account Number" value={accountNumber} onChangeText={setAccountNumber} />
          <DarkField label="Confirm Account Number" value={confirmAccount} onChangeText={setConfirmAccount} />

          <Txt variant="label" color="#FFFFFF" style={{ marginBottom: 10 }}>Account Type</Txt>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {(['Savings', 'Checking'] as const).map((opt) => {
              const sel = accountType === opt;
              return (
                <TouchableOpacity
                  key={opt}
                  activeOpacity={0.8}
                  onPress={() => setAccountType(opt)}
                  style={{
                    flex: 1,
                    height: 52,
                    borderRadius: tokens.radius.md,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    backgroundColor: sel ? '#FFFFFF' : FIELD_NAVY,
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
          <Button title="Save" variant="white" onPress={() => navigation.navigate('Tabs')} />
        </View>
      </KeyboardAvoidingView>
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
  applePay: {
    width: 40,
    height: 26,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingRight: 2,
  },
  applePayText: { fontSize: 11, fontWeight: '700', color: '#000000', marginLeft: 1 },
  earnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: DARK_DIVIDER,
  },
  field: {
    backgroundColor: FIELD_NAVY,
    borderRadius: tokens.radius.md,
    paddingHorizontal: 16,
    minHeight: 56,
    justifyContent: 'center',
  },
});

const acct = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 18, borderBottomWidth: 1 },
});
