import {ScrollView, View} from 'react-native'
import {useQuery} from '@tanstack/react-query'

import {adultApi, type AdultNetworkPost} from '#/lib/adult/api'
import {useAdultContext} from '#/state/adult/context'
import {useAgent} from '#/state/session'
import {atoms as a, useTheme} from '#/alf'
import {AdultNetworkPostCard, networkKey} from '#/components/adult/AdultNetwork'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'
import {AdultShell} from './AdultShell'
import {AdultApiNotice} from './AdultViews'

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
  const agent = useAgent()
  const ctx = useAdultContext()

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

  const feed = useQuery({
    queryKey: networkKey('home', agent.session?.did),
    queryFn: () =>
      adultApi<{posts: AdultNetworkPost[]}>(agent, '/adult/feed?tab=discover'),
    enabled: ctx.adultAccessEnabled,
  })
  const posts = (feed.data?.posts ?? []).slice(0, 6)

  return (
    <ScrollView contentContainerStyle={{paddingBottom: 120}}>
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
        <View style={[a.pt_sm, a.flex_row, a.align_center, a.justify_between]}>
          <Text style={[a.text_lg, a.font_bold]}>Agora no +18</Text>
          <Link to="/adult/feed" label="Abrir feed +18">
            <Text style={[a.text_sm, a.font_bold, {color: '#0b5cff'}]}>
              Ver feed
            </Text>
          </Link>
        </View>
      </View>
      {feed.error ? (
        <AdultApiNotice error={feed.error} onRetry={() => feed.refetch()} />
      ) : feed.isLoading ? (
        <Text style={[a.p_lg, t.atoms.text_contrast_medium]}>Carregando…</Text>
      ) : posts.length ? (
        posts.map(post => (
          <AdultNetworkPostCard
            key={`${post.id}:${post.repostedBy?.did}`}
            post={post}
          />
        ))
      ) : (
        <Text style={[a.p_lg, a.text_center, t.atoms.text_contrast_medium]}>
          Ainda não há posts +18. Seja a primeira pessoa a publicar.
        </Text>
      )}
    </ScrollView>
  )
}
