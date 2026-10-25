import {useState} from 'react'
import {Pressable, TextInput, View} from 'react-native'
import {useNavigation, useRoute} from '@react-navigation/native'
import {useMediaQuery} from 'react-responsive'

import {type NavigationProp} from '#/lib/routes/types'
import {useViewsAuthLabels} from '#/lib/views/authLabels'
import {useSession} from '#/state/session'
import {useLoggedOutViewControls} from '#/state/shell/logged-out'
import {Logo} from '#/view/icons/Logo'
import {atoms as a, useTheme, web} from '#/alf'
import {Button, ButtonIcon} from '#/components/Button'
import {MagnifyingGlass2_Stroke2_Corner0_Rounded as SearchIcon} from '#/components/icons/MagnifyingGlass2'
import {Menu_Stroke2_Corner0_Rounded as MenuIcon} from '#/components/icons/Menu'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'
import {VideosNavSidebar} from './VideosNavSidebar'

export const VIEWS_HEADER_HEIGHT = 56
const SIDEBAR_EXPANDED = 240
const SIDEBAR_COLLAPSED = 72

/**
 * Shared Aqua Views frame: sticky header, collapsible sidebar, and a drawer
 * below 900px. The watch page starts collapsed; home starts open.
 */
export function ViewsChrome({
  defaultCollapsed = false,
  children,
}: {
  defaultCollapsed?: boolean
  children: React.ReactNode
}) {
  const t = useTheme()
  const navigation = useNavigation<NavigationProp>()
  const route = useRoute()
  const {hasSession} = useSession()
  const {requestSwitchToAccount} = useLoggedOutViewControls()
  const labels = useViewsAuthLabels()
  const narrow = useMediaQuery({maxWidth: 899})
  const phone = useMediaQuery({maxWidth: 599})
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const initialQuery = (route.params as {q?: string} | undefined)?.q
  const [query, setQuery] = useState(initialQuery ?? '')

  const menuOpen = narrow ? drawerOpen : !collapsed
  const sidebarWidth = narrow
    ? 0
    : collapsed
      ? SIDEBAR_COLLAPSED
      : SIDEBAR_EXPANDED

  const toggleMenu = () => {
    if (narrow) setDrawerOpen(open => !open)
    else setCollapsed(value => !value)
  }
  const closeDrawer = () => setDrawerOpen(false)
  const search = () => {
    const q = query.trim()
    if (!q) return
    closeDrawer()
    navigation.navigate('Videos', {source: 'search', q})
  }

  return (
    <View style={[a.w_full, a.flex_1, {minWidth: 0}]}>
      <View
        role="banner"
        style={[
          a.flex_row,
          a.align_center,
          a.gap_md,
          a.px_md,
          a.border_b,
          t.atoms.bg,
          t.atoms.border_contrast_low,
          web({
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            height: VIEWS_HEADER_HEIGHT,
            zIndex: 50,
          }),
        ]}>
        <Button
          label="Abrir ou recolher menu"
          size="small"
          variant="ghost"
          color="secondary"
          shape="round"
          accessibilityState={{expanded: menuOpen}}
          onPress={toggleMenu}>
          <ButtonIcon icon={MenuIcon} />
        </Button>
        <Link
          to="/views"
          label="Aqua Views"
          style={[a.flex_row, a.align_center, a.gap_sm]}>
          <Logo width={28} />
          {!phone && (
            <Text style={[a.text_lg, a.font_bold, web({whiteSpace: 'nowrap'})]}>
              Aqua{' '}
              <Text style={[a.text_lg, a.font_bold, {color: '#0a84d6'}]}>
                Views
              </Text>
            </Text>
          )}
        </Link>
        {!phone && (
          <View
            style={[
              a.flex_1,
              a.flex_row,
              a.align_center,
              {maxWidth: 620, marginLeft: 'auto', marginRight: 'auto'},
            ]}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={search}
              returnKeyType="search"
              placeholder="Pesquisar"
              placeholderTextColor={t.atoms.text_contrast_low.color}
              accessibilityLabel="Pesquisar vídeos"
              accessibilityHint="Busca vídeos no Aqua Views"
              style={[
                a.flex_1,
                a.px_lg,
                a.text_md,
                a.border,
                t.atoms.text,
                t.atoms.bg,
                t.atoms.border_contrast_low,
                web({
                  height: 40,
                  borderTopLeftRadius: 999,
                  borderBottomLeftRadius: 999,
                  borderRightWidth: 0,
                  outlineStyle: 'none',
                } as object),
              ]}
            />
            <Button
              label="Pesquisar"
              size="small"
              variant="solid"
              color="secondary"
              onPress={search}
              style={[
                web({
                  height: 40,
                  width: 56,
                  borderTopLeftRadius: 0,
                  borderBottomLeftRadius: 0,
                  borderTopRightRadius: 999,
                  borderBottomRightRadius: 999,
                }),
              ]}>
              <ButtonIcon icon={SearchIcon} />
            </Button>
          </View>
        )}
        <View
          style={[a.flex_row, a.align_center, a.gap_sm, phone && a.ml_auto]}>
          {!hasSession && (
            <Button
              label={labels.signIn}
              size="small"
              variant="outline"
              color="primary"
              shape="round"
              onPress={() =>
                requestSwitchToAccount({requestedAccount: 'none'})
              }>
              <Text style={[a.font_bold, {color: t.palette.primary_500}]}>
                {phone ? labels.signIn : 'Fazer login'}
              </Text>
            </Button>
          )}
        </View>
      </View>

      {narrow && drawerOpen && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fechar menu"
          accessibilityHint=""
          onPress={closeDrawer}
          style={[
            web({
              position: 'fixed',
              top: VIEWS_HEADER_HEIGHT,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.4)',
              zIndex: 35,
            }),
          ]}
        />
      )}

      <VideosNavSidebar
        collapsed={!narrow && collapsed}
        drawer={narrow}
        open={!narrow || drawerOpen}
        onNavigate={closeDrawer}
      />

      <View
        style={[
          a.flex_1,
          {minWidth: 0},
          web({
            marginLeft: sidebarWidth,
            paddingTop: VIEWS_HEADER_HEIGHT,
            // Clears the fixed logged-out / dock bar so it never covers the last row.
            paddingBottom: 140,
            transition: 'margin-left 200ms ease',
          }),
        ]}>
        {children}
      </View>
    </View>
  )
}
