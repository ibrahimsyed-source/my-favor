import React, { useState, useRef, useCallback } from 'react';
import {
  View, Image, TextInput, TouchableOpacity, StyleSheet, ScrollView, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import * as ImagePicker from 'expo-image-picker';
import {
  Screen, TopBar, Txt, Button, Field, Card, Avatar, MapPlaceholder,
} from '../components';
import { useTheme, tokens } from '../theme';
import { useStore } from '../store';
import { FAVOR_TIERS, FavorTier } from '../types';

const SCREEN_H = Dimensions.get('window').height;

// Custom tier illustrations exported from Figma (node 100:12594).
const TIER_IMAGES: Record<'tiny' | 'small' | 'big' | 'huge', any> = {
  tiny: require('../../assets/img/request/tier-tiny.png'),
  small: require('../../assets/img/request/tier-small.png'),
  big: require('../../assets/img/request/tier-big.png'),
  huge: require('../../assets/img/request/tier-huge.png'),
};

// Plain-language examples so members can pick the right tier instead of guessing.
// Kept local (FAVOR_TIERS lives in the shared types module we don't edit here).
const TIER_EXAMPLES: Record<'tiny' | 'small' | 'big' | 'huge', string> = {
  tiny: 'Quick errands — dog walk, coffee run',
  small: '~1hr tasks — groceries, yard tidy',
  big: 'Half-day help — furniture build, deep clean',
  huge: 'Big jobs — small move, event setup',
};

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------
const Footer: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { theme } = useTheme();
  return (
    <View style={[styles.footer, { borderTopColor: theme.border }]}>{children}</View>
  );
};

// ---------------------------------------------------------------------------
// 1. SelectFavor — "How big is the favor?"
// ---------------------------------------------------------------------------
const TierCard: React.FC<{
  image?: any;
  title: string;
  price: string;
  example?: string;
  selected: boolean;
  onPress: () => void;
}> = ({ image, title, price, example, selected, onPress }) => {
  const { theme } = useTheme();
  return (
    <Card
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        marginBottom: tokens.spacing.base,
        borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
        borderColor: selected ? theme.cta : theme.border,
      }}
    >
      <View style={styles.thumb}>
        {image ? (
          <Image source={image} style={{ width: 60, height: 60 }} resizeMode="contain" />
        ) : (
          <Txt variant="h2" color={theme.text}>$</Txt>
        )}
      </View>
      <View style={{ flex: 1, marginLeft: 14 }}>
        <Txt variant="h6">{title}</Txt>
        <Txt variant="caption" color={theme.textSecondary} style={{ marginTop: 4 }}>
          {price}
        </Txt>
        {example ? (
          <Txt variant="caption" color={theme.textTertiary} style={{ marginTop: 2 }}>
            {example}
          </Txt>
        ) : null}
      </View>
      <View
        style={[
          styles.selectPill,
          { backgroundColor: selected ? theme.primary : theme.cta },
        ]}
      >
        <Txt variant="caption" color="#FFFFFF" style={{ fontSize: 11, letterSpacing: 0.5 }}>
          {selected ? 'SELECTED' : 'SELECT'}
        </Txt>
      </View>
    </Card>
  );
};

export function SelectFavor({ navigation }: any) {
  const { theme } = useTheme();
  const s = useStore();
  const [selected, setSelected] = useState<FavorTier | null>(null);

  const tierKeys: Array<keyof typeof FAVOR_TIERS> = ['tiny', 'small', 'big', 'huge'];
  const canNext = selected !== null;

  const onNext = () => {
    if (!selected) return;
    // "Custom" → negotiate the price by time on the Negotiate screen.
    if (selected === 'custom') {
      s.setDraft({ tier: 'negotiate' });
      navigation.navigate('Negotiate');
      return;
    }
    const price = FAVOR_TIERS[selected as keyof typeof FAVOR_TIERS].price;
    s.setDraft({ tier: selected, price });
    navigation.navigate('FavorDescription');
  };

  return (
    <Screen padded={false}>
      <TopBar
        title="Select Favor"
        onBack={navigation.canGoBack() ? navigation.goBack : undefined}
      />
      <ScrollView contentContainerStyle={{ padding: tokens.spacing.lg }}>
        <Txt variant="h3">How big is the favor?</Txt>
        <Txt variant="body" color={theme.text} style={{ marginTop: 8, marginBottom: tokens.spacing.base }}>
          Choose the cost of favor based on the amount of effort required.
        </Txt>

        <View
          style={{ flexDirection: 'row', alignItems: 'center', marginBottom: tokens.spacing.xl }}
        >
          <Ionicons name="information-circle-outline" size={16} color={theme.textSecondary} />
          <Txt variant="caption" color={theme.textSecondary} style={{ flex: 1, marginLeft: 6 }}>
            You'll choose your Favor Pal next — review their profile before they start.
          </Txt>
        </View>

        {tierKeys.map((key) => (
          <TierCard
            key={key}
            image={TIER_IMAGES[key as 'tiny' | 'small' | 'big' | 'huge']}
            title={FAVOR_TIERS[key].label}
            price={`$${FAVOR_TIERS[key].price.toFixed(2)}`}
            example={TIER_EXAMPLES[key as 'tiny' | 'small' | 'big' | 'huge']}
            selected={selected === key}
            onPress={() => setSelected(key)}
          />
        ))}

        <TierCard
          title="Custom"
          price="Negotiate your price"
          selected={selected === 'custom'}
          onPress={() => setSelected('custom')}
        />
      </ScrollView>

      <Footer>
        <Button title="NEXT" disabled={!canNext} onPress={onNext} />
      </Footer>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// 2. FavorDescription — "What is the favor?"
// ---------------------------------------------------------------------------
const DESC_PLACEHOLDER =
  'Provide as much detail as possible about your favor!  Let your provider know about what they will be doing, what they will need to bring, special requirements, etc.';

const DESC_MAX = 250;

// Memoized so a parent re-render (e.g. the Negotiate price slider dragging) never
// re-renders this TextInput. The counter shows the remaining-count honestly.
const DescriptionField = React.memo(function DescriptionField({
  value,
  onChangeText,
  maxLength = DESC_MAX,
}: {
  value: string;
  onChangeText: (t: string) => void;
  maxLength?: number;
}) {
  const { theme } = useTheme();
  return (
    <>
      <Field
        value={value}
        onChangeText={onChangeText}
        placeholder={DESC_PLACEHOLDER}
        multiline
        maxLength={maxLength}
      />
      <Txt variant="bodySm" color={theme.textSecondary} style={{ textAlign: 'right', marginTop: -8 }}>
        {maxLength - value.length} characters left.
      </Txt>
    </>
  );
});

export function FavorDescription({ navigation }: any) {
  const { theme } = useTheme();
  const s = useStore();
  const [desc, setDesc] = useState(s.draftFavor?.description ?? '');
  const [image, setImage] = useState<string | null>(null);

  const pickImage = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.7 });
      if (!res.canceled && res.assets?.[0]) setImage(res.assets[0].uri);
    } catch {
      // image picker is optional — ignore failures (e.g. web / no permission)
    }
  };

  const canNext = desc.trim().length > 0;

  const onNext = () => {
    if (!canNext) return;
    s.setDraft({ description: desc.trim(), images: image ? [image] : [] });
    navigation.navigate('ConfirmAddress');
  };

  return (
    <Screen padded={false}>
      <TopBar
        title="Favor Description"
        onBack={navigation.canGoBack() ? navigation.goBack : undefined}
      />
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: tokens.spacing.lg }}>
        <Txt variant="h3" style={{ marginTop: 8 }}>What is the favor?</Txt>
        <Txt variant="body" color={theme.text} style={{ marginTop: tokens.spacing.base, marginBottom: tokens.spacing.base }}>
          Describe the favor you need.
        </Txt>

        <DescriptionField value={desc} onChangeText={setDesc} />

        <TouchableOpacity activeOpacity={0.8} onPress={pickImage} style={[styles.addTile, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
          {image ? (
            <Image source={{ uri: image }} style={{ width: '100%', height: '100%', borderRadius: tokens.radius.md }} resizeMode="cover" />
          ) : (
            <>
              <Ionicons name="camera" size={26} color={theme.textTertiary} />
              <Txt variant="caption" color={theme.textSecondary} style={{ marginTop: 6 }}>Add Image</Txt>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      <Footer>
        <Button title="NEXT" disabled={!canNext} onPress={onNext} />
      </Footer>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// 3. Negotiate — time-based pricing slider
// ---------------------------------------------------------------------------
const HOURLY_RATE = 100; // $/hr — 2hrs => $200 (matches reference thumb).
const BUBBLE = 48;

// The slider + price bubble + derived labels own their own `hours` state and are
// memoized, so dragging (which fires on every tick) never re-renders the parent
// Negotiate screen or its description TextInput. The committed price is reported
// up via onChange (the parent keeps it in a ref to avoid re-rendering on drag).
const PriceSlider = React.memo(function PriceSlider({
  onChange,
}: {
  onChange: (hours: number, price: number) => void;
}) {
  const { theme } = useTheme();
  const [hours, setHours] = useState(2);
  const [trackW, setTrackW] = useState(0);

  const rounded = Math.round(hours);
  const price = rounded * HOURLY_RATE;
  const frac = hours / 24;
  const bubbleLeft = frac * Math.max(0, trackW - BUBBLE);

  const handleValue = (v: number) => {
    setHours(v);
    const r = Math.round(v);
    onChange(r, r * HOURLY_RATE);
  };

  return (
    <>
      <View
        style={{ height: BUBBLE, justifyContent: 'center', marginTop: tokens.spacing.xxl }}
        onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
      >
        <Slider
          style={{ width: '100%', height: 40 }}
          minimumValue={0}
          maximumValue={24}
          step={1}
          value={hours}
          onValueChange={handleValue}
          minimumTrackTintColor="#141414"
          maximumTrackTintColor={theme.divider}
          thumbTintColor="#141414"
          accessibilityRole="adjustable"
          accessibilityLabel="Favor duration"
          accessibilityValue={{ text: `${rounded} hours, $${price}` }}
        />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: bubbleLeft,
            width: BUBBLE,
            height: BUBBLE,
            borderRadius: BUBBLE / 2,
            backgroundColor: '#141414',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Txt variant="caption" color="#FFFFFF" style={{ fontSize: 12 }}>${price}</Txt>
        </View>
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: tokens.spacing.sm }}>
        <Txt variant="h6">0</Txt>
        <Txt variant="h6">{rounded}hrs</Txt>
        <Txt variant="h6">24hrs</Txt>
      </View>

      <Txt variant="body" color={theme.textSecondary} center style={{ marginTop: tokens.spacing.base }}>
        {rounded}hrs x ${HOURLY_RATE} = ${price}
      </Txt>
    </>
  );
});

export function Negotiate({ navigation }: any) {
  const { theme } = useTheme();
  const s = useStore();
  const [desc, setDesc] = useState(s.draftFavor?.description ?? '');
  // Hold the slider's committed price in a ref so drags don't re-render this screen.
  const priceRef = useRef({ hours: 2, price: 2 * HOURLY_RATE });

  const handlePrice = useCallback((hours: number, price: number) => {
    priceRef.current = { hours, price };
  }, []);

  const canNext = desc.trim().length > 0;

  const onNext = () => {
    if (!canNext) return;
    const { hours, price } = priceRef.current;
    s.setDraft({ tier: 'negotiate', hours, price, description: desc.trim() });
    navigation.navigate('ConfirmAddress');
  };

  return (
    <Screen padded={false}>
      <TopBar
        title="Negotiate Your Favor"
        onBack={navigation.canGoBack() ? navigation.goBack : undefined}
      />
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: tokens.spacing.lg }}>
        <Txt variant="h3" style={{ marginTop: 8 }}>What is the favor?</Txt>
        <Txt variant="body" color={theme.text} style={{ marginTop: tokens.spacing.base }}>
          Use the slider below to calculate your favor price based on the time you need
        </Txt>

        <PriceSlider onChange={handlePrice} />

        <Txt variant="body" color={theme.text} style={{ marginTop: tokens.spacing.xxl, marginBottom: tokens.spacing.base }}>
          Describe the favor you need.
        </Txt>
        <DescriptionField value={desc} onChangeText={setDesc} />
      </ScrollView>

      <Footer>
        <Button title="NEXT" disabled={!canNext} onPress={onNext} />
      </Footer>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// 4. ConfirmAddress — map + floating location sheet
// ---------------------------------------------------------------------------
const MapMarker: React.FC<{ uri?: string }> = ({ uri }) => (
  <View style={styles.marker}>
    <Avatar uri={uri} size={38} />
  </View>
);

// Honest "When?" options that actually set draft.scheduledFor (requestFavor reads
// it). The clock icon now describes timing instead of the old mislabeled "Where to?".
const WHEN_OPTIONS: { label: string; offsetMs?: number }[] = [
  { label: 'Now' },
  { label: 'In 1 hour', offsetMs: 60 * 60 * 1000 },
  { label: 'In 3 hours', offsetMs: 3 * 60 * 60 * 1000 },
  { label: 'Tomorrow', offsetMs: 24 * 60 * 60 * 1000 },
];

export function ConfirmAddress({ navigation }: any) {
  const { theme } = useTheme();
  const s = useStore();
  // Editable — default from the member's saved home address, fall back to the seed.
  const [address, setAddress] = useState(
    s.draftFavor?.location?.address ?? s.user?.homeAddress ?? '2099 Woodvine Rd, Lorman, MS'
  );
  const [whenIdx, setWhenIdx] = useState(0);
  const pals = s.pals;

  // Recent/saved addresses — the member's home plus distinct addresses from past
  // favors, so they can refill in one tap instead of retyping.
  const recentAddresses = (() => {
    const seen = new Set<string>();
    const out: string[] = [];
    const home = s.user?.homeAddress?.trim();
    if (home) { seen.add(home); out.push(home); }
    for (const f of s.history) {
      const a = f.location?.address?.trim();
      if (a && !seen.has(a)) { seen.add(a); out.push(a); }
      if (out.length >= 5) break;
    }
    return out;
  })();

  const when = WHEN_OPTIONS[whenIdx];
  const canConfirm = address.trim().length > 0;

  const onConfirm = () => {
    if (!canConfirm) return;
    const scheduledFor = when.offsetMs != null ? Date.now() + when.offsetMs : undefined;
    s.setDraft({
      location: { lat: 31.8069, lng: -91.0593, address: address.trim() },
      scheduledFor,
    });
    navigation.navigate('FavorSummary');
  };

  return (
    <Screen padded={false}>
      <View style={{ flex: 1 }}>
        <MapPlaceholder height={SCREEN_H} label="">
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <View style={{ position: 'absolute', top: '42%', left: '44%' }}>
              <Ionicons name="location" size={42} color={theme.primary} />
            </View>
            <View style={{ position: 'absolute', top: '54%', left: '18%' }}>
              <MapMarker uri={pals[0]?.avatar} />
            </View>
            <View style={{ position: 'absolute', top: '60%', left: '64%' }}>
              <MapMarker uri={pals[1]?.avatar} />
            </View>
            <View style={{ position: 'absolute', top: '70%', left: '40%' }}>
              <MapMarker uri={pals[2]?.avatar} />
            </View>
          </View>
        </MapPlaceholder>

        <View style={{ position: 'absolute', top: 16, left: 16, right: 16 }}>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Txt variant="label">Location of your favor</Txt>
              <TouchableOpacity
                onPress={() => navigation.goBack()}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={20} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: tokens.spacing.md }}>
              <Ionicons name="location" size={18} color={theme.primary} />
              <TextInput
                value={address}
                onChangeText={setAddress}
                placeholder="Enter the favor address"
                placeholderTextColor={theme.textTertiary}
                style={[tokens.typography.body, { flex: 1, marginLeft: 8, color: theme.text, paddingVertical: 0 }]}
                returnKeyType="done"
                accessibilityLabel="Favor address"
              />
            </View>

            {recentAddresses.length > 0 ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                {recentAddresses.map((a, i) => (
                  <TouchableOpacity
                    key={a}
                    onPress={() => setAddress(a)}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={`Use address ${a}`}
                    style={{
                      backgroundColor: theme.surfaceAlt, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6,
                      flexDirection: 'row', alignItems: 'center', gap: 4,
                    }}
                  >
                    <Ionicons name={i === 0 && a === s.user?.homeAddress ? 'home-outline' : 'time-outline'} size={13} color={theme.textSecondary} />
                    <Txt variant="caption" color={theme.text} numberOfLines={1} style={{ maxWidth: 180 }}>{a}</Txt>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: tokens.spacing.md,
                paddingTop: tokens.spacing.md,
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: theme.divider,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="time-outline" size={18} color={theme.textSecondary} />
                <Txt variant="bodySm" color={theme.textSecondary} style={{ marginLeft: 8 }}>When?</Txt>
              </View>
              <TouchableOpacity
                onPress={() => setWhenIdx((i) => (i + 1) % WHEN_OPTIONS.length)}
                accessibilityRole="button"
                accessibilityLabel={`When: ${when.label}`}
                accessibilityHint="Tap to change when the favor should happen"
                style={{
                  backgroundColor: theme.surfaceAlt,
                  paddingHorizontal: 16,
                  paddingVertical: 6,
                  borderRadius: tokens.radius.pill,
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                <Txt variant="label">{when.label}</Txt>
                <Ionicons name="chevron-down" size={14} color={theme.textSecondary} style={{ marginLeft: 4 }} />
              </TouchableOpacity>
            </View>

            <View style={{ marginTop: tokens.spacing.base }}>
              <Button title="Confirm Address" uppercase={false} disabled={!canConfirm} onPress={onConfirm} />
            </View>
          </Card>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  footer: {
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.md,
    paddingBottom: tokens.spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: tokens.radius.sm,
    backgroundColor: '#EDEDED',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  selectPill: {
    height: 27,
    paddingHorizontal: 14,
    borderRadius: 13.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addTile: {
    width: 110,
    height: 110,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: tokens.spacing.base,
    borderWidth: 1,
    borderStyle: 'dashed',
    overflow: 'hidden',
  },
  marker: {
    borderWidth: 2,
    borderColor: '#FFFFFF',
    borderRadius: 21,
    ...tokens.shadow.card,
  },
});
