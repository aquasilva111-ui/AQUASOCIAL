import {Pressable, View} from 'react-native'

import {makeProfileLink} from '#/lib/routes/links'
import {useProfileQuery} from '#/state/queries/profile'
import {useSession} from '#/state/session'
import {useSetThemePrefs} from '#/state/shell/color-mode'
import {UserAvatar} from '#/view/com/util/UserAvatar'
import {Logo} from '#/view/icons/Logo'
import {atoms as a, useBreakpoints, useTheme, web} from '#/alf'
import {Button, ButtonIcon} from '#/components/Button'
import {SearchInput} from '#/components/forms/SearchInput'
import {Moon_Stroke2_Corner0_Rounded as MoonIcon} from '#/components/icons/Moon'
import {Sun_Stroke2_Corner0_Rounded as SunIcon} from '#/components/icons/Sun'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'
import {Capsule} from './VisionboardCapsule'

export type VisionboardTab<T extends string> = {value: T; label: string}

/**
 * Full-width Visionboard header (web). Replaces the app's side navs on this
 * page, the same way Aqua Views does; the logo leads back to AQUA.
 */
export function VisionboardTopBar<T extends string>({
  tabs,
  activeTab,
  onSelectTab,
  search,
  onChangeSearch,
  onSubmitSearch,
  onClearSearch,
}: {
  tabs: VisionboardTab<T>[]
  activeTab: T
  onSelectTab: (value: T) => void
  search: string
  onChangeSearch: (value: string) => void
  onSubmitSearch: () => void
  onClearSearch: () => void
}) {
  const t = useTheme()
  const {gtTablet} = useBreakpoints()

  return (
    <View
      style={[
        a.w_full,
        a.flex_row,
        a.align_center,
        a.gap_lg,
        a.px_xl,
        a.border_b,
        t.atoms.border_contrast_low,
        t.atoms.bg,
        {minHeight: 70, paddingVertical: 12},
        web({position: 'sticky', top: 0, zIndex: 30}),
      ]}>
      <Link
        to="/"
        label="Voltar ao AQUA"
        style={[a.flex_row, a.align_center, a.gap_sm]}>
        <Logo width={34} />
        <Text style={[a.text_xl, {fontWeight: '800'}]}>Visionboard</Text>
      </Link>

      {gtTablet && (
        <View style={[a.flex_row, a.align_center, a.gap_2xs]}>
          {tabs.map(tab => {
            const active = tab.value === activeTab
            return (
              <Pressable
                key={tab.value}
                accessibilityRole="tab"
                accessibilityState={{selected: active}}
                accessibilityLabel={tab.label}
                accessibilityHint=""
                onPress={() => onSelectTab(tab.value)}
                style={[
                  {
                    paddingVertical: 8,
                    paddingHorizontal: 14,
                    borderBottomWidth: 3,
                    borderBottomColor: active
                      ? t.palette.contrast_900
                      : 'transparent',
                  },
                ]}>
                <Text
                  style={[
                    a.text_md,
                    a.font_semi_bold,
                    active ? t.atoms.text : t.atoms.text_contrast_medium,
                  ]}>
                  {tab.label}
                </Text>
              </Pressable>
            )
          })}
        </View>
      )}

      <View style={[a.flex_1, a.align_center]}>
        <View style={[a.w_full, {maxWidth: 520}]}>
          <SearchInput
            value={search}
            onChangeText={onChangeSearch}
            onSubmitEditing={onSubmitSearch}
            onClearText={onClearSearch}
            placeholder="Buscar no Visionboard"
          />
        </View>
      </View>

      <Capsule
        label="Meus Visionboards"
        to="/visionboard/boards"
        compact
        text="Meus Visionboards"
      />
      <ThemeToggle />
      <Account />
    </View>
  )
}

function ThemeToggle() {
  const {setColorMode} = useSetThemePrefs()
  const t = useTheme()
  const isDark = t.scheme === 'dark'
  return (
    <Button
      label={isDark ? 'Usar tema claro' : 'Usar tema escuro'}
      size="large"
      shape="round"
      variant="outline"
      color="secondary"
      onPress={() => setColorMode(isDark ? 'light' : 'dark')}>
      <ButtonIcon icon={isDark ? SunIcon : MoonIcon} />
    </Button>
  )
}

function Account() {
  const t = useTheme()
  const {currentAccount} = useSession()
  const {data: profile} = useProfileQuery({did: currentAccount?.did})

  if (!currentAccount) return null
  return (
    <Link
      to={makeProfileLink(currentAccount)}
      label="Seu perfil"
      style={[a.flex_row, a.align_center, a.gap_sm]}>
      <UserAvatar size={36} avatar={profile?.avatar} type="user" />
      <Text
        numberOfLines={1}
        style={[a.text_md, a.font_semi_bold, t.atoms.text, {maxWidth: 140}]}>
        {profile?.displayName || currentAccount.handle}
      </Text>
    </Link>
  )
}
