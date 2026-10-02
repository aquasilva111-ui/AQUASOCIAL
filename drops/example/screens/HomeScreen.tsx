import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { IconName } from '../components/icons';
import { color, eyebrow, radius } from '../theme';

export type Route = 'feed' | 'layouts' | 'stress' | 'cache';

function Tile({ icon, accent, title, body, onPress }: { icon: IconName; accent: string; title: string; body: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
      <View style={[styles.tileIcon, { borderColor: accent }]}>
        <Ionicons name={icon} size={20} color={accent} />
      </View>
      <View style={styles.tileText}>
        <Text style={styles.tileTitle}>{title}</Text>
        <Text style={styles.tileBody} numberOfLines={3}>
          {body}
        </Text>
      </View>
    </Pressable>
  );
}

export function HomeScreen({ onOpen, onBack }: { onOpen: (route: Route) => void; onBack?: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 28 }]}>
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={10} accessibilityLabel="Voltar" style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
          <Ionicons name="arrow-back" size={20} color={color.text} />
        </Pressable>
      ) : null}
      <Text style={styles.kicker}>Aqua</Text>
      <Text style={styles.wordmark}>
        Drops<Text style={{ color: color.aqua }}>.</Text>
      </Text>
      <Text style={styles.lead}>
        Vídeos e fotos em tela cheia, sem fim. Toque duas vezes para curtir com laranja, deslize para o próximo drop.
      </Text>

      <Pressable onPress={() => onOpen('feed')} style={({ pressed }) => [pressed && styles.pressed]}>
        <LinearGradient
          colors={[color.aquaDeep, color.aquaLight]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}>
          <View style={styles.play}>
            <Ionicons name="play" size={22} color={color.aquaDeep} style={{ marginLeft: 3 }} />
          </View>
          <Text style={styles.heroTitle}>Assistir Drops</Text>
          <Text style={styles.heroBody}>Toque para pausar, toque duplo para curtir, deslize para mais</Text>
        </LinearGradient>
      </Pressable>

      <Text style={[styles.kicker, { marginTop: 10 }]}>Laboratório</Text>
      <View style={styles.row}>
        <Tile
          icon="play"
          accent={color.aqua}
          title="Feed"
          body="O feed padrão, com o overlay completo"
          onPress={() => onOpen('feed')}
        />
        <Tile
          icon="grid"
          accent={color.violet}
          title="Layouts"
          body="Um feed, cinco combinações de props"
          onPress={() => onOpen('layouts')}
        />
      </View>

      <View style={styles.row}>
        <Tile
          icon="flash"
          accent={color.amber}
          title="Stress"
          body="1,200 posts, auto swipe, rapid jumps, remounts"
          onPress={() => onOpen('stress')}
        />
        <Tile
          icon="layers"
          accent={color.sky}
          title="Cache"
          body="Disk usage, per-post status, preload, clear"
          onPress={() => onOpen('cache')}
        />
      </View>

      <Text style={styles.foot}>Todo 37º drop é um vídeo quebrado e todo 41º uma foto ausente, de propósito.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  back: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: color.line, backgroundColor: color.surface, alignItems: 'center', justifyContent: 'center' },
  root: { flex: 1, backgroundColor: color.bg },
  content: { paddingHorizontal: 20, gap: 18 },
  kicker: eyebrow,
  wordmark: { color: color.text, fontSize: 64, lineHeight: 64, fontWeight: '900', letterSpacing: -2 },
  lead: { color: color.muted, fontSize: 15, lineHeight: 22, marginBottom: 6 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  hero: {
    borderRadius: radius.lg,
    padding: 20,
    minHeight: 190,
    justifyContent: 'flex-end',
    gap: 6,
  },
  play: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    marginBottom: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: { color: color.text, fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
  heroBody: { color: 'rgba(255,255,255,0.85)', fontSize: 14 },
  row: { flexDirection: 'row', gap: 12 },
  tile: {
    flex: 1,
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.line,
    padding: 16,
    minHeight: 170,
    justifyContent: 'space-between',
  },
  tileText: { gap: 4, minHeight: 78 },
  tileIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileTitle: { color: color.text, fontSize: 19, fontWeight: '800' },
  tileBody: { color: color.muted, fontSize: 13, lineHeight: 18 },
  foot: { color: color.faint, fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: 6 },
});
