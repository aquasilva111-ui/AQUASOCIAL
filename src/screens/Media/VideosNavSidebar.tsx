import {useState} from 'react'
import {View} from 'react-native'
import {type AppBskyActorDefs, type AppBskyUnspeccedDefs} from '@atproto/api'

import {HELP_DESK_URL} from '#/lib/constants'
import {makeProfileLink} from '#/lib/routes/links'
import {sanitizeDisplayName} from '#/lib/strings/display-names'
import {sanitizeHandle} from '#/lib/strings/handles'
import {useSuggestedFollowsQuery} from '#/state/queries/suggested-follows'
import {useTrendingTopics} from '#/state/queries/trending/useTrendingTopics'
import {PreviewableUserAvatar} from '#/view/com/util/UserAvatar'
import {Logo} from '#/view/icons/Logo'
import {atoms as a, useBreakpoints, useTheme, web} from '#/alf'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import {Divider} from '#/components/Divider'
import {Bell_Stroke2_Corner0_Rounded as SubscriptionsIcon} from '#/components/icons/Bell'
import {Bookmark as WatchLaterIcon} from '#/components/icons/Bookmark'
import {Clock_Stroke2_Corner0_Rounded as HistoryIcon} from '#/components/icons/Clock'
import {type Props as SVGIconProps} from '#/components/icons/common'
import {Group3_Stroke2_Corner0_Rounded as ChannelsIcon} from '#/components/icons/Group'
import {ListPlus_Stroke2_Corner0_Rounded as PlaylistIcon} from '#/components/icons/ListPlus'
import {LiveVideo_Stroke2_Corner0_Rounded as LiveIcon} from '#/components/icons/LiveVideo'
import {Menu_Stroke2_Corner0_Rounded as MenuIcon} from '#/components/icons/Menu'
import {PlusLarge_Stroke2_Corner0_Rounded as PlusIcon} from '#/components/icons/Plus'
import {SquareBehindSquare4_Stroke2_Corner0_Rounded as CollectionsIcon} from '#/components/icons/SquareBehindSquare4'
import {Star_Stroke2_Corner0_Rounded as PaidIcon} from '#/components/icons/Star'
import {Trending2_Stroke2_Corner2_Rounded as Graph} from '#/components/icons/Trending'
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
  {label: 'Paid Subscriptions', to: '/videos', icon: PaidIcon},
  {
    label: 'Subscriptions',
    to: '/videos?source=following',
    icon: SubscriptionsIcon,
  },
  {label: 'Channels', to: '/videos', icon: ChannelsIcon},
  {label: 'History', to: '/videos', icon: HistoryIcon},
  {label: 'Playlist', to: '/videos', icon: PlaylistIcon},
  {label: 'Watch Later', to: '/videos?source=saved', icon: WatchLaterIcon},
  {label: 'My Videos', to: '/videos?source=created', icon: MyVideosIcon},
  {label: 'Collections', to: '/videos', icon: CollectionsIcon},
  {label: 'Live streaming', to: '/videos/golive', icon: LiveIcon},
]

const COUNTRIES = ['Worldwide', 'Brazil', 'United States', 'Portugal']

/**
 * Video-specific left sidebar for the "Aqua Views" page (web, desktop).
 * Rendered in-flow as the left column of the Videos screen layout.
 * Collapsible: expanded shows the Aqua Views brand + labels, collapsed
 * shrinks to an icon rail (Streamplace-style).
 */
export function VideosNavSidebar() {
  const t = useTheme()
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
          transition: 'width 150ms ease',
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
          <ButtonIcon icon={MenuIcon} />
        </Button>
        {!collapsed && (
          <>
            <Logo width={22} />
            <Text style={[a.text_md, a.font_bold, t.atoms.text]}>
              Aqua Views
            </Text>
          </>
        )}
      </View>

      <View style={[hPad]}>
        <View style={[a.pb_sm]}>
          {NAV_ITEMS.map(item => (
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
                  {!collapsed && (
                    <Text
                      numberOfLines={1}
                      style={[a.text_md, t.atoms.text, hovered && a.underline]}>
                      {item.label}
                    </Text>
                  )}
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
                  size="small"
                  variant="solid"
                  color="primary"
                  shape={collapsed ? 'round' : 'default'}
                  style={[a.rounded_full, !collapsed && a.px_lg]}
                  {...props}>
                  <ButtonIcon icon={PlusIcon} />
                  {!collapsed && <ButtonText>Create</ButtonText>}
                </Button>
              )}
            </CreateMenu>
          </View>
        </View>

        {!collapsed && (
          <>
            <Divider />
            <TrendingChannels />
            <Divider />
            <TrendingVideos />

            <Text style={[a.leading_snug, a.pt_md, t.atoms.text_contrast_low]}>
              <InlineLinkText
                to="https://bsky.social/about/support/privacy-policy"
                label="Privacy">
                Privacy
              </InlineLinkText>
              {' · '}
              <InlineLinkText
                to="https://bsky.social/about/support/tos"
                label="Terms">
                Terms
              </InlineLinkText>
              {' · '}
              <InlineLinkText label="Help" to={HELP_DESK_URL}>
                Help
              </InlineLinkText>
            </Text>
          </>
        )}
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
        label={`Country: ${COUNTRIES[country]}`}
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
      <SectionHeader title="Trending Channels" />
      <View style={[a.gap_sm]}>
        {profiles.map(profile => (
          <Link
            key={profile.did}
            to={makeProfileLink(profile)}
            label={`View ${profile.handle}`}
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
      <SectionHeader title="Trending videos" />
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
