import {useMemo, useState} from 'react'
import {View} from 'react-native'
import {type AppBskyActorDefs, type AppBskyUnspeccedDefs} from '@atproto/api'
import {useNavigationState} from '@react-navigation/native'

import {getCurrentRoute} from '#/lib/routes/helpers'
import {makeProfileLink} from '#/lib/routes/links'
import {sanitizeDisplayName} from '#/lib/strings/display-names'
import {sanitizeHandle} from '#/lib/strings/handles'
import {channelPath} from '#/lib/view-channel/model'
import {useSuggestedFollowsQuery} from '#/state/queries/suggested-follows'
import {useTrendingTopics} from '#/state/queries/trending/useTrendingTopics'
import {useSession} from '#/state/session'
import {PreviewableUserAvatar} from '#/view/com/util/UserAvatar'
import {atoms as a, useTheme, web} from '#/alf'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import {Divider} from '#/components/Divider'
import {Bell_Stroke2_Corner0_Rounded as SubscriptionsIcon} from '#/components/icons/Bell'
import {Bookmark as WatchLaterIcon} from '#/components/icons/Bookmark'
import {Clock_Stroke2_Corner0_Rounded as HistoryIcon} from '#/components/icons/Clock'
import {type Props as SVGIconProps} from '#/components/icons/common'
import {EditBig_Stroke2_Corner0_Rounded as EditIcon} from '#/components/icons/EditBig'
import {Group3_Stroke2_Corner0_Rounded as ChannelsIcon} from '#/components/icons/Group'
import {HomeOpen_Stoke2_Corner0_Rounded as HomeIcon} from '#/components/icons/HomeOpen'
import {ListPlus_Stroke2_Corner0_Rounded as PlaylistIcon} from '#/components/icons/ListPlus'
import {LiveVideo_Stroke2_Corner0_Rounded as LiveIcon} from '#/components/icons/LiveVideo'
import {PaintRoller_Stroke2_Corner2_Rounded as StudioIcon} from '#/components/icons/PaintRoller'
import {SquareBehindSquare4_Stroke2_Corner0_Rounded as CollectionsIcon} from '#/components/icons/SquareBehindSquare4'
import {Star_Stroke2_Corner0_Rounded as PaidIcon} from '#/components/icons/Star'
import {Trending2_Stroke2_Corner2_Rounded as Graph} from '#/components/icons/Trending'
import {UserCircle_Stroke2_Corner0_Rounded as MyChannelIcon} from '#/components/icons/UserCircle'
import {VideoClip_Stroke2_Corner0_Rounded as MyVideosIcon} from '#/components/icons/VideoClip'
import {InlineLinkText, Link} from '#/components/Link'
import {Text} from '#/components/Typography'
import {CreateMenu} from './CreateMenu'

const SECTION_LIMIT = 6
const EXPANDED_WIDTH = 240
const COLLAPSED_WIDTH = 72

const NAV_ITEMS: {
  label: string
  to: string
  icon: React.ComponentType<SVGIconProps>
  route?: string
}[] = [
  {label: 'Início', to: '/views', icon: HomeIcon, route: 'Videos'},
  {
    label: 'Inscrições',
    to: '/views/subscriptions',
    icon: SubscriptionsIcon,
    route: 'ViewSubscriptions',
  },
  {
    label: 'Assinaturas pagas',
    to: '/views/paid',
    icon: PaidIcon,
    route: 'ViewPaid',
  },
  {label: 'Canais', to: '/views/channels', icon: ChannelsIcon},
  {label: 'Histórico', to: '/views/history', icon: HistoryIcon},
  {label: 'Playlist', to: '/views/playlists', icon: PlaylistIcon},
  {
    label: 'Assistir mais tarde',
    to: '/views/watch-later',
    icon: WatchLaterIcon,
  },
  {label: 'Meus vídeos', to: '/views/mine', icon: MyVideosIcon},
  {label: 'Coleções', to: '/views/collections', icon: CollectionsIcon},
  {label: 'Transmissões ao vivo', to: '/views/live', icon: LiveIcon},
]

const COUNTRIES = ['Mundial', 'Brasil', 'Estados Unidos', 'Portugal']

const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)'

/**
 * Fades and width-collapses a label in sync with the sidebar's own
 * width transition, instead of hard-unmounting it on collapse.
 */
function AnimatedLabel({
  collapsed,
  width,
  children,
  style,
}: {
  collapsed: boolean
  width: number
  children: React.ReactNode
  style?: Parameters<typeof Text>[0]['style']
}) {
  return (
    <View
      style={[
        {overflow: 'hidden'},
        web({
          maxWidth: collapsed ? 0 : width,
          opacity: collapsed ? 0 : 1,
          transition: `max-width 220ms ${EASE}, opacity 150ms ease`,
        }),
      ]}>
      <Text numberOfLines={1} style={[web({whiteSpace: 'nowrap'}), style]}>
        {children}
      </Text>
    </View>
  )
}

/**
 * Video sidebar for Aqua Views. The header owns the menu button and the
 * logo (which links to /views). Below 900px this is a drawer.
 */
export function VideosNavSidebar({
  collapsed,
  drawer = false,
  open = true,
  onNavigate,
}: {
  collapsed: boolean
  drawer?: boolean
  open?: boolean
  onNavigate?: () => void
}) {
  const t = useTheme()
  const {currentAccount} = useSession()
  const routeName = useNavigationState(state => getCurrentRoute(state).name)
  // The channel is the signed-in AQUA profile's; no separate account.
  const navItems: (typeof NAV_ITEMS)[number][] = useMemo(() => {
    const [home, ...rest] = NAV_ITEMS
    return currentAccount
      ? [
          home,
          {
            label: 'Seu canal',
            to: channelPath(currentAccount.handle),
            icon: MyChannelIcon,
          },
          {label: 'View Studio', to: '/views/studio', icon: StudioIcon},
          ...rest,
        ]
      : NAV_ITEMS
  }, [currentAccount])
  const showLabels = drawer || !collapsed
  const hPad = showLabels ? a.px_lg : a.px_xs

  return (
    <View
      role="navigation"
      aria-label="Navegação principal"
      style={[
        t.atoms.bg,
        web({
          position: 'fixed',
          top: 56,
          bottom: 0,
          left: 0,
          width: drawer
            ? EXPANDED_WIDTH
            : collapsed
              ? COLLAPSED_WIDTH
              : EXPANDED_WIDTH,
          flexShrink: 0,
          paddingTop: 12,
          paddingBottom: 24,
          overflowY: 'auto',
          overflowX: 'hidden',
          zIndex: 40,
          transform: drawer && !open ? 'translateX(-100%)' : 'none',
          transition: `width 200ms ${EASE}, transform 200ms ${EASE}`,
          boxShadow: drawer && open ? '0 4px 18px rgba(0,0,0,0.12)' : 'none',
          pointerEvents: drawer && !open ? 'none' : 'auto',
        }),
      ]}>
      <View style={[hPad]}>
        <View style={[a.pb_sm]}>
          {navItems.map(item => {
            const selected = item.route === routeName
            return (
              <Link
                key={item.label}
                to={item.to}
                label={item.label}
                onPress={onNavigate}
                style={[
                  a.rounded_md,
                  a.flex_row,
                  a.align_center,
                  a.gap_md,
                  showLabels ? a.px_sm : a.justify_center,
                  {paddingVertical: 10},
                  selected && t.atoms.bg_contrast_25,
                ]}>
                {({hovered}) => (
                  <>
                    <item.icon
                      size="md"
                      style={[
                        hovered || selected
                          ? t.atoms.text
                          : t.atoms.text_contrast_medium,
                      ]}
                    />
                    <AnimatedLabel
                      collapsed={!showLabels}
                      width={180}
                      style={[
                        a.text_md,
                        t.atoms.text,
                        (hovered || selected) && a.font_bold,
                      ]}>
                      {item.label}
                    </AnimatedLabel>
                  </>
                )}
              </Link>
            )
          })}
          <View
            style={[
              a.pt_sm,
              collapsed ? a.align_center : {alignItems: 'flex-start'},
            ]}>
            <CreateMenu>
              {({props}) => (
                <Button
                  label={props.accessibilityLabel}
                  size="large"
                  variant="solid"
                  color="primary"
                  shape={collapsed ? 'round' : 'default'}
                  style={[
                    a.rounded_full,
                    !collapsed && [a.px_lg, {paddingVertical: 12}],
                    web({transition: `all 220ms ${EASE}`}),
                  ]}
                  {...props}>
                  <ButtonIcon icon={EditIcon} />
                  <AnimatedLabel collapsed={collapsed} width={100}>
                    <ButtonText style={[a.font_bold]}>Criar</ButtonText>
                  </AnimatedLabel>
                </Button>
              )}
            </CreateMenu>
          </View>
        </View>

        <View
          style={[
            {overflow: 'hidden'},
            web({
              maxHeight: collapsed ? 0 : 900,
              opacity: collapsed ? 0 : 1,
              transition: `max-height 280ms ${EASE}, opacity 200ms ease`,
            }),
          ]}>
          <>
            <Divider />
            <TrendingChannels />
            <Divider />
            <TrendingVideos />

            <Text style={[a.leading_snug, a.pt_md, t.atoms.text_contrast_low]}>
              <InlineLinkText to="/support/privacy" label="Privacidade">
                Privacidade
              </InlineLinkText>
              {' · '}
              <InlineLinkText to="/support/tos" label="Termos">
                Termos
              </InlineLinkText>
              {' · '}
              <InlineLinkText label="Ajuda" to="/support">
                Ajuda
              </InlineLinkText>
            </Text>
          </>
        </View>
      </View>
    </View>
  )
}

function SectionHeader({title}: {title: string}) {
  const t = useTheme()
  const [country, setCountry] = useState(0)
  return (
    <View style={[a.flex_row, a.align_center, a.gap_xs, a.pt_md, a.pb_sm]}>
      <Graph size="sm" style={t.atoms.text_contrast_medium} />
      <Text
        style={[
          a.flex_1,
          a.text_sm,
          a.font_semi_bold,
          t.atoms.text_contrast_medium,
        ]}>
        {title}
      </Text>
      <Button
        label={`País: ${COUNTRIES[country]}`}
        size="tiny"
        variant="ghost"
        color="secondary"
        onPress={() => setCountry(c => (c + 1) % COUNTRIES.length)}>
        <ButtonText>{`${COUNTRIES[country]} ⌄`}</ButtonText>
      </Button>
    </View>
  )
}

function TrendingChannels() {
  const t = useTheme()
  const {data, isLoading, isError} = useSuggestedFollowsQuery({limit: 8})
  const profiles =
    data?.pages
      .flatMap(page => page.actors)
      .filter(
        (actor): actor is AppBskyActorDefs.ProfileView =>
          !!actor && typeof actor.did === 'string',
      )
      .slice(0, SECTION_LIMIT) ?? []

  if (isError || (!isLoading && !profiles.length)) return null

  return (
    <View>
      <SectionHeader title="Canais em alta" />
      <View style={[a.gap_sm]}>
        {profiles.map(profile => (
          <Link
            key={profile.did}
            to={makeProfileLink(profile)}
            label={`Ver ${profile.handle}`}
            style={[a.flex_row, a.align_center, a.gap_sm, a.rounded_sm]}>
            {({hovered}) => (
              <>
                <PreviewableUserAvatar size={24} profile={profile} />
                <View style={[a.flex_1, {minWidth: 0}]}>
                  <Text
                    numberOfLines={1}
                    style={[
                      a.text_sm,
                      a.font_semi_bold,
                      t.atoms.text,
                      hovered && a.underline,
                    ]}>
                    {sanitizeDisplayName(
                      profile.displayName || sanitizeHandle(profile.handle),
                    )}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[a.text_xs, t.atoms.text_contrast_medium]}>
                    {sanitizeHandle(profile.handle, '@')}
                  </Text>
                </View>
              </>
            )}
          </Link>
        ))}
      </View>
    </View>
  )
}

function TrendingVideos() {
  const t = useTheme()
  const {data, isLoading, isError} = useTrendingTopics()
  const topics = (data?.topics ?? []).slice(0, SECTION_LIMIT)

  if (isError || (!isLoading && !topics.length)) return null

  return (
    <View>
      <SectionHeader title="Vídeos em alta" />
      <View style={[a.gap_xs]}>
        {topics.map((topic: AppBskyUnspeccedDefs.TrendingTopic) => {
          const name = topic.displayName ?? topic.link
          return (
            <Link
              key={topic.link}
              to={`/views?source=search&q=${encodeURIComponent(name)}`}
              label={name}
              style={[a.rounded_sm, a.px_sm, {paddingVertical: 5}]}>
              {({hovered}) => (
                <Text
                  numberOfLines={1}
                  style={[
                    a.text_sm,
                    t.atoms.text_contrast_medium,
                    hovered && [a.underline, t.atoms.text],
                  ]}>
                  {name}
                </Text>
              )}
            </Link>
          )
        })}
      </View>
    </View>
  )
}
