import React, { useState } from 'react';
import { View, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, TopBar, Txt, Button, Field } from '../components';
import { useStore } from '../store';
import { useTheme, tokens, fonts } from '../theme';

// ---------------------------------------------------------------------------
// Payment — saved payment methods list (figma 100:8965).
// White bg, TopBar "Payment". "Payment Methods" section lists saved cards
// (brand + last4 + exp) each with edit/delete, or an empty state. Below it,
// "Add Payment Method" (-> AddCard) and "Payment History" rows.
// ---------------------------------------------------------------------------
export function Payment({ navigation }: any) {
  const { theme } = useTheme();
  const { cards, removeCard } = useStore();

  return (
    <Screen padded={false}>
      <TopBar title="Payment" onBack={navigation.canGoBack() ? navigation.goBack : undefined} />

      <View style={styles.content}>
        {/* Section header */}
        <View style={[styles.sectionHeader, { borderBottomColor: theme.divider }]}>
          <Txt style={styles.heading}>Payment Methods</Txt>
        </View>

        {/* Saved cards or empty state */}
        {cards.length === 0 ? (
          <View style={[styles.row, { borderBottomColor: theme.divider }]}>
            <Txt style={StyleSheet.flatten([styles.rowTitle, { paddingLeft: tokens.spacing.sm }])}>
              No Information To Be Displayed
            </Txt>
          </View>
        ) : (
          cards.map((card) => {
            const brand = card.brand.charAt(0).toUpperCase() + card.brand.slice(1);
            const exp = `${String(card.expMonth).padStart(2, '0')}/${String(card.expYear).padStart(2, '0')}`;
            return (
              <View key={card.id} style={[styles.row, { borderBottomColor: theme.divider }]}>
                <Ionicons name="card" size={26} color={theme.text} style={styles.leadIcon} />
                <View style={{ flex: 1 }}>
                  <Txt style={styles.rowTitle}>{`${brand} ending in ${card.last4}`}</Txt>
                  <Txt variant="caption" color={theme.textSecondary}>{`Expires ${exp}`}</Txt>
                </View>
                <TouchableOpacity hitSlop={8} onPress={() => navigation.navigate('AddCard')}>
                  <Ionicons name="pencil" size={22} color={theme.text} style={{ marginRight: 18 }} />
                </TouchableOpacity>
                <TouchableOpacity hitSlop={8} onPress={() => removeCard(card.id)}>
                  <Ionicons name="trash-outline" size={22} color={theme.primary} />
                </TouchableOpacity>
              </View>
            );
          })
        )}

        {/* Add Payment Method */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => navigation.navigate('AddCard')}
          style={[styles.row, { borderBottomColor: theme.divider }]}
        >
          <Ionicons name="add" size={30} color={theme.text} style={styles.leadIcon} />
          <Txt style={StyleSheet.flatten([styles.rowTitle, { flex: 1 }])}>Add Payment Method</Txt>
          <Ionicons name="chevron-forward" size={22} color={theme.text} />
        </TouchableOpacity>

        {/* Payment History */}
        <View style={[styles.row, { borderBottomColor: theme.divider }]}>
          <Ionicons name="reader-outline" size={26} color={theme.text} style={styles.leadIcon} />
          <Txt style={StyleSheet.flatten([styles.rowTitle, { flex: 1 }])}>Payment History</Txt>
          <Ionicons name="chevron-forward" size={22} color={theme.text} />
        </View>
      </View>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// AddCard — "Payment Information" billing form (figma 1449:17701).
// Logo, title, Name, Card Number, Expiration/CVC, billing address, then a
// black SUBMIT button that addCard({brand,last4,expMonth,expYear}) + goBack.
// ---------------------------------------------------------------------------
export function AddCard({ navigation }: any) {
  const { theme } = useTheme();
  const { addCard } = useStore();

  const [name, setName] = useState('Anton Vanko');
  const [cardNumber, setCardNumber] = useState('4111 1111 1111 1111');
  const [expiration, setExpiration] = useState('01/2025');
  const [cvc, setCvc] = useState('234');
  const [address1, setAddress1] = useState('123 Main St.');
  const [address2, setAddress2] = useState('2N');
  const [city, setCity] = useState('Chicago');
  const [state, setState] = useState('Illinois');
  const [zip, setZip] = useState('Chicago');
  const [country, setCountry] = useState('United States');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    const digits = cardNumber.replace(/\D/g, '');
    const last4 = digits.slice(-4) || '0000';
    const [mm, yy] = expiration.split('/');
    const expMonth = parseInt(mm, 10) || 1;
    const yearNum = parseInt(yy ?? '', 10) || 0;
    const expYear = yearNum >= 100 ? yearNum % 100 : yearNum;
    setSaving(true);
    await addCard({ brand: 'visa', last4, expMonth, expYear });
    navigation.goBack();
  };

  return (
    <Screen scroll>
      <View style={styles.logoWrap}>
        <Image source={require('../../assets/img/logo.png')} style={styles.logo} />
      </View>

      <Txt center color={theme.text} style={styles.title}>Payment Information</Txt>

      <Field label="Name" value={name} onChangeText={setName} />
      <Field
        label="Card Number"
        value={cardNumber}
        onChangeText={setCardNumber}
        keyboardType="number-pad"
      />

      <View style={styles.twoCol}>
        <View style={{ flex: 1 }}>
          <Field label="Expiration" value={expiration} onChangeText={setExpiration} placeholder="MM/YY" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="CVC" value={cvc} onChangeText={setCvc} keyboardType="number-pad" maxLength={4} />
        </View>
      </View>

      <Field label="Address Line 1" value={address1} onChangeText={setAddress1} />
      <Field label="Address Line 2" value={address2} onChangeText={setAddress2} />

      <View style={styles.twoCol}>
        <View style={{ flex: 1 }}>
          <Field label="City" value={city} onChangeText={setCity} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="State" value={state} onChangeText={setState} />
        </View>
      </View>

      <View style={styles.twoCol}>
        <View style={{ flex: 1 }}>
          <Field label="Zip" value={zip} onChangeText={setZip} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Country" value={country} onChangeText={setCountry} />
        </View>
      </View>

      <Button title="SUBMIT" onPress={handleSubmit} loading={saving} style={{ marginTop: tokens.spacing.sm, marginBottom: tokens.spacing.xl }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  // Payment
  content: { paddingHorizontal: tokens.spacing.xl },
  sectionHeader: {
    paddingTop: tokens.spacing.xl,
    paddingBottom: tokens.spacing.base,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  heading: { fontFamily: fonts.bodyBold, fontSize: 19, lineHeight: 26 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 68,
    paddingVertical: tokens.spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  leadIcon: { marginRight: tokens.spacing.base, width: 30, textAlign: 'center' },
  rowTitle: { fontFamily: fonts.bodyBold, fontSize: 18, lineHeight: 24 },

  // AddCard
  logoWrap: { alignItems: 'center', marginTop: tokens.spacing.xl, marginBottom: tokens.spacing.lg },
  logo: { width: 130, height: 130, borderRadius: 28 },
  title: { fontFamily: fonts.bodyBold, fontSize: 28, lineHeight: 36, marginBottom: tokens.spacing.xl },
  twoCol: { flexDirection: 'row', gap: tokens.spacing.base },
});
