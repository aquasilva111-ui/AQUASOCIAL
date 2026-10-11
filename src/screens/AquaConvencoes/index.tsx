/**
 * "Minhas Convenções": what the Aqua "Pra você" feed thinks you care about,
 * how much each convention weighs, where it came from (you or inferred), how it
 * changed over time, and controls to boost, mute, delete, mark as wrong or add.
 * Data: aqua-feeds place.aqua.convencoes.* (history lives in the personal git).
 */
import {useState} from 'react'
import {View} from 'react-native'
import {msg, Trans} from '@lingui/macro'
import {useLingui} from '@lingui/react'
import {type NativeStackScreenProps} from '@react-navigation/native-stack'

import {
  type ConventionView,
  type Estado,
  type HistoryEntryView,
  normalizeConventionName,
  sparkline,
  trendDirection,
} from '#/lib/aqua-for-you'
import {type CommonNavigatorParams} from '#/lib/routes/types'
import {cleanError} from '#/lib/strings/errors'
import {
  AQUA_FOR_YOU_ENABLED,
  useAquaAdjustMutation,
  useAquaConvencoesHistoryQuery,
  useAquaConvencoesProfileQuery,
} from '#/state/queries/aqua-convencoes'
import {ErrorScreen} from '#/view/com/util/error/ErrorScreen'
import * as Toast from '#/view/com/util/Toast'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as TextField from '#/components/forms/TextField'
import * as Layout from '#/components/Layout'
import {Loader} from '#/components/Loader'
import * as Prompt from '#/components/Prompt'
import {Text} from '#/components/Typography'

type Props = NativeStackScreenProps<CommonNavigatorParams, 'AquaConvencoes'>

const TIPOS = ['tema', 'idioma', 'rotulo'] as const

export function AquaConvencoesScreen({}: Props) {
  const {_} = useLingui()
  const profile = useAquaConvencoesProfileQuery()
  const [tab, setTab] = useState<'convencoes' | 'historico'>('convencoes')

  return (
    <Layout.Screen testID="AquaConvencoesScreen">
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>
            <Trans>My Conventions</Trans>
          </Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>
      <Layout.Content>
        {!AQUA_FOR_YOU_ENABLED ? (
          <ErrorScreen
            title={_(msg`Not available`)}
            message={_(
              msg`The “For you” feed is not configured in this build of the app.`,
            )}
          />
        ) : profile.error ? (
          <ErrorScreen
            title={_(msg`Oops!`)}
            message={_(msg`Could not load your conventions`)}
            details={cleanError(profile.error)}
            onPressTryAgain={() => profile.refetch()}
          />
        ) : !profile.data ? (
          <View style={[a.p_xl, a.align_center]}>
            <Loader size="xl" />
          </View>
        ) : (
          <View style={[a.p_lg, a.gap_lg]}>
            <Intro count={profile.data.convencoes.length} />
            <View style={[a.flex_row, a.gap_sm]}>
              <Button
                label={_(msg`Conventions`)}
                size="small"
                color={tab === 'convencoes' ? 'primary' : 'secondary'}
                onPress={() => setTab('convencoes')}>
                <ButtonText>
                  <Trans>Conventions</Trans>
                </ButtonText>
              </Button>
              <Button
                label={_(msg`History`)}
                size="small"
                color={tab === 'historico' ? 'primary' : 'secondary'}
                onPress={() => setTab('historico')}>
                <ButtonText>
                  <Trans>History</Trans>
                </ButtonText>
              </Button>
            </View>
            {tab === 'convencoes' ? (
              <>
                <AddConvention />
                {profile.data.convencoes.length === 0 && (
                  <Text style={[a.text_md]}>
                    <Trans>
                      Nothing yet. Like, repost, save or follow in “For you”, or
                      add a convention above.
                    </Trans>
                  </Text>
                )}
                {profile.data.convencoes.map(c => (
                  <ConventionCard key={c.key} c={c} />
                ))}
                {profile.data.sinapses.length > 0 && (
                  <Synapses list={profile.data.sinapses} />
                )}
                {profile.data.bloqueadas.length > 0 && (
                  <Blocked keys={profile.data.bloqueadas} />
                )}
              </>
            ) : (
              <History />
            )}
          </View>
        )}
      </Layout.Content>
    </Layout.Screen>
  )
}

function Intro({count}: {count: number}) {
  const t = useTheme()
  return (
    <View style={[a.gap_xs]}>
      <Text style={[a.text_md, a.leading_snug]}>
        <Trans>
          These are the {count} conventions that shape your “For you” feed.
          Each one has a gravity: it grows when you interact with posts that
          carry it and halves every 14 days without use.
        </Trans>
      </Text>
      <Text style={[a.text_sm, t.atoms.text_contrast_medium, a.leading_snug]}>
        <Trans>
          “Yours” = you added it. “Inferred” = the Aqua guessed it from what
          you did. Nothing here is public.
        </Trans>
      </Text>
    </View>
  )
}

function useEstadoLabel() {
  const {_} = useLingui()
  return (e: Estado) =>
    e === 'ativa'
      ? _(msg`active`)
      : e === 'emergente'
        ? _(msg`emerging`)
        : e === 'enfraquecendo'
          ? _(msg`weakening`)
          : _(msg`dormant`)
}

function ConventionCard({c}: {c: ConventionView}) {
  const {_} = useLingui()
  const t = useTheme()
  const adjust = useAquaAdjustMutation()
  const estadoLabel = useEstadoLabel()
  const deleteControl = Prompt.usePromptControl()
  const wrongControl = Prompt.usePromptControl()
  const serie = c.tendencia.map(p => p.gravidade)
  const bars = sparkline(serie)
  const dir = trendDirection(serie)

  const run = (action: 'boost' | 'mute' | 'unmute' | 'delete' | 'wrong', factor?: number) =>
    adjust.mutate(
      {key: c.key, action, ...(factor ? {factor} : {})},
      {onError: e => Toast.show(String(e.message), 'xmark')},
    )

  const sinais = Object.entries(c.sinais)
    .filter(([, n]) => n)
    .map(([k, n]) => `${k} ${n}`)
    .join(' · ')

  return (
    <View
      style={[
        a.p_md,
        a.rounded_md,
        a.border,
        a.gap_sm,
        t.atoms.border_contrast_low,
        c.silenciada && {opacity: 0.6},
      ]}>
      <View style={[a.flex_row, a.justify_between, a.align_center]}>
        <View style={[a.flex_1, a.gap_2xs]}>
          <Text style={[a.text_lg, a.font_bold]} numberOfLines={1}>
            {c.tipo === 'tema' ? `#${c.nome}` : c.nome}
          </Text>
          <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
            {c.tipo} ·{' '}
            {c.certeza === 'explicito' ? _(msg`yours`) : _(msg`inferred`)} ·{' '}
            {estadoLabel(c.estado)}
            {c.silenciada ? ` · ${_(msg`muted`)}` : ''}
            {c.boost !== 1 ? ` · ×${c.boost}` : ''}
          </Text>
        </View>
        <View style={[a.align_end]}>
          <Text style={[a.text_xl, a.font_bold]}>{c.gravidade.toFixed(1)}</Text>
          <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
            {dir === 'up' ? '↑' : dir === 'down' ? '↓' : '→'}{' '}
            <Trans>gravity</Trans>
          </Text>
        </View>
      </View>

      {bars.length > 1 && (
        <View
          style={[a.flex_row, a.align_end, a.gap_2xs, {height: 28}]}
          accessibilityLabel={_(msg`Gravity over time`)}
          accessibilityHint={_(msg`Bar chart of how this convention's gravity changed`)}>
          {bars.map((b, i) => (
            <View
              key={i}
              style={[
                a.flex_1,
                a.rounded_xs,
                {
                  height: Math.max(2, Math.round(b * 28)),
                  backgroundColor: t.palette.primary_500,
                },
              ]}
            />
          ))}
        </View>
      )}

      {sinais ? (
        <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
          <Trans>Signals: {sinais}</Trans>
          {c.gravidadeInferida !== c.gravidade
            ? ` · ${_(msg`from signals alone: ${c.gravidadeInferida.toFixed(1)}`)}`
            : ''}
        </Text>
      ) : null}

      <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
        <Button label={_(msg`Boost`)} size="tiny" color="secondary" onPress={() => run('boost', Math.min(4, c.boost * 2))}>
          <ButtonText><Trans>More</Trans></ButtonText>
        </Button>
        <Button label={_(msg`Weigh less`)} size="tiny" color="secondary" onPress={() => run('boost', Math.max(0.25, c.boost / 2))}>
          <ButtonText><Trans>Less</Trans></ButtonText>
        </Button>
        <Button
          label={c.silenciada ? _(msg`Unmute`) : _(msg`Mute`)}
          size="tiny"
          color="secondary"
          onPress={() => run(c.silenciada ? 'unmute' : 'mute')}>
          <ButtonText>{c.silenciada ? <Trans>Unmute</Trans> : <Trans>Mute</Trans>}</ButtonText>
        </Button>
        <Button label={_(msg`Delete`)} size="tiny" color="secondary" onPress={deleteControl.open}>
          <ButtonText><Trans>Delete</Trans></ButtonText>
        </Button>
        {c.certeza === 'inferido' && (
          <Button label={_(msg`This is wrong`)} size="tiny" color="negative_subtle" onPress={wrongControl.open}>
            <ButtonText><Trans>This is wrong</Trans></ButtonText>
          </Button>
        )}
      </View>

      <Prompt.Basic
        control={deleteControl}
        title={_(msg`Delete this convention?`)}
        description={_(
          msg`The Aqua forgets your signals for “${c.key}” up to now. New activity can bring it back.`,
        )}
        confirmButtonCta={_(msg`Delete`)}
        confirmButtonColor="negative"
        onConfirm={() => run('delete')}
      />
      <Prompt.Basic
        control={wrongControl}
        title={_(msg`Mark as wrong?`)}
        description={_(
          msg`The Aqua forgets “${c.key}” and will not infer it again. You can still add it yourself later.`,
        )}
        confirmButtonCta={_(msg`Mark as wrong`)}
        confirmButtonColor="negative"
        onConfirm={() => run('wrong')}
      />
    </View>
  )
}

function AddConvention() {
  const {_} = useLingui()
  const t = useTheme()
  const adjust = useAquaAdjustMutation()
  const [tipo, setTipo] = useState<(typeof TIPOS)[number]>('tema')
  const [nome, setNome] = useState('')
  const valid = normalizeConventionName(nome).length > 0
  const add = () => {
    if (!valid) return
    adjust.mutate(
      {key: `${tipo}:${normalizeConventionName(nome)}`, action: 'add'},
      {
        onSuccess: () => setNome(''),
        onError: e => Toast.show(String(e.message), 'xmark'),
      },
    )
  }
  return (
    <View style={[a.gap_sm, a.p_md, a.rounded_md, t.atoms.bg_contrast_25]}>
      <Text style={[a.text_md, a.font_bold]}>
        <Trans>Add a convention</Trans>
      </Text>
      <View style={[a.flex_row, a.gap_xs]}>
        {TIPOS.map(x => (
          <Button
            key={x}
            label={x}
            size="tiny"
            color={tipo === x ? 'primary' : 'secondary'}
            onPress={() => setTipo(x)}>
            <ButtonText>{x}</ButtonText>
          </Button>
        ))}
      </View>
      <TextField.Root>
        <TextField.Input
          label={_(msg`Name, e.g. watercolor`)}
          value={nome}
          onChangeText={setNome}
          onSubmitEditing={add}
          autoCapitalize="none"
          returnKeyType="done"
        />
      </TextField.Root>
      <Button
        label={_(msg`Add`)}
        size="small"
        color="primary"
        disabled={!valid || adjust.isPending}
        onPress={add}>
        <ButtonText>
          <Trans>Add</Trans>
        </ButtonText>
      </Button>
    </View>
  )
}

function Synapses({list}: {list: Array<{a: string; b: string; vezes: number}>}) {
  const t = useTheme()
  return (
    <View style={[a.gap_xs]}>
      <Text style={[a.text_md, a.font_bold]}>
        <Trans>Synapses (conventions that go together for you)</Trans>
      </Text>
      {list.slice(0, 15).map(s => (
        <Text key={`${s.a}|${s.b}`} style={[a.text_sm, t.atoms.text_contrast_medium]}>
          {s.a} ↔ {s.b} · {s.vezes}×
        </Text>
      ))}
    </View>
  )
}

function Blocked({keys}: {keys: string[]}) {
  const {_} = useLingui()
  const t = useTheme()
  const adjust = useAquaAdjustMutation()
  return (
    <View style={[a.gap_xs]}>
      <Text style={[a.text_md, a.font_bold]}>
        <Trans>Marked as wrong</Trans>
      </Text>
      {keys.map(k => (
        <View key={k} style={[a.flex_row, a.align_center, a.justify_between]}>
          <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>{k}</Text>
          <Button
            label={_(msg`Add back`)}
            size="tiny"
            color="secondary"
            onPress={() => adjust.mutate({key: k, action: 'add'})}>
            <ButtonText>
              <Trans>Add back</Trans>
            </ButtonText>
          </Button>
        </View>
      ))}
    </View>
  )
}

function History() {
  const {_} = useLingui()
  const t = useTheme()
  const history = useAquaConvencoesHistoryQuery()
  if (history.error)
    return <Text style={[a.text_md]}>{cleanError(history.error)}</Text>
  if (!history.data) return <Loader />
  const kindLabel = (k: HistoryEntryView['changes'][number]['kind']) =>
    k === 'added' ? _(msg`added`) : k === 'removed' ? _(msg`removed`) : _(msg`changed`)
  return (
    <View style={[a.gap_md]}>
      <Text style={[a.text_sm, t.atoms.text_contrast_medium, a.leading_snug]}>
        {history.data.verificado
          ? _(msg`Every change is a commit in your personal git (hash chain verified).`)
          : _(msg`Warning: the history chain did not verify.`)}
      </Text>
      {history.data.historico.length === 0 && (
        <Text style={[a.text_md]}>
          <Trans>No changes yet.</Trans>
        </Text>
      )}
      {history.data.historico.map(e => (
        <View key={e.hash} style={[a.gap_2xs, a.pb_sm, a.border_b, t.atoms.border_contrast_low]}>
          <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
            {new Date(e.at).toLocaleString()} ·{' '}
            {e.certeza === 'explicito' ? _(msg`you`) : _(msg`inferred by the Aqua`)}
          </Text>
          <Text style={[a.text_sm, a.leading_snug]}>{e.reason}</Text>
          <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
            {e.changes
              .slice(0, 8)
              .map(ch => {
                const g = ch.fields.find(f => f.field === 'gravidade')
                const delta =
                  g && typeof g.before === 'number' && typeof g.after === 'number'
                    ? ` ${g.before}→${g.after}`
                    : ''
                return `${ch.key} (${kindLabel(ch.kind)}${delta})`
              })
              .join(' · ')}
            {e.changes.length > 8 ? ` · +${e.changes.length - 8}` : ''}
          </Text>
        </View>
      ))}
    </View>
  )
}
