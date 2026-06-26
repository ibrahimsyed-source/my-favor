import React from 'react';
import { View, Text, Image, TouchableOpacity } from 'react-native';
import { Screen, Txt, Button } from '../components';
import { useTheme, fonts } from '../theme';
import { useStore } from '../store';

// Assets ----------------------------------------------------------------------
const logo = require('../../assets/img/logo.png');
const launchPeople = require('../../assets/img/onboarding/launch-people.png');
const welcomeMower = require('../../assets/img/onboarding/welcome-mower.png');

// Shared 3-dot carousel indicator. Active dot = solid black, inactive = gray ring.
function PagerDots({ index }: { index: number }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 }}>
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={{
            width: 11,
            height: 11,
            borderRadius: 6,
            backgroundColor: i === index ? '#141414' : 'transparent',
            borderWidth: i === index ? 0 : 1.5,
            borderColor: '#C7C7C7',
          }}
        />
      ))}
    </View>
  );
}

// 1. Launch — splash: logo, two characters, "My Favor" wordmark, dots (1st active).
export function Launch({ navigation }: any) {
  return (
    <Screen padded={false}>
      <TouchableOpacity
        activeOpacity={1}
        onPress={() => navigation.navigate('Welcome')}
        style={{ flex: 1, paddingHorizontal: 24, paddingBottom: 28, alignItems: 'center' }}
      >
        <View style={{ flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' }}>
          <Image source={logo} style={{ width: 150, height: 150, marginBottom: 28 }} resizeMode="contain" />
          <Image
            source={launchPeople}
            style={{ width: 250, height: 290, marginBottom: 20 }}
            resizeMode="contain"
          />
          <Txt variant="display" center style={{ fontSize: 44, lineHeight: 54 }}>
            My Favor
          </Txt>
        </View>
        <PagerDots index={0} />
      </TouchableOpacity>
    </Screen>
  );
}

// 2. Welcome — lawnmower hero, headline w/ green $$, two role buttons, dots (2nd active).
export function Welcome({ navigation }: any) {
  const { theme } = useTheme();
  const s = useStore();

  const pick = (role: 'member' | 'pal') => {
    s.setRole(role);
    navigation.navigate('SignupLogin');
  };

  return (
    <Screen padded={false}>
      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 28 }}>
        <Image
          source={welcomeMower}
          style={{ width: '100%', height: 300, marginTop: 8 }}
          resizeMode="contain"
        />
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Txt variant="body" center style={{ fontSize: 28, lineHeight: 40 }}>
            Ask for all the favors you need, or earn{' '}
            <Text style={{ color: theme.success, fontFamily: fonts.bodyBold }}>$$</Text> doing favors for others.
          </Txt>
        </View>
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
          <Button
            title="ASK A FAVOR"
            variant="primary"
            onPress={() => pick('member')}
            style={{ flex: 1, paddingHorizontal: 8 }}
          />
          <Button
            title="BE A FAVOR PAL"
            variant="secondary"
            onPress={() => pick('pal')}
            style={{ flex: 1, paddingHorizontal: 8 }}
          />
        </View>
        <PagerDots index={1} />
      </View>
    </Screen>
  );
}

// 3. SignupLogin — logo + wordmark, stacked LOGIN/SIGNUP buttons, dots (3rd active).
export function SignupLogin({ navigation }: any) {
  return (
    <Screen padded={false}>
      <View style={{ flex: 1, paddingHorizontal: 24, paddingBottom: 28, alignItems: 'center' }}>
        <View style={{ flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' }}>
          <Image source={logo} style={{ width: 150, height: 150, marginBottom: 24 }} resizeMode="contain" />
          <Txt variant="display" center style={{ fontSize: 44, lineHeight: 54 }}>
            My Favor
          </Txt>
        </View>
        <View style={{ width: '100%', gap: 14, marginBottom: 24 }}>
          <Button title="LOGIN" variant="primary" onPress={() => navigation.navigate('Login')} />
          <Button title="SIGNUP" variant="secondary" onPress={() => navigation.navigate('Signup')} />
        </View>
        <PagerDots index={2} />
      </View>
    </Screen>
  );
}
