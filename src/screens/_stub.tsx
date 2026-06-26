import React from 'react';
import { View } from 'react-native';
import { Screen, TopBar, Txt, Button } from '../components';
import { useTheme } from '../theme';

// Generic placeholder used by feature stubs until an agent implements the real
// screen. Lets the whole app run + navigate before every screen is built.
export const makeStub = (title: string, next?: { label: string; to: string; params?: any }) =>
  function StubScreen({ navigation }: any) {
    const { theme } = useTheme();
    return (
      <Screen padded={false}>
        <TopBar title={title} onBack={navigation.canGoBack() ? navigation.goBack : undefined} />
        <View style={{ flex: 1, padding: 20, justifyContent: 'center', gap: 16 }}>
          <Txt variant="h4" center>{title}</Txt>
          <Txt variant="caption" color={theme.textSecondary} center>
            Screen scaffolded — implementation pending.
          </Txt>
          {next && <Button title={next.label} onPress={() => navigation.navigate(next.to, next.params)} />}
        </View>
      </Screen>
    );
  };
