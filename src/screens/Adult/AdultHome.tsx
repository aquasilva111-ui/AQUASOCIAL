import {useCallback, useEffect, useMemo, useRef} from 'react'
import {useSyncExternalStore} from 'react'
import {View} from 'react-native'
import {useIsFocused} from '@react-navigation/native'

import {toAdultPosts} from '#/lib/adult/content'
import {DISCOVER_FEED_URI} from '#/lib/constants'
import {useAdultContext} from '#/state/adult/context'
import {
  getAdultRelationshipsSnapshot,
  isCreatorBlocked,
  isCreatorMuted,
  subscribeAdultRelationships,
} from '#/state/adult/relationships'
import {useModerationOpts} from '#/state/preferences/moderation-opts'
import {usePostFeedQuery} from '#/state/queries/post-feed'
import {List} from '#/view/com/util/List'
import {atoms as a, useTheme} from '#/alf'
import {AdultPostCard} from '#/components/adult/AdultPostCard'
import {Button, ButtonText} from '#/components/Button'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'
import {AdultShell} from './AdultShell'

type AdultSection = {
  to: string
  title: string
  description: string
}

/** Functional entry point of AQUA +18: real feed preview plus shortcuts. */
export function AdultHomeScreen() {
  return (
    <AdultShell title="AQUA +18" testID="adultHomeScreen">
      <AdultHomeInner />
    </AdultShell>
  )
}

function AdultHomeInner() {
  const t = useTheme()
  const focused = useIsFocused()
  const ctx = useAdultContext()
  const moderationOpts = useModerationOpts()
  useSyncExternalStore(
    subscribeAdultRelationships,
    getAdultRelationshipsSnapshot,
  )

  const sections: AdultSection[] = [
    {
      to: '/adult/feed',
      title: 'Feed +18',
      description: 'Publicações de criadores adultos',
    },
    {
      to: '/adult/creators',
      title: 'Creators',
      description: 'Criadores e assinaturas',
    },
    {
      to: '/adult/views',
      title: 'Views +18',
      description: 'Vídeos do catálogo adulto',
    },
    {
      to: '/adult/live',
      title: 'Live +18',
      description: 'Transmissões ao vivo',
    },
    {
      to: '/adult/studios',
      title: 'Studios +18',
      description: 'Estúdios, séries e filmes',
    },
    {
      to: '/adult/drops',
      title: 'Drops +18',
      description: 'Clipes curtos de criadores verificados',
    },
    {
      to: '/adult/visionboard',
      title: 'Visionboard +18',
      description: 'Boards privados de imagens',
    },
    {
      to: '/adult/reads',
      title: 'Reads +18',
      description: 'Histórias em partes',
    },
    {
      to: '/adult/library',
      title: 'Minha biblioteca',
      description: 'Conteúdo adquirido e salvo',
    },
    {
      to: '/adult/messages',
      title: 'Mensagens',
      description: 'Conversas do contexto +18',
    },
    {
      to: '/adult/settings',
      title: 'Configurações +18',
      description: 'Privacidade e preferências adultas',
    },
  ]

  const feed = usePostFeedQuery(`feedgen|${DISCOVER_FEED_URI}`, undefined, {
    enabled: focused && ctx.adultAccessEnabled,
  })

  const did = ctx.identity?.did
  const posts = useMemo(() => {
    if (!moderationOpts || !did) return []
    const candidates =
      feed.data?.pages.flatMap(page =>
        page.slices.flatMap(slice => slice.items),
      ) ?? []
    return toAdultPosts(candidates)
      .filter(
        post =>
          !isCreatorBlocked(did, post.creatorId) &&
          !isCreatorMuted(did, post.creatorId),
      )
      .slice(0, 6)
  }, [moderationOpts, did, feed.data])

  const {hasNextPage, isFetching, isError, fetchNextPage} = feed
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetching && !isError) fetchNextPage()
  }, [hasNextPage, isFetching, isError, fetchNextPage])

  const emptyScans = useRef(0)
  useEffect(() => {
    if (
      !posts.length &&
      hasNextPage &&
      !isFetching &&
      !isError &&
      emptyScans.current < 3
    ) {
      emptyScans.current++
      loadMore()
    }
  }, [posts.length, hasNextPage, isFetching, isError, loadMore])

  return (
    <List
      data={posts}
      keyExtractor={post => post.id}
      renderItem={({item}) => <AdultPostCard post={item} />}
      contentContainerStyle={{paddingBottom: 120}}
      ListHeaderComponent={
        <View style={[a.p_md, a.gap_md]}>
          <Text style={[a.px_xs, a.pb_sm, t.atoms.text_contrast_medium]}>
            {ctx.identity
              ? `Entrou como @${ctx.identity.handle}. Atividade isolada do AQUA Social.`
              : ''}
          </Text>
          <View style={[a.flex_row, a.flex_wrap, a.gap_sm]}>
            {sections.map(section => (
              <Link
                key={section.to}
                to={section.to}
                label={section.title}
                style={[
                  a.p_md,
                  a.rounded_sm,
                  a.border,
                  a.gap_xs,
                  t.atoms.border_contrast_low,
                  t.atoms.bg_contrast_25,
                  {width: 180, flexGrow: 1, flexBasis: 160},
                ]}>
                <Text style={[a.text_md, a.font_bold]}>{section.title}</Text>
                <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
                  {section.description}
                </Text>
              </Link>
            ))}
          </View>
          <View style={[a.pt_sm, a.gap_xs]}>
            <View style={[a.flex_row, a.align_center, a.justify_between]}>
              <Text style={[a.text_lg, a.font_bold]}>Conteúdo +18</Text>
              <Link to="/adult/feed" label="Abrir feed +18">
                <Text style={[a.text_sm, a.font_bold, {color: '#0b5cff'}]}>
                  Ver feed
                </Text>
              </Link>
            </View>
            <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
              Posts marcados como adultos aparecem aqui sem depender do servidor
              extra de vídeo.
            </Text>
          </View>
        </View>
      }
      ListEmptyComponent={
        <View style={[a.align_center, a.gap_sm, a.px_xl, {paddingTop: 32}]}>
          {isFetching ? (
            <Text
              style={[a.text_md, t.atoms.text_contrast_medium]}
              accessibilityRole="progressbar">
              Carregando conteúdo +18...
            </Text>
          ) : isError ? (
            <>
              <Text
                style={[
                  a.text_md,
                  a.text_center,
                  t.atoms.text_contrast_medium,
                ]}>
                Não foi possível carregar o conteúdo +18 agora.
              </Text>
              <Button
                label="Tentar novamente"
                size="small"
                onPress={() => feed.refetch()}>
                <ButtonText>Tentar novamente</ButtonText>
              </Button>
            </>
          ) : (
            <Text
              style={[a.text_md, a.text_center, t.atoms.text_contrast_medium]}>
              Nenhum post +18 foi encontrado nas páginas carregadas.
            </Text>
          )}
        </View>
      }
      ListFooterComponent={
        posts.length ? (
          <View style={[a.align_center, a.py_lg]}>
            <Link to="/adult/feed" label="Abrir feed +18">
              <Text style={[a.text_md, a.font_bold, {color: '#0b5cff'}]}>
                Abrir feed +18 completo
              </Text>
            </Link>
          </View>
        ) : null
      }
    />
  )
}
