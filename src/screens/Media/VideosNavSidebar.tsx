import {useMemo, useState} from 'react'
import {View} from 'react-native'
import {type AppBskyActorDefs, type AppBskyUnspeccedDefs} from '@atproto/api'

import {HELP_DESK_URL} from '#/lib/constants'
import {makeProfileLink} from '#/lib/routes/links'
import {sanitizeDisplayName} from '#/lib/strings/display-names'
import {sanitizeHandle} from '#/lib/strings/handles'
import {channelPath} from '#/lib/view-channel/model'
import {useSuggestedFollowsQuery} from '#/state/queries/suggested-follows'
import {useTrendingTopics} from '#/state/queries/trending/useTrendingTopics'
import {useSession} from '#/state/session'
import {PreviewableUserAvatar} from '#/view/com/util/UserAvatar'
import {Logo} from '#/view/icons/Logo'
import {atoms as a, useBreakpoints, useTheme, web} from '#/alf'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import {Divider} from '#/components/Divider'
import {Bell_Stroke2_Corner0_Rounded as SubscriptionsIcon} from '#/components/icons/Bell'
import {Bookmark as WatchLaterIcon} from '#/components/icons/Bookmark'
import {Clock_Stroke2_Corner0_Rounded as HistoryIcon} from '#/components/icons/Clock'
import {type Props as SVGIconProps} from '#/components/icons/common'
import {DotGrid_Stroke2_Corner0_Rounded as GridIcon} from '#/components/icons/DotGrid'
import {EditBig_Stroke2_Corner0_Rounded as EditIcon} from '#/components/icons/EditBig'
import {Group3_Stroke2_Corner0_Rounded as ChannelsIcon} from '#/components/icons/Group'
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
const EXPANDED_WIDTH = 250
const COLLAPSED_WIDTH = 76

const NAV_ITEMS: {
  label: string
  to: string
  icon: React.ComponentType<SVGIconProps>
}[] = [
  {label: 'Assinaturas pagas', to: '/videos/paid', icon: PaidIcon},
  {
    label: 'Inscrições',
    to: '/videos/subscriptions',
    icon: SubscriptionsIcon,
  },
  {label: 'Canais', to: '/videos/channels', icon: ChannelsIcon},
  {label: 'Histórico', to: '/videos/history', icon: HistoryIcon},
  {label: 'Playlist', to: '/videos/playlists', icon: PlaylistIcon},
  {
    label: 'Assistir mais tarde',
    to: '/videos/watch-later',
    icon: WatchLaterIcon,
  },
  {label: 'Meus vídeos', to: '/videos/mine', icon: MyVideosIcon},
  {label: 'Coleções', to: '/videos/collections', icon: CollectionsIcon},
  {label: 'Transmissões ao vivo', to: '/videos/live', icon: LiveIcon},
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
 * Video-specific left sidebar for the "Aqua Views" page (web, desktop).
 * Rendered in-flow as the left column of the Videos screen layout.
 * Collapsible: expanded shows the Aqua Views brand + labels, collapsed
 * shrinks to an icon rail (Streamplace-style) with an animated transition.
 */
export function VideosNavSidebar() {
  const t = useTheme()
  const {currentAccount} = useSession()
  // The channel is the signed-in AQUA profile's; no separate account.
  const navItems = useMemo(
    () =>
      currentAccount
        ? [
            {
              label: 'Seu canal',
              to: channelPath(currentAccount.handle),
              icon: MyChannelIcon,
            },
            {label: 'View Studio', to: '/videos/studio', icon: StudioIcon},
            ...NAV_ITEMS,
          ]
        : NAV_ITEMS,
    [currentAccount],
  )
  const {gtMobile} = useBreakpoints()
  const [collapsed, setCollapsed] = useState(!gtMobile)
  const hPad = collapsed ? a.px_xs : a.px_lg

  return (
    <View
      role="navigation"
      style={[
        web({
          position: 'sticky',
          top: 0,
          alignSelf: 'flex-start',
          width: collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH,
          flexShrink: 0,
          paddingTop: 12,
          paddingBottom: 110,
          maxHeight: '100vh',
          overflowY: 'auto',
          overflowX: 'hidden',
          transition: `width 240ms ${EASE}`,
        }),
      ]}>
      <View
        style={[
          hPad,
          a.pb_md,
          a.flex_row,
          a.align_center,
          a.gap_sm,
          collapsed && a.justify_center,
        ]}>
        <Button
          label={collapsed ? 'Expandir menu' : 'Recolher menu'}
          size="small"
          variant="ghost"
          color="secondary"
          shape="round"
          onPress={() => setCollapsed(v => !v)}>
          <ButtonIcon icon={GridIcon} />
        </Button>
        <Link
          to="/"
          label="Ir para o início do Aqua"
          style={[a.flex_row, a.align_center, a.gap_sm]}>
          <View
            style={[
              {overflow: 'hidden'},
              web({
                maxWidth: collapsed ? 0 : 200,
                opacity: collapsed ? 0 : 1,
                transition: `max-width 220ms ${EASE}, opacity 150ms ease`,
              }),
              a.flex_row,
              a.align_center,
              a.gap_sm,
            ]}>
            <Logo width={22} />
            <Text
              numberOfLines={1}
              style={[
                a.text_md,
                a.font_bold,
                t.atoms.text,
                web({whiteSpace: 'nowrap'}),
              ]}>
              Aqua Views
            </Text>
          </View>
        </Link>
      </View>

      <View style={[hPad]}>
        <View style={[a.pb_sm]}>
          {navItems.map(item => (
            <Link
              key={item.label}
              to={item.to}
              label={item.label}
              style={[
                a.rounded_sm,
                a.flex_row,
                a.align_center,
                a.gap_md,
                collapsed ? a.justify_center : a.px_sm,
                {paddingVertical: 7},
              ]}>
              {({hovered}) => (
                <>
                  <item.icon
                    size="md"
                    style={[
                      hovered ? t.atoms.text : t.atoms.text_contrast_medium,
                    ]}
                  />
                  <AnimatedLabel
                    collapsed={collapsed}
                    width={180}
                    style={[a.text_md, t.atoms.text, hovered && a.underline]}>
                    {item.label}
                  </AnimatedLabel>
                </>
              )}
            </Link>
          ))}
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
              <InlineLinkText
                to="https://bsky.social/about/support/privacy-policy"
                label="Privacidade">
                Privacidade
              </InlineLinkText>
              {' · '}
              <InlineLinkText
                to="https://bsky.social/about/support/tos"
                label="Termos">
                Termos
              </InlineLinkText>
              {' · '}
              <InlineLinkText label="Ajuda" to={HELP_DESK_URL}>
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
              to={`/videos?source=search&q=${encodeURIComponent(name)}`}
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
