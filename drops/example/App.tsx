import { InfiniteMedia } from '@rbayuokt/expo-infinite-media';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { CacheScreen } from './screens/CacheScreen';
import { FeedScreen } from './screens/FeedScreen';
import { HomeScreen, type Route } from './screens/HomeScreen';
import { LayoutsScreen } from './screens/LayoutsScreen';
import { StressScreen } from './screens/StressScreen';

if (Platform.OS !== 'web') InfiniteMedia.configure({ maxVideoDiskBytes: 300 * 1024 * 1024, logLevel: __DEV__ ? 'debug' : 'warn' });

// EXPO_PUBLIC_CLEAR_CACHE=1 wipes the caches at startup, for a cold benchmark run.
if (Platform.OS !== 'web' && process.env.EXPO_PUBLIC_CLEAR_CACHE === '1') {
  InfiniteMedia.clearCache();
}

type Entry = { route: Route | 'nested' | 'lab'; key: number; presetId?: string };

// EXPO_PUBLIC_START_ROUTE=stress opens a screen directly, handy for profiling runs.
const START = process.env.EXPO_PUBLIC_START_ROUTE as Route | undefined;
// EXPO_PUBLIC_START_PRESET=cinema opens the feed with that layout preset.
const START_PRESET = process.env.EXPO_PUBLIC_START_PRESET;

const styles = StyleSheet.create({ root: { flex: 1 } });

export default function App() {
  // A tiny stack. Screens underneath stay mounted, like a native stack, so feeds there go inactive.
  const [stack, setStack] = useState<Entry[]>([{ route: START ?? 'feed', key: 0, presetId: START_PRESET }]);
  const push = (route: Entry['route'], presetId?: string) =>
    setStack((s) => [...s, { route, key: Date.now(), presetId }]);
  const pop = () => setStack((s) => s.slice(0, -1));

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        {stack.map((entry, i) => {
          const top = i === stack.length - 1;
          return (
            <View key={entry.key} style={StyleSheet.absoluteFill} pointerEvents={top ? 'auto' : 'none'}>
              {entry.route === 'feed' || entry.route === 'nested' ? (
                <FeedScreen
                  active={top}
                  prefix={entry.route === 'nested' ? `nested${entry.key}` : 'feed'}
                  title={entry.route === 'nested' ? 'Seguindo' : 'Para você'}
                  presetId={entry.presetId}
                  onBack={i === 0 ? undefined : pop}
                  onOpenNested={entry.presetId ? undefined : () => push('nested')}
                  onOpenLab={i === 0 ? () => push('lab') : undefined}
                />
              ) : entry.route === 'lab' ? (
                <HomeScreen onOpen={push} onBack={pop} />
              ) : entry.route === 'layouts' ? (
                <LayoutsScreen onOpen={(presetId) => push('feed', presetId)} onBack={pop} />
              ) : entry.route === 'stress' ? (
                <StressScreen onBack={pop} />
              ) : (
                <CacheScreen onBack={pop} />
              )}
            </View>
          );
        })}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
