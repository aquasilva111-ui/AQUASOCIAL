import {View} from 'react-native'
import {msg} from '@lingui/macro'
import {useLingui} from '@lingui/react'

import {useAdultContext} from '#/state/adult/context'
import {atoms as a, useTheme} from '#/alf'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'
import {AdultShell} from './AdultShell'

type AdultSection = {
  to: string
  title: string
  description: string
}

/**
 * Functional entry point of AQUA +18. Navigation only — real content
 * arrives in FASES 5+ (Feed, Creators, Views, Studios, Library, Live).
 */
export function AdultHomeScreen() {
  const t = useTheme()
  const {_} = useLingui()
  const ctx = useAdultContext()

  const sections: AdultSection[] = [
    {
      to: '/adult/feed',
      title: _(msg`Feed +18`),
      description: _(msg`Publicações de criadores adultos`),
    },
    {
      to: '/adult/creators',
      title: _(msg`Creators`),
      description: _(msg`Criadores e assinaturas`),
    },
    {
      to: '/adult/views',
      title: _(msg`Views +18`),
      description: _(msg`Vídeos do catálogo adulto`),
    },
    {
      to: '/adult/live',
      title: _(msg`Live +18`),
      description: _(msg`Transmissões ao vivo`),
    },
    {
      to: '/adult/studios',
      title: _(msg`Studios +18`),
      description: _(msg`Estúdios, séries e filmes`),
    },
    {
      to: '/adult/library',
      title: _(msg`Minha biblioteca`),
      description: _(msg`Conteúdo adquirido e salvo`),
    },
    {
      to: '/adult/messages',
      title: _(msg`Mensagens`),
      description: _(msg`Conversas do contexto +18`),
    },
    {
      to: '/adult/settings',
      title: _(msg`Configurações +18`),
      description: _(msg`Privacidade e preferências adultas`),
    },
  ]

  return (
    <AdultShell title={_(msg`AQUA +18`)} testID="adultHomeScreen">
      <View style={[a.p_md, a.gap_sm]}>
        <Text style={[a.px_xs, a.pb_sm, t.atoms.text_contrast_medium]}>
          {ctx.identity
            ? _(
                msg`Entrou como @${ctx.identity.handle} — atividade isolada do AQUA Social.`,
              )
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
      </View>
    </AdultShell>
  )
}
