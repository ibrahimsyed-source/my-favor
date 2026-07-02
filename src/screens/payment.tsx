import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, Image, TextInput, TouchableOpacity, ScrollView, StyleSheet, Modal,
  ActivityIndicator, Linking,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { Screen } from '../components';
import { useStore } from '../store';
import { fonts, palette } from '../theme';

// ---------------------------------------------------------------------------
// User App v.2 payment module — rebuilt against the Figma v.2 frames (captured
// from Figma web on 2026-07-01; REST API quota was exhausted):
//   Payment                         #125:7697   (white shell: ← top bar "Payment")
//   Payment - Card List Filled      #125:7756   ("Payment Methods" rows + red remove)
//   Payment - Card List Empty       #1690:15798 ("No Information To Be Displayed")
//   Payment - Choose Payment Method #125:7830   (copy + "Credit or Debit Card" row)
//   Payment - Device Verification   #1357:17714 (logo, "Verify Device", VERIFY MY DEVICE)
//   Payment - Device Verification Code #1357:17757 (logo, 4 code boxes, Resend, VERIFY)
//   Payment info                    #1357:17815 (logo, "Payment Information" form)
//   Payment - Card Form Expanded    #1449:17701 (full form incl. City/State/Zip/Country, SUBMIT)
//   Payment - Card Add Success      #1449:17785 ("Success" modal, CLOSE)
//   Card Added                      #125:7999   ("Card Added" modal, OKAY)
//   Card Already Exist              #125:8044   ("Saving Failed" modal, CLOSE)
//
// All v.2 payment surfaces are LIGHT (white bg, near-black text, black CTA,
// #EFEFEF fields) and set in Poppins. The frame states are folded into the two
// exported screens via internal state:
//   Payment: 'list' (empty/filled from store) → 'choose' → 'verify' → 'code' → AddCard
//   AddCard: Payment Information form → Success / Card Added / Saving Failed modals
// Store logic (addCard/removeCard, hosted-Stripe gating via paymentsLive) is
// unchanged — only presentation follows the v.2 frames.
// ---------------------------------------------------------------------------

// Poppins Medium is registered in App.tsx but not exposed via the fonts map
// (typography.ts only maps 600/700). The v.2 body/labels render in this weight.
const P_MED = 'Poppins_500Medium';
const PAD = 24; // v.2 content inset measured off the frames

// ---------------------------------------------------------------------------
// v.2 building blocks (local — shared kit components predate the v.2 look:
// TopBar uses a chevron and Button is a pill; v.2 uses a plain ← arrow and
// ~300px-wide black buttons with 8px corners).
// ---------------------------------------------------------------------------
function V2TopBar({ title, onBack }: { title: string; onBack?: () => void }) {
  return (
    <View style={s.topbar}>
      <View style={s.topbarSide}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="arrow-back" size={24} color={palette.textPrimary} />
          </TouchableOpacity>
        ) : null}
      </View>
      <Text style={s.topbarTitle} numberOfLines={1}>{title}</Text>
      <View style={s.topbarSide} />
    </View>
  );
}

// Black CTA — v.2 buttons are ~300px wide, centered, 8px radius (SUBMIT /
// VERIFY / VERIFY MY DEVICE). Modals pass width:'100%' to fill the card.
function V2Button({
  title, onPress, loading, disabled, style,
}: {
  title: string;
  onPress?: () => void;
  loading?: boolean;
  disabled?: boolean;
  style?: any;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      disabled={!!disabled || !!loading}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled || !!loading, busy: !!loading }}
      accessibilityLabel={title}
      style={[s.cta, disabled ? { opacity: 0.5 } : null, style]}
    >
      {loading ? <ActivityIndicator color={palette.white} /> : <Text style={s.ctaLabel}>{title}</Text>}
    </TouchableOpacity>
  );
}

// Centered white dialog card over a 50% scrim — matches the Card Added /
// Saving Failed / Success modal frames (title, 2-line body, black button).
function V2Modal({
  visible, title, message, buttonLabel, onClose,
}: {
  visible: boolean;
  title: string;
  message: string;
  buttonLabel: string;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.scrim}>
        <View style={s.modalCard}>
          <Text style={s.modalTitle}>{title}</Text>
          <Text style={s.modalBody}>{message}</Text>
          <V2Button title={buttonLabel} onPress={onClose} style={{ width: '100%', marginTop: 24 }} />
        </View>
      </View>
    </Modal>
  );
}

// Confirm dialog in the same v.2 modal styling (no dedicated frame exists for
// card removal; kept because deletion is destructive and Alert.alert no-ops on
// web — carried over from the earlier product-review fix).
function V2Confirm({
  visible, title, message, confirmLabel, cancelLabel, onConfirm, onCancel,
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={s.scrim}>
        <View style={s.modalCard}>
          <Text style={s.modalTitle}>{title}</Text>
          <Text style={s.modalBody}>{message}</Text>
          <V2Button title={confirmLabel} onPress={onConfirm} style={{ width: '100%', marginTop: 24 }} />
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel={cancelLabel}
            style={s.secondaryBtn}
          >
            <Text style={s.secondaryLabel}>{cancelLabel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// Form field per the Payment Information frames — regular-weight label above a
// filled #EFEFEF input, 8px radius. The demo strings from the frames are
// PLACEHOLDERS (per spec), not values.
function FormField({
  label, value, onChangeText, placeholder, keyboardType, maxLength,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: any;
  maxLength?: number;
}) {
  return (
    <View style={{ marginBottom: 20 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        style={s.fieldInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={palette.textTertiary}
        keyboardType={keyboardType}
        maxLength={maxLength}
        accessibilityLabel={label}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Payment — saved payment methods (frames #125:7697 shell, #125:7756 filled,
// #1690:15798 empty) plus the add-a-card chain folded in as internal stages:
// Choose Payment Method (#125:7830) → Verify Device (#1357:17714) →
// Verification Code (#1357:17757) → navigates to AddCard.
// ---------------------------------------------------------------------------
export function Payment({ navigation }: any) {
  const { cards, removeCard } = useStore();
  const [stage, setStage] = useState<'list' | 'choose' | 'verify' | 'code'>('list');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [code, setCode] = useState<string[]>(['', '', '', '']);
  const codeRefs = useRef<Array<TextInput | null>>([]);

  const cardLabel = (c: { brand: string; last4: string }) =>
    `${c.brand.charAt(0).toUpperCase() + c.brand.slice(1)} *${c.last4}`; // "Visa *4242"

  const pendingCard = cards.find((c) => c.id === pendingDeleteId);

  const handleCode = (i: number, t: string) => {
    const d = t.replace(/\D/g, '').slice(-1);
    setCode((prev) => {
      const next = [...prev];
      next[i] = d;
      return next;
    });
    if (d && i < 3) codeRefs.current[i + 1]?.focus();
  };

  const verifyCode = () => {
    if (code.join('').length < 4) return; // mock 2FA: any 4 digits pass
    setStage('list');
    setCode(['', '', '', '']);
    navigation.navigate('AddCard');
  };

  const resendCode = () => {
    setCode(['', '', '', '']);
    codeRefs.current[0]?.focus();
  };

  return (
    <Screen padded={false}>
      {stage === 'list' && (
        <>
          <V2TopBar title="Payment" onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined} />
          <View style={s.content}>
            <Text style={s.sectionHeader}>Payment Methods</Text>
            <View style={s.divider} />

            {cards.length === 0 ? (
              <>
                {/* Card List Empty #1690:15798 */}
                <View style={s.row}>
                  <Text style={[s.rowLabel, { paddingLeft: 8 }]}>No Information To Be Displayed</Text>
                </View>
                <View style={s.divider} />
              </>
            ) : (
              cards.map((card) => (
                <React.Fragment key={card.id}>
                  {/* Card List Filled #125:7756 — icon + "Visa *4242" + red remove */}
                  <View style={s.row}>
                    <Ionicons name="card-outline" size={24} color={palette.textPrimary} style={s.rowIcon} />
                    <Text style={s.rowLabel}>{cardLabel(card)}</Text>
                    <TouchableOpacity
                      onPress={() => setPendingDeleteId(card.id)}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${cardLabel(card)}`}
                    >
                      <Ionicons name="remove-circle" size={24} color={palette.brand} />
                    </TouchableOpacity>
                  </View>
                  <View style={s.divider} />
                </React.Fragment>
              ))
            )}

            <TouchableOpacity
              activeOpacity={0.7}
              style={s.row}
              onPress={() => setStage('choose')}
              accessibilityRole="button"
              accessibilityLabel="Add payment method"
            >
              <Ionicons name="add" size={26} color={palette.textPrimary} style={s.rowIcon} />
              <Text style={s.rowLabel}>Add Payment Method</Text>
              <Ionicons name="chevron-forward" size={20} color={palette.textPrimary} />
            </TouchableOpacity>
            <View style={s.divider} />

            <TouchableOpacity
              activeOpacity={0.7}
              style={s.row}
              onPress={() => navigation.navigate('Tabs', { screen: 'History' })}
              accessibilityRole="button"
              accessibilityLabel="Payment history"
            >
              <MaterialIcons name="list-alt" size={24} color={palette.textPrimary} style={s.rowIcon} />
              <Text style={s.rowLabel}>Payment History</Text>
              <Ionicons name="chevron-forward" size={20} color={palette.textPrimary} />
            </TouchableOpacity>
            <View style={s.divider} />
          </View>
        </>
      )}

      {stage === 'choose' && (
        <>
          {/* Choose Payment Method #125:7830 */}
          <V2TopBar title="Choose Payment Method" onBack={() => setStage('list')} />
          <View style={s.content}>
            <Text style={s.chooseCopy}>
              This will be used for ride payments,{'\n'}but only after the ride is done
            </Text>
            <View style={[s.divider, { marginTop: 24 }]} />
            <TouchableOpacity
              activeOpacity={0.7}
              style={s.row}
              onPress={() => setStage('verify')}
              accessibilityRole="button"
              accessibilityLabel="Credit or debit card"
            >
              <Ionicons name="card-outline" size={24} color={palette.textPrimary} style={s.rowIcon} />
              <Text style={s.rowLabel}>Credit or Debit Card</Text>
              <Ionicons name="chevron-forward" size={20} color={palette.textPrimary} />
            </TouchableOpacity>
            <View style={s.divider} />
          </View>
        </>
      )}

      {stage === 'verify' && (
        // Device Verification #1357:17714 — no top bar in the frame
        <ScrollView contentContainerStyle={s.centerWrap} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Image source={require('../../assets/img/logo.png')} style={s.logo} />
          <Text style={[s.bigTitle, { marginTop: 88 }]}>Verify Device</Text>
          <Text style={s.centerCopy}>
            Before we can add a card payment{'\n'}we need to verify your device.
          </Text>
          <V2Button title="VERIFY MY DEVICE" onPress={() => setStage('code')} style={{ marginTop: 24 }} />
        </ScrollView>
      )}

      {stage === 'code' && (
        // Device Verification Code #1357:17757
        <ScrollView contentContainerStyle={s.centerWrap} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Image source={require('../../assets/img/logo.png')} style={s.logo} />
          <Text style={[s.bigTitle, { marginTop: 88 }]}>Verification Code</Text>
          <Text style={s.centerCopy}>
            We sent a code to your device.{'\n'}Please enter the code here.
          </Text>
          <View style={s.codeRow}>
            {code.map((d, i) => (
              <TextInput
                key={i}
                ref={(r) => { codeRefs.current[i] = r; }}
                style={s.codeBox}
                value={d}
                onChangeText={(t) => handleCode(i, t)}
                onKeyPress={({ nativeEvent }) => {
                  if (nativeEvent.key === 'Backspace' && !code[i] && i > 0) codeRefs.current[i - 1]?.focus();
                }}
                keyboardType="number-pad"
                maxLength={1}
                accessibilityLabel={`Verification digit ${i + 1}`}
              />
            ))}
          </View>
          {/* Frame renders a typographic apostrophe (Didn’t), not a straight quote */}
          <Text style={s.resendAsk}>{'Didn’t receive a code?'}</Text>
          <TouchableOpacity onPress={resendCode} hitSlop={8} accessibilityRole="button" accessibilityLabel="Resend code">
            <Text style={s.resendLink}>Resend</Text>
          </TouchableOpacity>
          <V2Button title="VERIFY" onPress={verifyCode} style={{ marginTop: 40, marginBottom: 32 }} />
        </ScrollView>
      )}

      <V2Confirm
        visible={!!pendingDeleteId}
        title="Remove Card"
        message={`${pendingCard ? cardLabel(pendingCard) : 'This card'} will be removed from your wallet.`}
        confirmLabel="REMOVE"
        cancelLabel="CANCEL"
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
// AddCard — "Payment Information" billing form (Payment info #1357:17815 /
// Card Form Expanded #1449:17701): logo, centered heading, Name / Card Number /
// Expiration+CVC / Address 1+2 / City+State / Zip+Country, black SUBMIT.
// Success → "Success" modal (#1449:17785); duplicate → "Saving Failed"
// (#125:8044); edit-save → "Card Added" (#125:7999).
//
// Opened from a saved card with route.params.cardId it prefills that card
// (we only persist brand/last4/exp, so the PAN shows masked). Store logic —
// addCard/removeCard, validation, and the hosted-Stripe path when payments are
// live — is preserved from the previous build.
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

  // The demo strings in the v.2 frames ("Anton Vanko", "4111 1111 1111 1111",
  // "01/2025"…) are placeholders, so a fresh add starts EMPTY; an edit prefills
  // real values from the saved card.
  const [name, setName] = useState('');
  const [cardNumber, setCardNumber] = useState(editCard ? `•••• •••• •••• ${editCard.last4}` : '');
  const [expiration, setExpiration] = useState(
    editCard ? `${String(editCard.expMonth).padStart(2, '0')}/${editExpYear}` : ''
  );
  const [cvc, setCvc] = useState('');
  const [address1, setAddress1] = useState('');
  const [address2, setAddress2] = useState('');
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState('');
  const [zip, setZip] = useState('');
  const [country, setCountry] = useState('');
  const [saving, setSaving] = useState(false);
  // Which v.2 dialog is showing: added → "Success", updated → "Card Added",
  // exists → "Saving Failed".
  const [result, setResult] = useState<null | 'added' | 'updated' | 'exists'>(null);
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

    // "Card Already Exist" frame #125:8044 — saving a card that's already in
    // the wallet fails instead of duplicating it.
    const duplicate = cards.some(
      (c: any) => c.last4 === last4 && c.expMonth === expMonth && c.expYear === expYear && (!editCard || c.id !== editCard.id)
    );
    if (duplicate) return setResult('exists');

    setError(null);
    setSaving(true);
    // The store has no in-place updateCard, so editing = replace: drop the old
    // record, then persist the edited one. Both use functional setState so they
    // compose (filter then append) regardless of ordering.
    if (editCard) removeCard(editCard.id);
    await addCard({ brand, last4, expMonth, expYear });
    setSaving(false);
    setResult(editCard ? 'updated' : 'added');
  };

  const closeAndBack = () => {
    setResult(null);
    navigation.goBack();
  };

  // Live payments: cards are entered on Stripe's hosted page (PCI-compliant), not
  // in our form. Adding a new card routes there; editing isn't applicable.
  // (App-specific screen — no v.2 frame exists; styled to the v.2 language.)
  if (paymentsLive && !editCard) {
    return (
      <Screen padded={false}>
        <V2TopBar title="Add Payment Method" onBack={() => navigation.goBack()} />
        <View style={s.centerWrap}>
          <Image source={require('../../assets/img/logo.png')} style={s.logo} />
          <Text style={[s.bigTitle, { marginTop: 48 }]}>Add a card securely</Text>
          <Text style={s.centerCopy}>
            You&apos;ll enter your card on Stripe&apos;s secure page. My Favor never sees or stores your full card number.
          </Text>
          <V2Button
            title={openingCheckout ? 'OPENING…' : 'ADD CARD WITH STRIPE'}
            onPress={addCardViaStripe}
            loading={openingCheckout}
            disabled={openingCheckout}
            style={{ marginTop: 28 }}
          />
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Done"
            style={[s.secondaryBtn, { width: '74%', maxWidth: 300 }]}
          >
            <Text style={s.secondaryLabel}>DONE</Text>
          </TouchableOpacity>
        </View>
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={s.formWrap} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {/* Payment info #1357:17815 / Card Form Expanded #1449:17701 — logo +
            centered heading, no top bar in the frames */}
        <Image source={require('../../assets/img/logo.png')} style={[s.logo, { alignSelf: 'center', marginTop: 40 }]} />
        <Text style={s.formTitle}>Payment Information</Text>

        <FormField label="Name" value={name} onChangeText={setName} placeholder="Anton Vanko" />
        <FormField
          label="Card Number"
          value={cardNumber}
          onChangeText={edit(setCardNumber)}
          placeholder="4111 1111 1111 1111"
          keyboardType="number-pad"
        />

        <View style={s.twoCol}>
          <View style={{ flex: 1 }}>
            <FormField label="Expiration" value={expiration} onChangeText={edit(setExpiration)} placeholder="01/2025" />
          </View>
          <View style={{ flex: 1 }}>
            <FormField
              label="CVC"
              value={cvc}
              onChangeText={edit(setCvc)}
              placeholder="234"
              keyboardType="number-pad"
              maxLength={4}
            />
          </View>
        </View>

        <FormField label="Address Line 1" value={address1} onChangeText={setAddress1} placeholder="123 Main St." />
        <FormField label="Address Line 2" value={address2} onChangeText={setAddress2} placeholder="2N" />

        <View style={s.twoCol}>
          <View style={{ flex: 1 }}>
            <FormField label="City" value={city} onChangeText={setCity} placeholder="Chicago" />
          </View>
          <View style={{ flex: 1 }}>
            <FormField label="State" value={stateName} onChangeText={setStateName} placeholder="Illinois" />
          </View>
        </View>

        <View style={s.twoCol}>
          <View style={{ flex: 1 }}>
            {/* The frame's Zip placeholder literally reads "Chicago" — kept
                verbatim for pixel/copy fidelity with #1449:17701. */}
            <FormField label="Zip" value={zip} onChangeText={setZip} placeholder="Chicago" maxLength={10} />
          </View>
          <View style={{ flex: 1 }}>
            <FormField label="Country" value={country} onChangeText={setCountry} placeholder="United States" />
          </View>
        </View>

        {error ? (
          <View accessibilityLiveRegion="polite" style={s.errorRow}>
            <Ionicons name="alert-circle" size={18} color={palette.brand} style={{ marginRight: 6 }} />
            <Text style={s.errorText}>{error}</Text>
          </View>
        ) : null}

        <V2Button title="SUBMIT" onPress={handleSubmit} loading={saving} style={{ marginTop: 8, marginBottom: 16 }} />
      </ScrollView>

      {/* Payment - Card Add Success #1449:17785 */}
      <V2Modal
        visible={result === 'added'}
        title="Success"
        message={'You have successfully added a\ncard payment!'}
        buttonLabel="CLOSE"
        onClose={closeAndBack}
      />
      {/* Card Added #125:7999 — shown for the edit/save path */}
      <V2Modal
        visible={result === 'updated'}
        title="Card Added"
        message={'You have successfully added your\nBank / Card information'}
        buttonLabel="OKAY"
        onClose={closeAndBack}
      />
      {/* Card Already Exist #125:8044 */}
      <V2Modal
        visible={result === 'exists'}
        title="Saving Failed"
        message="Card already exists!"
        buttonLabel="CLOSE"
        onClose={() => setResult(null)}
      />
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Styles — hexes come from the shared palette, which was extracted from this
// same Figma kit (text #1A1A1A, divider #E5E5E5, input #EFEFEF, CTA #141414,
// brand #ED1C24).
// ---------------------------------------------------------------------------
const s = StyleSheet.create({
  // Top bar: plain ← arrow + centered Poppins title + hairline (v.2).
  topbar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.divider,
    backgroundColor: palette.white,
  },
  topbarSide: { width: 32 },
  topbarTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.displayMedium,
    fontSize: 18,
    color: palette.textPrimary,
  },

  // Payment list / choose
  content: { paddingHorizontal: PAD },
  sectionHeader: {
    fontFamily: P_MED,
    fontSize: 16,
    color: palette.textPrimary,
    paddingTop: PAD,
    paddingBottom: 16,
  },
  divider: { height: 1, backgroundColor: palette.divider },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 56 },
  rowIcon: { width: 26, textAlign: 'center', marginRight: 16 },
  rowLabel: { flex: 1, fontFamily: P_MED, fontSize: 16, color: palette.textPrimary },
  chooseCopy: { marginTop: 20, fontFamily: P_MED, fontSize: 15, lineHeight: 22, color: palette.textPrimary },

  // Verify Device / Verification Code / Stripe screen
  centerWrap: { alignItems: 'center', paddingHorizontal: PAD, paddingTop: 64 },
  logo: { width: 148, height: 148, borderRadius: 32 },
  bigTitle: { fontFamily: fonts.displayMedium, fontSize: 24, color: palette.textPrimary, textAlign: 'center' },
  centerCopy: {
    marginTop: 14,
    fontFamily: P_MED,
    fontSize: 15,
    lineHeight: 22,
    color: palette.textPrimary,
    textAlign: 'center',
  },
  codeRow: { flexDirection: 'row', gap: 12, marginTop: 28 },
  codeBox: {
    width: 64,
    height: 64,
    borderRadius: 8,
    backgroundColor: palette.inputBg,
    fontFamily: fonts.displayMedium,
    fontSize: 24,
    color: palette.textPrimary,
    textAlign: 'center',
  },
  resendAsk: { marginTop: 48, fontFamily: P_MED, fontSize: 15, color: palette.textPrimary },
  resendLink: { marginTop: 14, fontFamily: fonts.displayMedium, fontSize: 15, color: palette.textPrimary },

  // Buttons
  cta: {
    alignSelf: 'center',
    width: '74%',
    maxWidth: 300,
    height: 46,
    borderRadius: 8,
    backgroundColor: palette.cta,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaLabel: { fontFamily: fonts.displayMedium, fontSize: 13, letterSpacing: 1, color: palette.white },
  secondaryBtn: {
    alignSelf: 'center',
    width: '100%',
    height: 46,
    borderRadius: 8,
    backgroundColor: palette.secondaryBtn,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  secondaryLabel: { fontFamily: fonts.displayMedium, fontSize: 13, letterSpacing: 1, color: palette.textPrimary },

  // Payment Information form
  formWrap: { paddingHorizontal: PAD, paddingBottom: 32 },
  formTitle: {
    fontFamily: fonts.displayMedium,
    fontSize: 24,
    color: palette.textPrimary,
    textAlign: 'center',
    marginTop: 72,
    marginBottom: 24,
  },
  fieldLabel: { fontFamily: P_MED, fontSize: 15, color: palette.textPrimary, marginBottom: 8 },
  fieldInput: {
    height: 44,
    borderRadius: 8,
    backgroundColor: palette.inputBg,
    paddingHorizontal: 14,
    fontFamily: P_MED,
    fontSize: 15,
    color: palette.textPrimary,
  },
  twoCol: { flexDirection: 'row', gap: 14 },
  errorRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  errorText: { fontFamily: P_MED, fontSize: 14, color: palette.brand },

  // Modals (Card Added / Saving Failed / Success)
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  modalCard: {
    width: '100%',
    backgroundColor: palette.white,
    borderRadius: 16,
    paddingVertical: 28,
    paddingHorizontal: 22,
    alignItems: 'center',
  },
  modalTitle: { fontFamily: fonts.displayMedium, fontSize: 22, color: palette.textPrimary, textAlign: 'center' },
  modalBody: {
    marginTop: 12,
    fontFamily: P_MED,
    fontSize: 15,
    lineHeight: 22,
    color: palette.textPrimary,
    textAlign: 'center',
  },
});
