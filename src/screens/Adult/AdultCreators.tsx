import {useMemo} from 'react'
import {View} from 'react-native'
import {msg} from '@lingui/macro'
import {useLingui} from '@lingui/react'
import {useIsFocused} from '@react-navigation/native'

import {isAdultContent} from '#/lib/adult/content'
import {DISCOVER_FEED_URI} from '#/lib/constants'
import {useAdultContext} from '#/state/adult/context'
import {useModerationOpts} from '#/state/preferences/moderation-opts'
import {usePostFeedQuery} from '#/state/queries/post-feed'
import {List} from '#/view/com/util/List'
import {PreviewableUserAvatar} from '#/view/com/util/UserAvatar'
import {atoms as a, useTheme} from '#/alf'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'
import {AdultShell} from './AdultShell'

/**
 * /adult/creators — deterministic creator discovery: unique authors of
 * adult-labeled posts currently in the discover source. No social-graph
 * signals, no social recommendation data.
 */
export function AdultCreatorsScreen() {
  const {_} = useLingui()
  return (
    <AdultShell title={_(msg`Creators`)} testID="adultCreatorsScreen">
      <AdultCreatorsInner />
    </AdultShell>
  )
}

function AdultCreatorsInner() {
  const {_} = useLingui()
  const t = useTheme()
  const focused = useIsFocused()
  const ctx = useAdultContext()
  const moderationOpts = useModerationOpts()
  const feed = usePostFeedQuery(`feedgen|${DISCOVER_FEED_URI}`, undefined, {
    enabled: focused && ctx.adultAccessEnabled,
  })

  const creators = useMemo(() => {
    if (!moderationOpts) return []
    const seen = new Set<string>()
    const result = []
    for (const page of feed.data?.pages ?? []) {
      for (const slice of page.slices) {
        for (const item of slice.items) {
          if (!isAdultContent(item)) continue
          const author = item.post.author
          if (seen.has(author.did)) continue
          seen.add(author.did)
          result.push(author)
        }
      }
    }
    return result
  }, [moderationOpts, feed.data])

  return (
    <List
      data={creators}
      keyExtractor={creator => creator.did}
      contentContainerStyle={{paddingBottom: 120}}
      renderItem={({item: creator}) => (
        <Link
          to={`/adult/creator/${creator.handle}`}
          label={creator.handle}
          style={[
            a.flex_row,
            a.align_center,
            a.gap_md,
            a.p_md,
            a.border_b,
            t.atoms.border_contrast_low,
          ]}>
          <PreviewableUserAvatar size={44} profile={creator} />
          <View style={[a.flex_1, {minWidth: 0}]}>
            <Text style={[a.text_md, a.font_bold]} numberOfLines={1}>
              {creator.displayName || `@${creator.handle}`}
            </Text>
            <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
              @{creator.handle}
            </Text>
          </View>
        </Link>
      )}
      ListEmptyComponent={
        <View style={[a.align_center, a.px_xl, {paddingTop: 96}]}>
          <Text
            style={[a.text_md, a.text_center, t.atoms.text_contrast_medium]}>
            {feed.isFetching
              ? _(msg`Carregando…`)
              : _(msg`Nenhum creator +18 descoberto ainda.`)}
          </Text>
        </View>
      }
    />
  )
}
