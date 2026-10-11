/**
 * "Por que estou vendo isso?" for posts of the Aqua "Pra você" feed.
 * Shows the parts of the score carried in `feedContext` right away, then the
 * full explanation from aqua-feeds (place.aqua.feed.explain), and lets the user
 * adjust a convention on the spot.
 */
import {View} from 'react-native'
import {msg, Trans} from '@lingui/macro'
import {useLingui} from '@lingui/react'
import {useNavigation} from '@react-navigation/native'

import {
  type ContextPart,
  type ForYouContext,
  parseForYouContext,
  shares,
} from '#/lib/aqua-for-you'
import {type NavigationProp} from '#/lib/routes/types'
import {
  useAquaAdjustMutation,
  useAquaExplainQuery,
} from '#/state/queries/aqua-convencoes'
import * as Toast from '#/view/com/util/Toast'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Dialog from '#/components/Dialog'
import {Loader} from '#/components/Loader'
import {Text} from '#/components/Typography'

export function WhyAmISeeingThisDialog({
  control,
  postUri,
  feedContext,
}: {
  control: Dialog.DialogControlProps
  postUri: string
  feedContext: string | undefined
}) {
  return (
    <Dialog.Outer control={control}>
      <Dialog.Handle />
      <Inner postUri={postUri} feedContext={feedContext} />
    </Dialog.Outer>
  )
}

function useViaLabel() {
  const {_} = useLingui()
  return (p: ContextPart) => {
    switch (p.via) {
      case 'tag':
        return _(msg`Your convention “${p.nome}” is in the post's tags`)
      case 'texto':
        return _(msg`The text talks about “${p.nome}”, one of your conventions`)
      case 'idioma':
        return _(msg`Written in a language you read: ${p.nome}`)
      case 'rotulo':
        return _(msg`Has the label “${p.nome}”, which you usually see`)
      case 'criador':
        return _(msg`You interact with this person`)
      case 'formato':
        return _(msg`You prefer this format: ${p.nome}`)
      case 'sinapse':
        return _(
          msg`Synapse: for you, “${p.nome}” goes together with “${(p.through ?? '').slice((p.through ?? '').indexOf(':') + 1)}”`,
        )
    }
  }
}

function Inner({
  postUri,
  feedContext,
}: {
  postUri: string
  feedContext: string | undefined
}) {
  const {_} = useLingui()
  const t = useTheme()
  const control = Dialog.useDialogContext()
  const navigation = useNavigation<NavigationProp>()
  const ctx = parseForYouContext(feedContext)
  const explain = useAquaExplainQuery(postUri, true)
  const adjust = useAquaAdjustMutation()
  const viaLabel = useViaLabel()

  const onAdjust = (key: string, action: 'boost' | 'mute', factor?: number) =>
    adjust.mutate(
      {key, action, ...(factor ? {factor} : {})},
      {
        onSuccess: () =>
          Toast.show(
            action === 'mute'
              ? _(msg`Muted “${key}”. You can undo it in My Conventions.`)
              : _(msg`“${key}” now weighs more in your feed.`),
          ),
        onError: e => Toast.show(String(e.message), 'xmark'),
      },
    )

  const openConventions = () =>
    control.close(() => navigation.navigate('AquaConvencoes'))

  return (
    <Dialog.ScrollableInner label={_(msg`Why am I seeing this?`)}>
      <View style={[a.gap_lg]}>
        <View style={[a.gap_xs]}>
          <Text style={[a.text_2xl, a.font_bold]}>
            <Trans>Why am I seeing this?</Trans>
          </Text>
          <Text style={[a.text_sm, t.atoms.text_contrast_medium, a.leading_snug]}>
            <Trans>
              “For you” ranks posts by your Conventions of Reality: what you
              like, repost, save and follow. Here is the math for this post.
            </Trans>
          </Text>
        </View>

        {ctx ? (
          <Breakdown ctx={ctx} viaLabel={viaLabel} onAdjust={onAdjust} />
        ) : (
          <Text style={[a.text_md, t.atoms.text_contrast_medium]}>
            <Trans>This post came without an explanation.</Trans>
          </Text>
        )}

        {explain.isLoading ? (
          <Loader />
        ) : explain.data ? (
          <View style={[a.gap_xs]}>
            <Text style={[a.text_md, a.font_bold]}>
              <Trans>Details from the feed</Trans>
            </Text>
            {explain.data.motivos.map((m, i) => (
              <Text key={i} style={[a.text_sm, a.leading_snug]}>
                • {m}
              </Text>
            ))}
            <Text style={[a.text_xs, t.atoms.text_contrast_low, a.pt_xs]}>
              {explain.data.formula}
            </Text>
          </View>
        ) : null}

        <Button
          label={_(msg`My Conventions`)}
          onPress={openConventions}
          size="large"
          color="primary">
          <ButtonText>
            <Trans>See and adjust My Conventions</Trans>
          </ButtonText>
        </Button>
      </View>
      <Dialog.Close />
    </Dialog.ScrollableInner>
  )
}

function Breakdown({
  ctx,
  viaLabel,
  onAdjust,
}: {
  ctx: ForYouContext
  viaLabel: (p: ContextPart) => string
  onAdjust: (key: string, action: 'boost' | 'mute', factor?: number) => void
}) {
  const {_} = useLingui()
  const t = useTheme()
  const parts = shares(ctx)
  const adjustable = (p: ContextPart) =>
    p.tipo === 'tema' || p.tipo === 'rotulo' || p.tipo === 'idioma'
  return (
    <View style={[a.gap_md]}>
      {parts.length === 0 && (
        <Text style={[a.text_md, t.atoms.text_contrast_medium]}>
          <Trans>None of your conventions matched: it is here because it is recent or popular.</Trans>
        </Text>
      )}
      {parts.map(p => (
        <View key={`${p.key}-${p.via}`} style={[a.gap_xs]}>
          <Text style={[a.text_sm, a.leading_snug]}>
            {viaLabel(p)} <Text style={[a.font_bold]}>+{p.points.toFixed(2)}</Text>
          </Text>
          <View
            style={[a.rounded_full, t.atoms.bg_contrast_50, {height: 6}]}>
            <View
              style={[
                a.rounded_full,
                {
                  height: 6,
                  width: `${Math.round(p.share * 100)}%`,
                  backgroundColor: t.palette.primary_500,
                },
              ]}
            />
          </View>
          {adjustable(p) && (
            <View style={[a.flex_row, a.gap_sm]}>
              <Button
                label={_(msg`More of ${p.nome}`)}
                size="tiny"
                color="secondary"
                onPress={() => onAdjust(p.key, 'boost', 2)}>
                <ButtonText>
                  <Trans>More</Trans>
                </ButtonText>
              </Button>
              <Button
                label={_(msg`Mute ${p.nome}`)}
                size="tiny"
                color="secondary"
                onPress={() => onAdjust(p.key, 'mute')}>
                <ButtonText>
                  <Trans>Mute</Trans>
                </ButtonText>
              </Button>
            </View>
          )}
        </View>
      ))}
      <View style={[a.gap_2xs]}>
        {ctx.hot > 0 && (
          <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
            <Trans>Trending on the network: +{ctx.hot.toFixed(2)}</Trans>
          </Text>
        )}
        <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
          <Trans>Freshness: {Math.round(ctx.freshness * 100)}% (halves every 12 hours)</Trans>
        </Text>
        {ctx.penalties.map(p => (
          <Text key={p} style={[a.text_sm, t.atoms.text_contrast_medium]}>
            {p === 'visto'
              ? _(msg`You've already seen it (×0.5)`)
              : p === 'mostrar-menos'
                ? _(msg`You asked for less like this (×0.3)`)
                : _(msg`Has a convention you muted (×0.1)`)}
          </Text>
        ))}
        <Text style={[a.text_sm, a.font_bold]}>
          <Trans>Score: {ctx.score.toFixed(2)}</Trans>
        </Text>
      </View>
    </View>
  )
}
