import {useState} from 'react'
import {View} from 'react-native'
import {moderatePost, moderateProfile} from '@atproto/api'
import {useQuery} from '@tanstack/react-query'

import {type CreatorProfileSummary, type Did} from '#/lib/ecosystem/types'
import {getPostMedia} from '#/lib/media/experiences'
import {useModerationOpts} from '#/state/preferences/moderation-opts'
import {useAgent, useSession} from '#/state/session'
import {atoms as a} from '#/alf'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'
import {
  Action,
  Card,
  Field,
  NoticeText,
  Page,
  ResourceLinks,
  Status,
} from './shared'

export function CreatorsScreen() {
  const agent = useAgent()
  const {currentAccount} = useSession()
  const moderation = useModerationOpts()
  const [input, setInput] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<'all' | 'video' | 'image'>('all')
  const query = useQuery({
    queryKey: ['aqua-creators', currentAccount?.did, search],
    enabled: search.length >= 2 && !!moderation,
    retry: false,
    queryFn: async () => {
      const {data} = await agent.app.bsky.actor.searchActors({
        q: search,
        limit: 8,
      })
      const candidates = await Promise.all(
        data.actors.map(async actor => {
          const feed = await agent.getAuthorFeed({
            actor: actor.did,
            limit: 20,
            filter: 'posts_no_replies',
          })
          return {
            actor,
            posts: feed.data.feed
              .filter(item => item.post.author.did === actor.did)
              .map(item => item.post),
          }
        }),
      )
      return candidates
    },
  })
  const creators = moderation
    ? (query.data ?? [])
        .filter(c => {
          const decision = moderateProfile(c.actor, moderation)
          return (
            !decision.ui('profileList').filter &&
            !decision.ui('profileList').blur
          )
        })
        .map(c => {
          const works = c.posts
            .filter(post => {
              const d = moderatePost(post, moderation)
              return (
                !d.ui('contentList').filter &&
                !d.ui('contentList').blur &&
                !d.ui('contentMedia').filter &&
                !d.ui('contentMedia').blur
              )
            })
            .flatMap(post => {
              const media = getPostMedia(post)
              if (media.type !== 'images' && media.type !== 'video') return []
              const type =
                media.type === 'images'
                  ? ('image' as const)
                  : ('video' as const)
              return [
                {
                  type,
                  uri: post.uri,
                  title: type === 'image' ? 'Publicação visual' : 'Vídeo',
                },
              ]
            })
          const summary: CreatorProfileSummary = {
            did: c.actor.did as Did,
            contentTypes: [...new Set(works.map(w => w.type))],
            recentWorks: works,
            activity: works.length,
            liveStatus: 'unknown',
            storeStatus: 'unknown',
          }
          return {actor: c.actor, summary}
        })
        .filter(
          c =>
            c.summary.activity > 0 &&
            (category === 'all' || c.summary.contentTypes.includes(category)),
        )
    : []
  return (
    <Page title="Creators">
      <NoticeText>
        Perfis AQUA com produção criativa observada. Cada resultado usa a
        identidade e as publicações reais do AT Protocol.
      </NoticeText>
      <ResourceLinks />
      <Field label="Nome ou handle" value={input} onChange={setInput} />
      <Action
        label="Buscar creators"
        disabled={input.trim().length < 2 || !moderation || query.isFetching}
        onPress={() => setSearch(input.trim())}
      />
      <View style={[a.flex_row, a.gap_md]}>
        {(['all', 'video', 'image'] as const).map(type => (
          <Action
            key={type}
            label={
              type === 'all' ? 'Todos' : type === 'video' ? 'Vídeo' : 'Visual'
            }
            onPress={() => setCategory(type)}
          />
        ))}
      </View>
      <Status
        pending={query.isFetching}
        error={query.error}
        onRetry={() => query.refetch()}
      />
      {query.data && !creators.length && (
        <NoticeText>
          Nenhuma produção criativa encontrada nesta amostra.
        </NoticeText>
      )}
      {creators.map(({actor, summary}) => (
        <Card key={actor.did}>
          <Link
            to={`/profile/${encodeURIComponent(actor.did)}`}
            label={`Perfil de ${actor.handle}`}>
            <Text style={[a.text_xl, a.font_bold]}>
              {actor.displayName || actor.handle}
            </Text>
            <Text>@{actor.handle}</Text>
          </Link>
          <NoticeText>
            {summary.contentTypes.join(', ')} · {summary.activity} obras
            observadas
          </NoticeText>
          {summary.recentWorks.slice(0, 3).map(work => (
            <Link
              key={work.uri}
              to={`/profile/${encodeURIComponent(actor.did)}/post/${encodeURIComponent(work.uri.split('/').pop() ?? '')}`}
              label={work.title}>
              <Text>{work.title}</Text>
            </Link>
          ))}
        </Card>
      ))}
      <NoticeText>
        Amostra: até 8 perfis e 20 posts por perfil. Obras de Reads, Music,
        Store, Portals e Apps, filtros geográficos e Charts ainda precisam do
        índice transversal. Ausência de métricas não é interpretada como zero.
      </NoticeText>
    </Page>
  )
}
