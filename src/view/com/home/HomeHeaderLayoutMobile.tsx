import {type JSX} from 'react'
import {View} from 'react-native'
import Animated from 'react-native-reanimated'
import {useSafeAreaInsets} from 'react-native-safe-area-context'
import {msg} from '@lingui/macro'
import {useLingui} from '@lingui/react'

import {HITSLOP_10} from '#/lib/constants'
import {useHaptics} from '#/lib/haptics'
import {useMinimalShellHeaderTransform} from '#/lib/hooks/useMinimalShellTransform'
import {isWeb} from '#/platform/detection'
import {emitSoftReset} from '#/state/events'
import {useSession} from '#/state/session'
import {useShellLayout} from '#/state/shell/shell-layout'
import {Logo} from '#/view/icons/Logo'
import {atoms as a, useTheme} from '#/alf'
import {ButtonIcon} from '#/components/Button'
import {Hashtag_Stroke2_Corner0_Rounded as FeedsIcon} from '#/components/icons/Hashtag'
import * as Layout from '#/components/Layout'
import {Link} from '#/components/Link'

export function HomeHeaderLayoutMobile({
  children,
  onHeightChange,
}: {
  children: React.ReactNode
  tabBarAnchor: JSX.Element | null | undefined
  onHeightChange?: (height: number) => void
}) {
  const t = useTheme()
  const {_} = useLingui()
  const {headerHeight} = useShellLayout()
  const headerMinimalShellTransform = useMinimalShellHeaderTransform()
  const {hasSession} = useSession()
  const playHaptic = useHaptics()
  // On web the header is `position: fixed`, which ignores the screen's top
  // padding, so it would sit under the status bar / Dynamic Island. Pad it
  // by the safe-area inset instead (native is already inset by the screen).
  const {top: topInset} = useSafeAreaInsets()

  return (
    <Animated.View
      style={[
        a.fixed,
        a.z_10,
        t.atoms.bg,
        {
          top: 0,
          left: 0,
          right: 0,
        },
        isWeb && {paddingTop: topInset},
        headerMinimalShellTransform,
      ]}
      onLayout={e => {
        headerHeight.set(e.nativeEvent.layout.height)
        onHeightChange?.(e.nativeEvent.layout.height)
      }}>
      <Layout.Header.Outer noBottomBorder>
        <Layout.Header.Slot>
          <Layout.Header.MenuButton />
        </Layout.Header.Slot>

        <View style={[a.flex_1, a.align_center]}>
          <Link
            to="/"
            action="navigate"
            hitSlop={HITSLOP_10}
            label={_(msg`Aqua - Home`)}
            size="small"
            variant="ghost"
            color="secondary"
            shape="square"
            style={[a.justify_center, a.bg_transparent]}
            onPress={() => {
              playHaptic('Light')
              emitSoftReset()
            }}>
            <Logo width={30} />
          </Link>
        </View>

        <Layout.Header.Slot>
          {hasSession && (
            <Link
              testID="viewHeaderHomeFeedPrefsBtn"
              to={{screen: 'Feeds'}}
              hitSlop={HITSLOP_10}
              label={_(msg`View your feeds and explore more`)}
              size="small"
              variant="ghost"
              color="secondary"
              shape="square"
              style={[
                a.justify_center,
                {marginRight: -Layout.BUTTON_VISUAL_ALIGNMENT_OFFSET},
                a.bg_transparent,
              ]}>
              <ButtonIcon icon={FeedsIcon} size="lg" />
            </Link>
          )}
        </Layout.Header.Slot>
      </Layout.Header.Outer>
      {children}
    </Animated.View>
  )
}
