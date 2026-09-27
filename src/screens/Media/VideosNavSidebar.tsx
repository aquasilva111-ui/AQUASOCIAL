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
import {atoms as a, useLayoutBreakpoints, useTheme, web} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {Divider} from '#/components/Divider'
import {Trending2_Stroke2_Corner2_Rounded as Graph} from '#/components/icons/Trending'
import {CENTER_COLUMN_OFFSET} from '#/components/Layout/const'
import {InlineLinkText, Link} from '#/components/Link'
import {Text} from '#/components/Typography'

const SECTION_LIMIT = 6

const NAV_ITEMS: {label: string; to: string}[] = [
  {label: 'Paid Subscriptions', to: '/videos'},
  {label: 'Subscriptions', to: '/videos?source=following'},
  {label: 'Channels', to: '/videos'},
  {label: 'History', to: '/videos'},
  {label: 'Playlist', to: '/videos'},
  {label: 'Watch Later', to: '/videos?source=saved'},
  {label: 'Collections', to: '/videos'},
]

const COUNTRIES = ['Worldwide', 'Brazil', 'United States', 'Portugal']

/**
 * Video-specific left sidebar for the "Aqua Videos" page (web, desktop).
 * Replaces the regular DesktopLeftNav on the Videos route.
 */
export function VideosNavSidebar() {
  const t = useTheme()
  const {centerColumnOffset} = useLayoutBreakpoints()

  return (
    <View
      role="navigation"
      style={[
        a.px_lg,
        web({
          position: 'fixed',
          top: 0,
          paddingTop: 16,
          paddingBottom: 110,
          left: '50%',
          width: 260,
          maxHeight: '100vh',
          overflowY: 'auto',
        }),
        {
          transform: [
            {
              translateX:
                -300 + (centerColumnOffset ? CENTER_COLUMN_OFFSET : 0),
            },
            {translateX: '-100%'},
            ...a.scrollbar_offset.transform,
          ],
        },
      ]}>
      <View style={[a.pb_sm]}>
        {NAV_ITEMS.map(item => (
          <Link
            key={item.label}
            to={item.to}
            label={item.label}
            style={[a.rounded_sm, a.px_sm, {paddingVertical: 7}]}>
            {({hovered}) => (
              <Text style={[a.text_md, t.atoms.text, hovered && a.underline]}>
                {item.label}
              </Text>
            )}
          </Link>
        ))}
        <View style={[a.px_sm, a.pt_sm]}>
          <Link
            to="https://aquaapp.systems/donate"
            label="Donate to AQUA"
            style={{alignSelf: 'flex-start'}}>
            {({hovered}) => (
              <View
                style={[
                  a.rounded_full,
                  a.px_lg,
                  a.py_sm,
                  t.atoms.bg,
                  {backgroundColor: '#0031d6'},
                  hovered && {opacity: 0.9},
                ]}>
                <Text style={[a.text_sm, a.font_bold, {color: '#fff'}]}>
                  Donate
                </Text>
              </View>
            )}
          </Link>
        </View>
      </View>

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
