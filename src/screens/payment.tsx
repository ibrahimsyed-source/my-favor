import React, { useState } from 'react';
import { View, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, TopBar, Txt, Button, Field, InfoModal, ConfirmModal } from '../components';
import { useStore } from '../store';
import { useTheme, tokens, fonts } from '../theme';

// ---------------------------------------------------------------------------
// Payment — saved payment methods list (figma 100:8965).
// White bg, TopBar "Payment". "Payment Methods" section lists saved cards
// (brand + last4 + exp) each with edit/delete, or an empty state. Below it,
// "Add Payment Method" (-> AddCard) and "Payment History" (-> History) rows.
// ---------------------------------------------------------------------------
export function Payment({ navigation }: any) {
  const { theme } = useTheme();
  const { cards, removeCard } = useStore();
  // Card deletion is destructive — gate it behind ConfirmModal (Alert.alert
  // silently no-ops on web) instead of removing on a single stray tap.
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const pendingCard = cards.find((c) => c.id === pendingDeleteId);
  const pendingLabel = pendingCard
    ? `${pendingCard.brand.charAt(0).toUpperCase() + pendingCard.brand.slice(1)} ending in ${pendingCard.last4}`
    : 'This card';

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
                {/* Edit prefills AddCard with THIS card (not a blank add). Spaced
                    + enlarged hit area so it can't be mistaken for delete. */}
                <TouchableOpacity
                  onPress={() => navigation.navigate('AddCard', { cardId: card.id })}
                  style={[styles.iconBtn, styles.editBtn]}
                  hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${brand} card ending in ${card.last4}`}
                >
                  <Ionicons name="pencil" size={22} color={theme.text} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setPendingDeleteId(card.id)}
                  style={styles.iconBtn}
                  hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${brand} card ending in ${card.last4}`}
                >
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
          accessibilityRole="button"
          accessibilityLabel="Add payment method"
        >
          <Ionicons name="add" size={30} color={theme.text} style={styles.leadIcon} />
          <Txt style={StyleSheet.flatten([styles.rowTitle, { flex: 1 }])}>Add Payment Method</Txt>
          <Ionicons name="chevron-forward" size={22} color={theme.text} />
        </TouchableOpacity>

        {/* Payment History — open the History tab so the chevron is real. */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => navigation.navigate('Tabs', { screen: 'History' })}
          style={[styles.row, { borderBottomColor: theme.divider }]}
          accessibilityRole="button"
          accessibilityLabel="Payment history"
        >
          <Ionicons name="reader-outline" size={26} color={theme.text} style={styles.leadIcon} />
          <Txt style={StyleSheet.flatten([styles.rowTitle, { flex: 1 }])}>Payment History</Txt>
          <Ionicons name="chevron-forward" size={22} color={theme.text} />
        </TouchableOpacity>
      </View>

      <ConfirmModal
        visible={!!pendingDeleteId}
        title="Remove card?"
        message={`${pendingLabel} will be removed from your wallet. This can't be undone.`}
        confirmLabel="Remove"
        cancelLabel="Keep card"
        destructive
        onConfirm={() => {
          if (pendingDeleteId) removeCard(pendingDeleteId);
          setPendingDeleteId(null);
        }}
        onCancel={() => setPendingDeleteId(null)}
      />
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// AddCard — "Payment Information" billing form (figma 1449:17701).
// Logo, title, Name, Card Number, Expiration/CVC, billing address, then a
// black SUBMIT button that addCard({brand,last4,expMonth,expYear}) + goBack.
//
// When opened from a card's edit pencil it receives route.params.cardId and
// prefills from that saved card (we only persist brand/last4/exp, so the full
// PAN/CVC start masked/blank) — a real edit, not a blank duplicate.
// ---------------------------------------------------------------------------
export function AddCard({ navigation, route }: any) {
  const { theme } = useTheme();
  const { addCard, removeCard, cards } = useStore();

  const editCard = route?.params?.cardId ? cards.find((c: any) => c.id === route.params.cardId) : undefined;
  // Stored expYear is 2-digit (e.g. 30); render a full 4-digit year for editing.
  const editExpYear = editCard ? (editCard.expYear >= 100 ? editCard.expYear : 2000 + editCard.expYear) : 0;

  const [name, setName] = useState(editCard ? '' : 'Anton Vanko');
  const [cardNumber, setCardNumber] = useState(
    editCard ? `•••• •••• •••• ${editCard.last4}` : '4111 1111 1111 1111'
  );
  // Default to a real future expiry (today is 2026) instead of a past date.
  const [expiration, setExpiration] = useState(
    editCard ? `${String(editCard.expMonth).padStart(2, '0')}/${editExpYear}` : '01/2030'
  );
  const [cvc, setCvc] = useState(editCard ? '' : '234');
  const [address1, setAddress1] = useState(editCard ? '' : '123 Main St.');
  const [address2, setAddress2] = useState(editCard ? '' : '2N');
  const [city, setCity] = useState(editCard ? '' : 'Chicago');
  const [state, setState] = useState(editCard ? '' : 'Illinois');
  // A Zip is a postal code, not a city.
  const [zip, setZip] = useState(editCard ? '' : '60601');
  const [country, setCountry] = useState(editCard ? '' : 'United States');
  const [saving, setSaving] = useState(false);
  const [added, setAdded] = useState(false);

  // Derive the brand from the card-number prefix (Stripe determines this from
  // the BIN range) instead of always recording Visa.
  const brandFromDigits = (d: string) =>
    d.startsWith('4')
      ? 'visa'
      : /^3[47]/.test(d)
      ? 'amex'
      : /^(5[1-5]|2[2-7])/.test(d)
      ? 'mastercard'
      : d.startsWith('6')
      ? 'discover'
      : 'card';

  const handleSubmit = async () => {
    const digits = cardNumber.replace(/\D/g, '');
    let last4: string;
    let brand: string;
    if (digits.length >= 12) {
      // A full (new) PAN was entered.
      last4 = digits.slice(-4);
      brand = brandFromDigits(digits);
    } else if (editCard) {
      // Masked/unchanged number — keep the saved card's identity.
      last4 = editCard.last4;
      brand = editCard.brand;
    } else {
      last4 = digits.slice(-4) || '0000';
      brand = brandFromDigits(digits);
    }
    const [mm, yy] = expiration.split('/');
    const expMonth = parseInt(mm, 10) || 1;
    const yearNum = parseInt(yy ?? '', 10) || 0;
    const expYear = yearNum >= 100 ? yearNum % 100 : yearNum;
    setSaving(true);
    // The store has no in-place updateCard, so editing = replace: drop the old
    // record, then persist the edited one. Both use functional setState so they
    // compose (filter then append) regardless of ordering.
    if (editCard) removeCard(editCard.id);
    await addCard({ brand, last4, expMonth, expYear });
    setSaving(false);
    setAdded(true);
  };

  return (
    <Screen scroll>
      <View style={styles.logoWrap}>
        <Image source={require('../../assets/img/logo.png')} style={styles.logo} />
      </View>

      <Txt center color={theme.text} style={styles.title}>{editCard ? 'Edit Card' : 'Payment Information'}</Txt>

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
          <Field label="Zip" value={zip} onChangeText={setZip} keyboardType="number-pad" maxLength={10} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Country" value={country} onChangeText={setCountry} />
        </View>
      </View>

      {/* PCI scope note: this mock keeps the card fields in component state for
          the PROTOTYPE ONLY. A production build must never hold the raw PAN/CVC —
          it tokenizes on-device with the Stripe SDK (CardField / PaymentSheet),
          then persists only the returned token + brand/last4/exp (what addCard
          already stores). The lockup below is the trust signal for that. */}
      <View style={styles.secured} accessibilityRole="text" accessibilityLabel="Secured by Stripe">
        <Ionicons name="lock-closed" size={16} color={theme.textSecondary} />
        <Txt variant="caption" color={theme.textSecondary} style={{ marginLeft: 6 }}>Secured by Stripe</Txt>
      </View>

      <Button title="SUBMIT" onPress={handleSubmit} loading={saving} style={{ marginTop: tokens.spacing.base, marginBottom: tokens.spacing.xl }} />

      <InfoModal
        visible={added}
        title={editCard ? 'Card Updated' : 'Card Added'}
        message={`You have successfully ${editCard ? 'updated' : 'added'} your Bank / Card information`}
        buttonLabel="OKAY"
        onClose={() => { setAdded(false); navigation.goBack(); }}
      />
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
  iconBtn: { padding: 8 }, // ~38px box + hitSlop clears the 44px min target
  editBtn: { marginRight: 16 }, // separate edit from delete to prevent mis-taps

  // AddCard
  logoWrap: { alignItems: 'center', marginTop: tokens.spacing.xl, marginBottom: tokens.spacing.lg },
  logo: { width: 130, height: 130, borderRadius: 28 },
  title: { fontFamily: fonts.bodyBold, fontSize: 28, lineHeight: 36, marginBottom: tokens.spacing.xl },
  twoCol: { flexDirection: 'row', gap: tokens.spacing.base },
  secured: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: tokens.spacing.lg },
});
