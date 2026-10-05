import {useState} from 'react'
import {ScrollView, View} from 'react-native'
import {useInfiniteQuery} from '@tanstack/react-query'

import {adultApi, type AdultNetworkPost} from '#/lib/adult/api'
import {useAgent} from '#/state/session'
import {atoms as a, useTheme} from '#/alf'
import {
  AdultComposer,
  AdultNetworkPostCard,
  networkKey,
} from '#/components/adult/AdultNetwork'
import {Button, ButtonText} from '#/components/Button'
import {Text} from '#/components/Typography'
import {AdultShell} from './AdultShell'
import {AdultApiNotice} from './AdultViews'

type Tab = 'following' | 'discover'

const TABS: {id: Tab; label: string}[] = [
  {id: 'following', label: 'Seguindo'},
  {id: 'discover', label: 'Descobrir'},
]

/**
 * /adult/feed — the +18 network's home. Posts come from the +18 backend only
 * (its own posts, follows and reposts); nothing is read from the public AQUA
 * graph. Following = people you follow, you and their reposts. Discover = all
 * recent +18 posts minus what you muted or blocked.
 */
export function AdultFeedScreen() {
  return (
    <AdultShell title="Feed +18" testID="adultFeedScreen">
      <AdultFeedInner />
    </AdultShell>
  )
}

function AdultFeedInner() {
  const t = useTheme()
  const agent = useAgent()
  const [tab, setTab] = useState<Tab>('following')

  const feed = useInfiniteQuery({
    queryKey: networkKey('feed', tab, agent.session?.did),
    initialPageParam: undefined as string | undefined,
    queryFn: ({pageParam}) =>
      adultApi<{posts: AdultNetworkPost[]; next: string | null}>(
        agent,
        `/adult/feed?tab=${tab}${
          pageParam ? `&before=${encodeURIComponent(pageParam)}` : ''
        }`,
      ),
    getNextPageParam: last => last.next ?? undefined,
  })
  const posts = feed.data?.pages.flatMap(p => p.posts) ?? []

  return (
    <ScrollView contentContainerStyle={{paddingBottom: 120}}>
      <AdultComposer
        placeholder="O que você quer compartilhar?"
        submitLabel="Publicar"
        maxLength={3000}
        path="/adult/posts"
        field="body"
        invalidate={[networkKey('feed')]}
      />
      <View style={[a.flex_row, a.gap_xs, a.p_md]}>
        {TABS.map(item => (
          <Button
            key={item.id}
            label={item.label}
            size="small"
            variant={tab === item.id ? 'solid' : 'ghost'}
            color="secondary"
            onPress={() => setTab(item.id)}>
            <ButtonText>{item.label}</ButtonText>
          </Button>
        ))}
      </View>
      {feed.error ? (
        <AdultApiNotice error={feed.error} onRetry={() => feed.refetch()} />
      ) : feed.isLoading ? (
        <Text style={[a.p_lg, t.atoms.text_contrast_medium]}>Carregando…</Text>
      ) : posts.length ? (
        <>
          {posts.map(post => (
            <AdultNetworkPostCard
              key={`${post.id}:${post.repostedBy?.did}`}
              post={post}
            />
          ))}
          {feed.hasNextPage && (
            <View style={[a.align_center, a.py_md]}>
              <Button
                label="Carregar mais"
                size="small"
                disabled={feed.isFetchingNextPage}
                onPress={() => feed.fetchNextPage()}>
                <ButtonText>
                  {feed.isFetchingNextPage ? 'Carregando…' : 'Carregar mais'}
                </ButtonText>
              </Button>
            </View>
          )}
        </>
      ) : (
        <View style={[a.align_center, a.gap_sm, a.px_xl, {paddingTop: 48}]}>
          <Text style={[a.text_lg, a.font_bold, a.text_center]}>
            {tab === 'following'
              ? 'Seu feed está vazio'
              : 'Ainda não há posts +18'}
          </Text>
          <Text
            style={[a.text_md, a.text_center, t.atoms.text_contrast_medium]}>
            {tab === 'following'
              ? 'Publique algo ou siga pessoas em Descobrir.'
              : 'Seja a primeira pessoa a publicar.'}
          </Text>
        </View>
      )}
    </ScrollView>
  )
}
