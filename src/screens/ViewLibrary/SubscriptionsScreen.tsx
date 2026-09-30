import {useMemo, useState} from 'react'
import {ScrollView, View} from 'react-native'

import {isMediaPost} from '#/lib/media/experiences'
import {sanitizeDisplayName} from '#/lib/strings/display-names'
import {sanitizeHandle} from '#/lib/strings/handles'
import {channelPath} from '#/lib/view-channel/model'
import {matchesRecency, type RecencyFilter} from '#/lib/view-library/model'
import {usePostFeedQuery} from '#/state/queries/post-feed'
import {useProfileFollowsQuery} from '#/state/queries/profile-follows'
import {useSession} from '#/state/session'
import {TimeElapsed} from '#/view/com/util/TimeElapsed'
import {UserAvatar} from '#/view/com/util/UserAvatar'
import {toVideoRef} from '#/screens/ViewWatch/UpNext'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'
import {Empty, LibraryPage, VideoCard} from './shared'

const FILTERS: {key: RecencyFilter; label: string}[] = [
  {key: 'all', label: 'Tudo'},
  {key: 'today', label: 'Hoje'},
  {key: 'week', label: 'Esta semana'},
]

export function ViewSubscriptionsScreen() {
  const t = useTheme()
  const {currentAccount} = useSession()
  const [filter, setFilter] = useState<RecencyFilter>('all')
  const follows = useProfileFollowsQuery(currentAccount?.did, {limit: 30})
  const feed = usePostFeedQuery('following')
  const channels = useMemo(
    () => follows.data?.pages.flatMap(p => p.follows) ?? [],
    [follows.data],
  )
  const videos = useMemo(() => {
    const seen = new Set<string>()
    const now = Date.now()
    return (
      feed.data?.pages.flatMap(p => p.slices.flatMap(s => s.items)) ?? []
    ).filter(item => {
      if (seen.has(item.uri) || !isMediaPost(item, 'video')) return false
      seen.add(item.uri)
      return matchesRecency(item.post.indexedAt, filter, now)
    })
  }, [feed.data, filter])

  return (
    <LibraryPage
      testID="viewSubscriptionsScreen"
      title="Inscrições"
      subtitle="Novidades dos canais que você segue."
      actions={
        <Link to="/videos/channels" label="Gerenciar canais">
          <Text style={[a.text_sm, a.font_bold, t.atoms.text_contrast_high]}>
            Gerenciar
          </Text>
        </Link>
      }>
      {channels.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[a.gap_lg, a.pb_xs]}>
          {channels.map(p => (
            <Link
              key={p.did}
              to={channelPath(p.handle)}
              label={`Abrir canal de ${p.handle}`}
              style={[a.align_center, a.gap_xs, {width: 76}]}>
              <UserAvatar size={56} avatar={p.avatar} type="user" />
              <Text
                style={[a.text_xs, t.atoms.text_contrast_medium]}
                numberOfLines={1}>
                {sanitizeDisplayName(p.displayName || sanitizeHandle(p.handle))}
              </Text>
            </Link>
          ))}
        </ScrollView>
      )}

      <View
        accessibilityRole="tablist"
        style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
        {FILTERS.map(f => (
          <Button
            key={f.key}
            label={f.label}
            size="small"
            color={filter === f.key ? 'primary' : 'secondary'}
            accessibilityRole="tab"
            accessibilityState={{selected: filter === f.key}}
            onPress={() => setFilter(f.key)}>
            <ButtonText>{f.label}</ButtonText>
          </Button>
        ))}
      </View>

      {feed.isLoading ? (
        <Text style={[t.atoms.text_contrast_medium]}>Carregando…</Text>
      ) : !videos.length ? (
        <Empty
          title="Nenhum vídeo novo"
          body={
            filter === 'all'
              ? 'Quando quem você segue publicar vídeos, eles aparecem aqui.'
              : 'Nada nesse período. Tente "Tudo".'
          }
        />
      ) : (
        <View style={[a.flex_row, a.flex_wrap, a.gap_lg]}>
          {videos.map(item => (
            <VideoCard
              key={item.uri}
              video={toVideoRef(item.post)}
              meta={
                <TimeElapsed timestamp={item.post.indexedAt}>
                  {({timeElapsed}) => <>{timeElapsed}</>}
                </TimeElapsed>
              }
            />
          ))}
        </View>
      )}
      {feed.hasNextPage && (
        <View style={[a.flex_row]}>
          <Button
            label="Carregar mais vídeos"
            size="small"
            color="secondary"
            disabled={feed.isFetchingNextPage}
            onPress={() => feed.fetchNextPage()}>
            <ButtonText>Carregar mais</ButtonText>
          </Button>
        </View>
      )}
    </LibraryPage>
  )
}
