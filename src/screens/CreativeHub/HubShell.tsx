import {View} from 'react-native'

import {HUB_TABS, hubPath, type HubTabId} from '#/lib/creative-hub/model'
import {isWeb} from '#/platform/detection'
import {useSession} from '#/state/session'
import {Logo} from '#/view/icons/Logo'
import {atoms as a, useTheme, web} from '#/alf'
import {Bell_Stroke2_Corner0_Rounded as BellIcon} from '#/components/icons/Bell'
import {Book_Stroke2_Corner2_Rounded as BookIcon} from '#/components/icons/Book'
import {Home_Stroke2_Corner2_Rounded as HomeIcon} from '#/components/icons/Home'
import {CREATIVE_ORANGE} from '#/components/icons/LaunchMark'
import {MagnifyingGlass2_Stroke2_Corner0_Rounded as SearchIcon} from '#/components/icons/MagnifyingGlass2'
import {PlusLarge_Stroke2_Corner0_Rounded as PlusIcon} from '#/components/icons/Plus'
import {UserCircle_Stroke2_Corner0_Rounded as ProfileIcon} from '#/components/icons/UserCircle'
import * as Layout from '#/components/Layout'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'

const RAIL_WIDTH = 68

/**
 * Creative Hub chrome. On web the hub takes the whole page: the regular side
 * navs are off (see FULL_PAGE_ROUTES) and a compact icon-only rail stands in
 * for the left nav. On native it is a normal screen with a header.
 */
export function HubShell({
  tab,
  children,
}: {
  tab: HubTabId
  children: React.ReactNode
}) {
  const tabs = <TabBar tab={tab} />
  if (isWeb) {
    return (
      <Layout.Screen testID="creativeHubScreen" hideCenterBorders>
        <View
          style={[
            a.flex_row,
            a.w_full,
            web({alignItems: 'flex-start', minHeight: '100vh', width: '100%'}),
          ]}>
          <Rail />
          <View style={[a.flex_1, {minWidth: 0}]}>
            {tabs}
            <View style={[a.p_xl, a.gap_2xl]}>{children}</View>
          </View>
        </View>
      </Layout.Screen>
    )
  }
  return (
    <Layout.Screen testID="creativeHubScreen">
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>Creative Hub</Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>
      <Layout.Content>
        {tabs}
        <View style={[a.p_lg, a.gap_xl]}>{children}</View>
      </Layout.Content>
    </Layout.Screen>
  )
}

function TabBar({tab}: {tab: HubTabId}) {
  const t = useTheme()
  return (
    <View
      accessibilityRole="tablist"
      style={[
        a.flex_row,
        a.px_md,
        a.border_b,
        t.atoms.border_contrast_low,
        web({overflowX: 'auto'}),
      ]}>
      {HUB_TABS.map(item => {
        const active = item.id === tab
        return (
          <Link
            key={item.id}
            to={hubPath(item.id)}
            label={item.label}
            accessibilityRole="tab"
            accessibilityState={{selected: active}}>
            <View
              style={[
                a.px_md,
                a.py_md,
                a.border_b,
                {
                  borderBottomWidth: 2,
                  borderBottomColor: active ? CREATIVE_ORANGE : 'transparent',
                },
              ]}>
              <Text
                style={[
                  a.text_sm,
                  active ? a.font_bold : t.atoms.text_contrast_medium,
                ]}>
                {item.label}
              </Text>
            </View>
          </Link>
        )
      })}
    </View>
  )
}

const RAIL_ITEMS = [
  {to: '/', label: 'Início', icon: HomeIcon},
  {to: '/search', label: 'Buscar', icon: SearchIcon},
  {to: '/books', label: 'Livros', icon: BookIcon},
  {to: '/notifications', label: 'Avisos', icon: BellIcon},
  {to: '/profile', label: 'Perfil', icon: ProfileIcon},
]

/** Icon-only left nav. Names show as tooltips and screen-reader labels. */
function Rail() {
  const t = useTheme()
  const {currentAccount} = useSession()
  return (
    <View
      style={[
        a.align_center,
        a.gap_xs,
        a.py_lg,
        a.border_r,
        t.atoms.border_contrast_low,
        web({
          position: 'sticky',
          top: 0,
          height: '100vh',
          width: RAIL_WIDTH,
          flexShrink: 0,
        }),
      ]}>
      <Link to="/" label="Aqua" style={[a.pb_lg]}>
        <Logo width={28} />
      </Link>
      {RAIL_ITEMS.map(item => {
        const to =
          item.to === '/profile' && currentAccount
            ? `/profile/${currentAccount.handle}`
            : item.to
        return (
          <Link
            key={item.label}
            to={to}
            label={item.label}
            style={[
              a.rounded_md,
              a.align_center,
              a.justify_center,
              {width: 48, height: 48},
            ]}
            {...web({title: item.label})}>
            <item.icon size="lg" style={t.atoms.text} />
          </Link>
        )
      })}
      <View
        accessibilityLabel="Creative Hub (página atual)"
        accessibilityHint=""
        style={[
          a.rounded_full,
          a.align_center,
          a.justify_center,
          a.mt_md,
          {width: 48, height: 48, backgroundColor: CREATIVE_ORANGE},
        ]}>
        <PlusIcon size="md" fill="#fff" />
      </View>
    </View>
  )
}
