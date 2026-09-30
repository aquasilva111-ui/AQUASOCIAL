import {StyleSheet, View} from 'react-native'
import Animated, {FadeInDown, FadeOutUp} from 'react-native-reanimated'
import {BlurView} from 'expo-blur'
import {type AppBskyActorDefs} from '@atproto/api'
import {msg} from '@lingui/macro'
import {useLingui} from '@lingui/react'

import {HITSLOP_20} from '#/lib/constants'
import {PressableScale} from '#/lib/custom-animations/PressableScale'
import {useGate} from '#/lib/statsig/statsig'
import {atoms as a, useTheme} from '#/alf'
import {AvatarStack} from '#/components/AvatarStack'
import {ArrowTop_Stroke2_Corner0_Rounded as ArrowIcon} from '#/components/icons/Arrow'
import {Text} from '#/components/Typography'

/**
 * X-style "new posts" pill: an animated glass capsule shown at the top of the
 * feed when fresh posts arrive. Tapping it scrolls up and loads the latest.
 */
export function NewPostsPill({
  authors,
  onPress,
  label,
  text,
}: {
  authors: AppBskyActorDefs.ProfileViewBasic[]
  onPress: () => void
  label: string
  /** Overrides the default "posted" text (used when there are no avatars). */
  text?: string
}) {
  const t = useTheme()
  const {_} = useLingui()
  const gate = useGate()
  if (gate('remove_show_latest_button')) {
    return null
  }

  return (
    <Animated.View
      entering={FadeInDown.springify().damping(15).stiffness(180)}
      exiting={FadeOutUp.duration(150)}>
      <PressableScale
        onPress={onPress}
        hitSlop={HITSLOP_20}
        accessibilityLabel={label}
        accessibilityHint=""
        accessibilityRole="button"
        targetScale={0.95}>
        <View
          style={[
            a.flex_row,
            a.align_center,
            a.rounded_full,
            a.overflow_hidden,
            a.gap_sm,
            styles.capsule,
          ]}>
          <BlurView
            intensity={50}
            tint={t.name === 'light' ? 'light' : 'dark'}
            style={StyleSheet.absoluteFill}
          />
          <ArrowIcon size="sm" style={styles.white} />
          {authors.length > 0 && (
            <AvatarStack
              profiles={authors}
              size={22}
              backgroundColor="rgba(255, 255, 255, 0.85)"
            />
          )}
          <Text style={[a.font_bold, styles.white, styles.label]}>
            {text ?? _(msg`posted`)}
          </Text>
        </View>
      </PressableScale>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  capsule: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    backgroundColor: '#002bef',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  white: {
    color: '#fff',
  },
  label: {
    fontSize: 13,
    letterSpacing: 0,
  },
})
