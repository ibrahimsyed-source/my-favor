import React, { useState } from 'react';
import {
  View, Image, TouchableOpacity, StyleSheet, ScrollView, Dimensions,
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
  selected: boolean;
  onPress: () => void;
}> = ({ image, title, price, selected, onPress }) => {
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
        <Txt variant="body" color={theme.text} style={{ marginTop: 8, marginBottom: tokens.spacing.xl }}>
          Choose the cost of favor based on the amount of effort required.
        </Txt>

        {tierKeys.map((key) => (
          <TierCard
            key={key}
            image={TIER_IMAGES[key as 'tiny' | 'small' | 'big' | 'huge']}
            title={FAVOR_TIERS[key].label}
            price={`$${FAVOR_TIERS[key].price.toFixed(2)}`}
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

  const onNext = () => {
    s.setDraft({ description: desc, images: image ? [image] : [] });
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

        <Field
          value={desc}
          onChangeText={setDesc}
          placeholder={DESC_PLACEHOLDER}
          multiline
          maxLength={250}
        />
        <Txt variant="bodySm" color={theme.textSecondary} style={{ textAlign: 'right', marginTop: -8 }}>
          {250 - desc.length} characters max.
        </Txt>

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
        <Button title="NEXT" onPress={onNext} />
      </Footer>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// 3. Negotiate — time-based pricing slider
// ---------------------------------------------------------------------------
const HOURLY_RATE = 100; // $/hr — 2hrs => $200 (matches reference thumb).
const BUBBLE = 48;

export function Negotiate({ navigation }: any) {
  const { theme } = useTheme();
  const s = useStore();
  const [hours, setHours] = useState(2);
  const [desc, setDesc] = useState(s.draftFavor?.description ?? '');
  const [trackW, setTrackW] = useState(0);

  const rounded = Math.round(hours);
  const price = rounded * HOURLY_RATE;
  const frac = hours / 24;
  const bubbleLeft = frac * Math.max(0, trackW - BUBBLE);

  const onNext = () => {
    s.setDraft({ tier: 'negotiate', hours: rounded, price, description: desc });
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

        <View style={{ height: BUBBLE, justifyContent: 'center', marginTop: tokens.spacing.xxl }} onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}>
          <Slider
            style={{ width: '100%', height: 40 }}
            minimumValue={0}
            maximumValue={24}
            step={1}
            value={hours}
            onValueChange={setHours}
            minimumTrackTintColor="#141414"
            maximumTrackTintColor={theme.divider}
            thumbTintColor="#141414"
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

        <Txt variant="body" color={theme.text} style={{ marginTop: tokens.spacing.xxl, marginBottom: tokens.spacing.base }}>
          Describe the favor you need.
        </Txt>
        <Field
          value={desc}
          onChangeText={setDesc}
          placeholder={DESC_PLACEHOLDER}
          multiline
          maxLength={250}
        />
        <Txt variant="bodySm" color={theme.textSecondary} style={{ textAlign: 'right', marginTop: -8 }}>
          {250 - desc.length} characters max.
        </Txt>
      </ScrollView>

      <Footer>
        <Button title="NEXT" onPress={onNext} />
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

export function ConfirmAddress({ navigation }: any) {
  const { theme } = useTheme();
  const s = useStore();
  const address = s.user?.homeAddress ?? '2099 Woodvine Rd, Lorman, MS';
  const pals = s.pals;

  const onConfirm = () => {
    s.setDraft({ location: { lat: 31.8069, lng: -91.0593, address } });
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
              <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}>
                <Ionicons name="close" size={20} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: tokens.spacing.md }}>
              <Ionicons name="location" size={18} color={theme.primary} />
              <Txt variant="body" numberOfLines={1} style={{ flex: 1, marginLeft: 8 }}>{address}</Txt>
            </View>

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
                <Txt variant="bodySm" color={theme.textSecondary} style={{ marginLeft: 8 }}>Where to?</Txt>
              </View>
              <View style={{ backgroundColor: theme.surfaceAlt, paddingHorizontal: 16, paddingVertical: 6, borderRadius: tokens.radius.pill }}>
                <Txt variant="label">NOW</Txt>
              </View>
            </View>

            <View style={{ marginTop: tokens.spacing.base }}>
              <Button title="Confirm Address" uppercase={false} onPress={onConfirm} />
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
