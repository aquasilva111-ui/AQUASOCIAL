import {type JSX} from 'react'
import {View} from 'react-native'
import {msg} from '@lingui/macro'
import {useLingui} from '@lingui/react'
import type React from 'react'

import {useKawaiiMode} from '#/state/preferences/kawaii'
import {useSession} from '#/state/session'
import {useShellLayout} from '#/state/shell/shell-layout'
import {HomeHeaderLayoutMobile} from '#/view/com/home/HomeHeaderLayoutMobile'
import {atoms as a, useBreakpoints, useGutters, useTheme} from '#/alf'
import {AquaEyeLogo} from '#/components/AquaEyeLogo'
import {ButtonIcon} from '#/components/Button'
import {FeedViewSwitcher} from '#/components/feeds/FeedViewSwitcher'
import {Hashtag_Stroke2_Corner0_Rounded as FeedsIcon} from '#/components/icons/Hashtag'
import * as Layout from '#/components/Layout'
import {Link} from '#/components/Link'

export function HomeHeaderLayout(props: {
  children: React.ReactNode
  tabBarAnchor: JSX.Element | null | undefined
  onHeightChange?: (height: number) => void
}) {
  const {gtMobile} = useBreakpoints()
  if (!gtMobile) {
    return <HomeHeaderLayoutMobile {...props} />
  } else {
    return <HomeHeaderLayoutDesktopAndTablet {...props} />
  }
}

function HomeHeaderLayoutDesktopAndTablet({
  children,
  tabBarAnchor,
}: {
  children: React.ReactNode
  tabBarAnchor: JSX.Element | null | undefined
  onHeightChange?: (height: number) => void
}) {
  const t = useTheme()
  const {headerHeight} = useShellLayout()
  const {hasSession} = useSession()
  const {_} = useLingui()
  const kawaii = useKawaiiMode()
  const gutters = useGutters([0, 'base'])

  return (
    <>
      {hasSession && (
        // Above the sticky tab row, so the mode switcher menu can open over it.
        <Layout.Center style={[a.z_20]}>
          <View
            style={[
              a.flex_row,
              a.align_center,
              gutters,
              a.pt_md,
              t.atoms.bg,
              {paddingBottom: 10},
            ]}>
            <View style={a.flex_1} />
            <Link
              to="/"
              action="navigate"
              hitSlop={10}
              label={_(msg`Aqua - Home`)}
              size="small"
              variant="ghost"
              color="secondary"
              shape="square"
              style={[a.justify_center, a.bg_transparent]}>
              {({hovered, pressed}) => (
                <AquaEyeLogo
                  size={kawaii ? 60 : 28}
                  active={hovered || pressed}
                />
              )}
            </Link>
            <View
              style={[
                a.flex_1,
                a.flex_row,
                a.align_center,
                a.justify_end,
                a.gap_xs,
              ]}>
              <FeedViewSwitcher placement="icon" />
              <Link
                to="/feeds"
                hitSlop={10}
                label={_(msg`View your feeds and explore more`)}
                size="small"
                variant="ghost"
                color="secondary"
                shape="square"
                style={[a.justify_center]}>
                <ButtonIcon icon={FeedsIcon} size="lg" />
              </Link>
            </View>
          </View>
        </Layout.Center>
      )}
      {tabBarAnchor}
      <Layout.Center
        style={[a.sticky, a.z_10, a.align_center, t.atoms.bg, {top: 0}]}
        onLayout={e => {
          headerHeight.set(e.nativeEvent.layout.height)
        }}>
        {children}
      </Layout.Center>
    </>
  )
}
