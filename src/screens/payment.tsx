import React, { useState, useEffect } from 'react';
import {
  View, Image, TextInput, TouchableOpacity, ScrollView, StyleSheet, Modal,
  ActivityIndicator, KeyboardAvoidingView, Platform, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Txt } from '../components';
import { useStore } from '../store';
import { tokens, fonts } from '../theme';

// ---------------------------------------------------------------------------
// User App v.2 — DARK payment surfaces (Payment list + AddCard form + the
// "Card Added" confirmation, per card-added-v2.png). The shared useTheme() is
// LIGHT (it drives the auth screens), so these screens use a local dark palette
// and custom dark building blocks instead of the light <Screen>/<Field>/<Button>/
// <TopBar>/<InfoModal>/<ConfirmModal> components. All logic/state/nav/validation
// and the hosted-Stripe flow are preserved exactly — only styling changed.
// ---------------------------------------------------------------------------
const D = {
  bg: '#0C0C0C', // screen background
  card: '#1B222C', // modal / raised card (dark navy)
  field: '#1C2331', // raised input field
  border: 'rgba(255,255,255,0.10)', // dividers / field borders
  textPrimary: '#FFFFFF',
  textSecondary: 'rgba(255,255,255,0.6)',
  textTertiary: 'rgba(255,255,255,0.4)', // placeholders
  brand: '#ED1C24',
  cta: '#FFFFFF', // v.2 filled button = white pill…
  ctaText: '#141414', // …with dark text
  secondaryPill: '#1C2331', // dark secondary / destructive-cancel pill
} as const;

// ---------------------------------------------------------------------------
// Dark building blocks (local — the shared components render light).
// ---------------------------------------------------------------------------
function DarkScreen({ children, scroll }: { children: React.ReactNode; scroll?: boolean }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: D.bg }} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, padding: tokens.spacing.lg }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={{ flex: 1 }}>{children}</View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function DarkTopBar({ title, onBack }: { title?: string; onBack?: () => void }) {
  return (
    <View style={dark.topbar}>
      {onBack ? (
        <TouchableOpacity onPress={onBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={26} color={D.textPrimary} />
        </TouchableOpacity>
      ) : (
        <View style={{ width: 26 }} />
      )}
      <Txt variant="h6" color={D.textPrimary}>{title}</Txt>
      <View style={{ width: 26 }} />
    </View>
  );
}

function DarkField({
  label, value, onChangeText, placeholder, keyboardType, maxLength,
}: {
  label?: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: any;
  maxLength?: number;
}) {
  return (
    <View style={{ marginBottom: tokens.spacing.base }}>
      {label ? <Txt variant="label" color={D.textPrimary} style={{ marginBottom: 8 }}>{label}</Txt> : null}
      <View style={dark.field}>
        <TextInput
          style={{ flex: 1, color: D.textPrimary, fontSize: 16, fontFamily: fonts.bodyRegular, paddingVertical: 0 }}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={D.textTertiary}
          keyboardType={keyboardType}
          maxLength={maxLength}
        />
      </View>
    </View>
  );
}

// v.2 primary CTA — white pill, dark text (I AM HERE / SUBMIT / SAVE style).
function WhiteButton({
  title, onPress, loading, disabled, style,
}: {
  title: string;
  onPress?: () => void;
  loading?: boolean;
  disabled?: boolean;
  style?: any;
}) {
  const isDisabled = !!disabled;
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      disabled={isDisabled || loading}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled || !!loading, busy: !!loading }}
      accessibilityLabel={title}
      style={[dark.btn, { backgroundColor: D.cta }, isDisabled && { opacity: 0.5 }, style]}
    >
      {loading ? (
        <ActivityIndicator color={D.ctaText} />
      ) : (
        <Txt variant="button" color={D.ctaText} style={{ letterSpacing: 0.5 }}>{title}</Txt>
      )}
    </TouchableOpacity>
  );
}

// Secondary — dark pill with white text.
function DarkPillButton({ title, onPress, style }: { title: string; onPress?: () => void; style?: any }) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={[dark.btn, { backgroundColor: D.secondaryPill, borderWidth: 1, borderColor: D.border }, style]}
    >
      <Txt variant="button" color={D.textPrimary} style={{ letterSpacing: 0.5 }}>{title}</Txt>
    </TouchableOpacity>
  );
}

// Dark centered confirmation card over a dimmed scrim (card-added-v2.png).
function DarkInfoModal({
  visible, title, message, buttonLabel, onClose,
}: {
  visible: boolean;
  title: string;
  message: string;
  buttonLabel?: string;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity activeOpacity={1} onPress={onClose} style={dark.modalScrim}>
        <TouchableOpacity activeOpacity={1} style={dark.modalCard}>
          <Txt variant="h2" center color={D.textPrimary} style={{ marginBottom: 14 }}>{title}</Txt>
          <Txt variant="body" center color={D.textSecondary} style={{ lineHeight: 24 }}>{message}</Txt>
          {buttonLabel ? (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={buttonLabel}
              style={[dark.btn, { backgroundColor: D.cta, marginTop: 26 }]}
            >
              <Txt variant="button" color={D.ctaText} style={{ letterSpacing: 0.5 }}>{buttonLabel}</Txt>
            </TouchableOpacity>
          ) : null}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// Dark confirm dialog (Alert.alert no-ops on web) — confirm + cancel.
function DarkConfirmModal({
  visible, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', destructive, onConfirm, onCancel,
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <TouchableOpacity activeOpacity={1} onPress={onCancel} style={dark.modalScrim}>
        <TouchableOpacity activeOpacity={1} style={dark.modalCard}>
          <Txt variant="h3" center color={D.textPrimary} style={{ marginBottom: 12 }}>{title}</Txt>
          <Txt variant="body" center color={D.textSecondary} style={{ lineHeight: 24 }}>{message}</Txt>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={onConfirm}
            accessibilityRole="button"
            accessibilityLabel={confirmLabel}
            style={[dark.btn, { marginTop: 22, backgroundColor: destructive ? D.brand : D.cta }]}
          >
            <Txt variant="button" color={destructive ? '#FFFFFF' : D.ctaText} style={{ letterSpacing: 0.5 }}>{confirmLabel}</Txt>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel={cancelLabel}
            style={[dark.btn, { marginTop: 10, backgroundColor: D.secondaryPill, borderWidth: 1, borderColor: D.border }]}
          >
            <Txt variant="button" color={D.textPrimary} style={{ letterSpacing: 0.5 }}>{cancelLabel}</Txt>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Payment — saved payment methods list (figma 100:8965), DARK v.2.
// TopBar "Payment". "Payment Methods" section lists saved cards (brand + last4
// + exp) each with edit/delete, or an empty state. Below it, "Add Payment
// Method" (-> AddCard) and "Payment History" (-> History) rows.
// ---------------------------------------------------------------------------
export function Payment({ navigation }: any) {
  const { cards, removeCard } = useStore();
  // Card deletion is destructive — gate it behind a confirm dialog (Alert.alert
  // silently no-ops on web) instead of removing on a single stray tap.
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const pendingCard = cards.find((c) => c.id === pendingDeleteId);
  const pendingLabel = pendingCard
    ? `${pendingCard.brand.charAt(0).toUpperCase() + pendingCard.brand.slice(1)} ending in ${pendingCard.last4}`
    : 'This card';

  return (
    <DarkScreen>
      <DarkTopBar title="Payment" onBack={navigation.canGoBack() ? navigation.goBack : undefined} />

      <View style={styles.content}>
        {/* Section header */}
        <View style={styles.sectionHeader}>
          <Txt style={styles.heading} color={D.textPrimary}>Payment Methods</Txt>
        </View>

        {/* Saved cards or empty state */}
        {cards.length === 0 ? (
          <View style={styles.row}>
            <Txt style={StyleSheet.flatten([styles.rowTitle, { paddingLeft: tokens.spacing.sm }])} color={D.textSecondary}>
              No Information To Be Displayed
            </Txt>
          </View>
        ) : (
          cards.map((card) => {
            const brand = card.brand.charAt(0).toUpperCase() + card.brand.slice(1);
            const exp = `${String(card.expMonth).padStart(2, '0')}/${String(card.expYear).padStart(2, '0')}`;
            return (
              <View key={card.id} style={styles.row}>
                <Ionicons name="card" size={26} color={D.textPrimary} style={styles.leadIcon} />
                <View style={{ flex: 1 }}>
                  <Txt style={styles.rowTitle} color={D.textPrimary}>{`${brand} ending in ${card.last4}`}</Txt>
                  <Txt variant="caption" color={D.textSecondary}>{`Expires ${exp}`}</Txt>
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
                  <Ionicons name="pencil" size={22} color={D.textPrimary} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setPendingDeleteId(card.id)}
                  style={styles.iconBtn}
                  hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${brand} card ending in ${card.last4}`}
                >
                  <Ionicons name="trash-outline" size={22} color={D.brand} />
                </TouchableOpacity>
              </View>
            );
          })
        )}

        {/* Add Payment Method */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => navigation.navigate('AddCard')}
          style={styles.row}
          accessibilityRole="button"
          accessibilityLabel="Add payment method"
        >
          <Ionicons name="add" size={30} color={D.textPrimary} style={styles.leadIcon} />
          <Txt style={StyleSheet.flatten([styles.rowTitle, { flex: 1 }])} color={D.textPrimary}>Add Payment Method</Txt>
          <Ionicons name="chevron-forward" size={22} color={D.textSecondary} />
        </TouchableOpacity>

        {/* Payment History — open the History tab so the chevron is real. */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => navigation.navigate('Tabs', { screen: 'History' })}
          style={styles.row}
          accessibilityRole="button"
          accessibilityLabel="Payment history"
        >
          <Ionicons name="reader-outline" size={26} color={D.textPrimary} style={styles.leadIcon} />
          <Txt style={StyleSheet.flatten([styles.rowTitle, { flex: 1 }])} color={D.textPrimary}>Payment History</Txt>
          <Ionicons name="chevron-forward" size={22} color={D.textSecondary} />
        </TouchableOpacity>
      </View>

      <DarkConfirmModal
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
    </DarkScreen>
  );
}

// ---------------------------------------------------------------------------
// AddCard — "Payment Information" billing form (figma 1449:17701), DARK v.2.
// Logo, title, Name, Card Number, Expiration/CVC, billing address, then a WHITE
// SUBMIT button that addCard({brand,last4,expMonth,expYear}) + goBack, and the
// dark "Card Added" confirmation.
//
// When opened from a card's edit pencil it receives route.params.cardId and
// prefills from that saved card (we only persist brand/last4/exp, so the full
// PAN/CVC start masked/blank) — a real edit, not a blank duplicate.
// ---------------------------------------------------------------------------
export function AddCard({ navigation, route }: any) {
  const { addCard, removeCard, cards, paymentsLive, startAddCard, syncCards } = useStore();
  const [openingCheckout, setOpeningCheckout] = useState(false);

  const editCard = route?.params?.cardId ? cards.find((c: any) => c.id === route.params.cardId) : undefined;

  // When real payments are live, cards are added on Stripe's hosted page; pull in
  // any newly-saved card whenever this screen regains focus (after returning).
  useEffect(() => {
    if (!paymentsLive) return;
    const unsub = navigation.addListener('focus', () => { void syncCards(); });
    return unsub;
  }, [navigation, paymentsLive]); // eslint-disable-line react-hooks/exhaustive-deps

  // Open Stripe's hosted card-setup page.
  const addCardViaStripe = async () => {
    setOpeningCheckout(true);
    try {
      const url = await startAddCard();
      if (url) await Linking.openURL(url);
    } finally {
      setOpeningCheckout(false);
    }
  };
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
  const [error, setError] = useState<string | null>(null);

  // Clear the validation error as soon as the user edits a validated field.
  const edit = (setter: (t: string) => void) => (t: string) => {
    setter(t);
    if (error) setError(null);
  };

  // Luhn checksum — the same mod-10 test Stripe runs before accepting a PAN.
  const luhnValid = (d: string) => {
    let sum = 0;
    let alt = false;
    for (let i = d.length - 1; i >= 0; i--) {
      let n = parseInt(d[i], 10);
      if (alt) {
        n *= 2;
        if (n > 9) n -= 9;
      }
      sum += n;
      alt = !alt;
    }
    return d.length > 0 && sum % 10 === 0;
  };

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
    // On an edit the number is shown masked (we never stored the full PAN/CVC),
    // so leaving it unchanged keeps the saved card's identity without re-entry.
    const keepSaved = !!editCard && digits.length < 12;

    let last4: string;
    let brand: string;
    if (editCard && digits.length < 12) {
      last4 = editCard.last4;
      brand = editCard.brand;
    } else {
      // A new PAN must be a plausible card number (length + Luhn), not garbage.
      if (digits.length < 12 || digits.length > 19) return setError('Enter a valid card number.');
      if (!luhnValid(digits)) return setError("That card number doesn't look right.");
      last4 = digits.slice(-4);
      brand = brandFromDigits(digits);
    }

    // Expiration must be MM/YY (or MM/YYYY), a real month, and not in the past.
    const [mmRaw, yyRaw] = expiration.split('/');
    const mm = parseInt((mmRaw ?? '').trim(), 10);
    const yy = parseInt((yyRaw ?? '').trim(), 10);
    if (!mm || mm < 1 || mm > 12 || Number.isNaN(yy)) {
      return setError('Enter the expiration as MM/YY.');
    }
    const fullYear = yy >= 100 ? yy : 2000 + yy;
    const now = new Date();
    if (fullYear < now.getFullYear() || (fullYear === now.getFullYear() && mm < now.getMonth() + 1)) {
      return setError('That expiration date has already passed.');
    }
    const expMonth = mm;
    const expYear = fullYear % 100;

    // CVC is required whenever a (new) card number is entered; 3–4 digits.
    if (!keepSaved) {
      const cvcDigits = cvc.replace(/\D/g, '');
      if (cvcDigits.length < 3 || cvcDigits.length > 4) return setError('Enter the 3 or 4 digit CVC.');
    }

    setError(null);
    setSaving(true);
    // The store has no in-place updateCard, so editing = replace: drop the old
    // record, then persist the edited one. Both use functional setState so they
    // compose (filter then append) regardless of ordering.
    if (editCard) removeCard(editCard.id);
    await addCard({ brand, last4, expMonth, expYear });
    setSaving(false);
    setAdded(true);
  };

  // Live payments: cards are entered on Stripe's hosted page (PCI-compliant), not
  // in our form. Adding a new card routes there; editing isn't applicable.
  if (paymentsLive && !editCard) {
    return (
      <DarkScreen scroll>
        <DarkTopBar title="Add Payment Method" onBack={() => navigation.goBack()} />
        <View style={styles.logoWrap}>
          <Image source={require('../../assets/img/logo.png')} style={styles.logo} />
        </View>
        <Txt center color={D.textPrimary} style={styles.title}>Add a card securely</Txt>
        <Txt center color={D.textSecondary} style={{ marginHorizontal: 24, marginBottom: 28, lineHeight: 22 }}>
          You'll enter your card on Stripe's secure page. My Favor never sees or stores your full card number.
        </Txt>
        <WhiteButton
          title={openingCheckout ? 'Opening…' : 'Add card with Stripe'}
          onPress={addCardViaStripe}
          loading={openingCheckout}
          disabled={openingCheckout}
        />
        <DarkPillButton title="Done" onPress={() => navigation.goBack()} style={{ marginTop: 12 }} />
      </DarkScreen>
    );
  }

  return (
    <DarkScreen scroll>
      <View style={styles.logoWrap}>
        <Image source={require('../../assets/img/logo.png')} style={styles.logo} />
      </View>

      <Txt center color={D.textPrimary} style={styles.title}>{editCard ? 'Edit Card' : 'Payment Information'}</Txt>

      <DarkField label="Name" value={name} onChangeText={setName} />
      <DarkField
        label="Card Number"
        value={cardNumber}
        onChangeText={edit(setCardNumber)}
        keyboardType="number-pad"
      />

      <View style={styles.twoCol}>
        <View style={{ flex: 1 }}>
          <DarkField label="Expiration" value={expiration} onChangeText={edit(setExpiration)} placeholder="MM/YY" />
        </View>
        <View style={{ flex: 1 }}>
          <DarkField label="CVC" value={cvc} onChangeText={edit(setCvc)} keyboardType="number-pad" maxLength={4} />
        </View>
      </View>

      <DarkField label="Address Line 1" value={address1} onChangeText={setAddress1} />
      <DarkField label="Address Line 2" value={address2} onChangeText={setAddress2} />

      <View style={styles.twoCol}>
        <View style={{ flex: 1 }}>
          <DarkField label="City" value={city} onChangeText={setCity} />
        </View>
        <View style={{ flex: 1 }}>
          <DarkField label="State" value={state} onChangeText={setState} />
        </View>
      </View>

      <View style={styles.twoCol}>
        <View style={{ flex: 1 }}>
          <DarkField label="Zip" value={zip} onChangeText={setZip} keyboardType="number-pad" maxLength={10} />
        </View>
        <View style={{ flex: 1 }}>
          <DarkField label="Country" value={country} onChangeText={setCountry} />
        </View>
      </View>

      {/* PCI scope note: this mock keeps the card fields in component state for
          the PROTOTYPE ONLY. A production build must never hold the raw PAN/CVC —
          it tokenizes on-device with the Stripe SDK (CardField / PaymentSheet),
          then persists only the returned token + brand/last4/exp (what addCard
          already stores). The lockup below is the trust signal for that. */}
      <View style={styles.secured} accessibilityRole="text" accessibilityLabel="Secured by Stripe">
        <Ionicons name="lock-closed" size={16} color={D.textSecondary} />
        <Txt variant="caption" color={D.textSecondary} style={{ marginLeft: 6 }}>Secured by Stripe</Txt>
      </View>

      {error ? (
        <View
          accessibilityLiveRegion="polite"
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: tokens.spacing.base }}
        >
          <Ionicons name="alert-circle" size={18} color={D.brand} style={{ marginRight: 6 }} />
          <Txt variant="bodySm" color={D.brand}>{error}</Txt>
        </View>
      ) : null}

      <WhiteButton title="SUBMIT" onPress={handleSubmit} loading={saving} style={{ marginTop: tokens.spacing.base, marginBottom: tokens.spacing.xl }} />

      <DarkInfoModal
        visible={added}
        title={editCard ? 'Card Updated' : 'Card Added'}
        message={`You have successfully ${editCard ? 'updated' : 'added'} your Bank / Card information`}
        buttonLabel="OKAY"
        onClose={() => { setAdded(false); navigation.goBack(); }}
      />
    </DarkScreen>
  );
}

const styles = StyleSheet.create({
  // Payment
  content: { paddingHorizontal: tokens.spacing.xl },
  sectionHeader: {
    paddingTop: tokens.spacing.xl,
    paddingBottom: tokens.spacing.base,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: D.border,
  },
  heading: { fontFamily: fonts.bodyBold, fontSize: 19, lineHeight: 26 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 68,
    paddingVertical: tokens.spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: D.border,
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
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: D.field,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: D.border,
    paddingHorizontal: 16,
    minHeight: 56,
  },
  btn: {
    height: 54,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalScrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  modalCard: {
    width: '100%',
    backgroundColor: D.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: D.border,
    paddingVertical: 30,
    paddingHorizontal: 26,
  },
});
