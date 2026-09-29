import {View} from 'react-native'
import {Image} from 'expo-image'
import {useQuery, useQueryClient} from '@tanstack/react-query'

import {
  type AdultAccessDecision,
  adultApi,
  adultMediaUrl,
} from '#/lib/adult/api'
import {adultQueryKey} from '#/lib/adult/isolation'
import {useAgent} from '#/state/session'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {Link} from '#/components/Link'
import * as Prompt from '#/components/Prompt'
import {Text} from '#/components/Typography'
import {AdultShell} from './AdultShell'
import {AdultApiNotice} from './AdultViews'

type Item = {
  type: string
  id: string
  title: string
  subtitle: string | null
  posterUrl: string | null
  href: string | null
  available: boolean
  access: AdultAccessDecision
  expiresAt?: string
  positionMs?: number
  durationMs?: number | null
  historyId?: string
  watchedAt?: string
}

type Subscription = {
  id: string
  name: string
  handle: string | null
  tier: string
  status: string
  renews: boolean
  currentPeriodEnd: string
}

type Sections = Partial<{
  continueWatching: Item[]
  purchased: Item[]
  ppv: Item[]
  rentals: {active: Item[]; expired: Item[]}
  subscriptions: {creators: Subscription[]; studios: Subscription[]}
  collections: Item[]
  saved: Item[]
  watchLater: Item[]
  history: Item[]
}>

export function AdultLibraryScreen() {
  return (
    <AdultShell title="Minha biblioteca" testID="adultLibraryScreen">
      <Library />
    </AdultShell>
  )
}

/** Private by default: the caller's own relations, never public activity. */
function Library() {
  const t = useTheme()
  const agent = useAgent()
  const qc = useQueryClient()
  const clearPrompt = Prompt.usePromptControl()
  const lib = useQuery({
    queryKey: adultQueryKey('library', agent.session?.did),
    queryFn: () => adultApi<{sections: Sections}>(agent, '/me/library'),
  })
  const refresh = () =>
    qc.invalidateQueries({queryKey: adultQueryKey('library')})
  const remove = async (path: string) => {
    await adultApi(agent, path, {method: 'DELETE'})
    refresh()
  }

  if (lib.error)
    return (
      <View style={a.p_md}>
        <AdultApiNotice error={lib.error} onRetry={() => lib.refetch()} />
      </View>
    )
  if (!lib.data) return <Text style={[a.p_lg]}>Carregando…</Text>
  const s = lib.data.sections
  if (!Object.keys(s).length) {
    return (
      <Text style={[a.p_xl, a.text_center, t.atoms.text_contrast_medium]}>
        Sua biblioteca está vazia. Compras, aluguéis, assinaturas e itens salvos
        aparecem aqui.
      </Text>
    )
  }

  return (
    <View style={[a.p_md, a.gap_xl]}>
      <Section
        title="Continuar assistindo"
        items={s.continueWatching}
        progress
      />
      <Section title="Comprados" items={s.purchased} />
      <Section title="Desbloqueados (PPV)" items={s.ppv} />
      <Section title="Aluguéis ativos" items={s.rentals?.active} expiry />
      <Section title="Aluguéis expirados" items={s.rentals?.expired} expiry />
      <Subscriptions
        title="Assinaturas de creators"
        subs={s.subscriptions?.creators}
      />
      <Subscriptions
        title="Assinaturas de studios"
        subs={s.subscriptions?.studios}
      />
      <Section title="Coleções" items={s.collections} />
      <Section
        title="Salvos"
        items={s.saved}
        onRemove={i =>
          remove(`/me/library/saved/${i.type}/${encodeURIComponent(i.id)}`)
        }
      />
      <Section
        title="Assistir depois"
        items={s.watchLater}
        onRemove={i =>
          remove(
            `/me/library/watch-later/${i.type}/${encodeURIComponent(i.id)}`,
          )
        }
      />
      {!!s.history?.length && (
        <View style={[a.gap_sm]}>
          <View style={[a.flex_row, a.align_center, a.justify_between]}>
            <Text style={[a.text_lg, a.font_bold]}>Histórico</Text>
            <Button
              label="Limpar histórico"
              size="tiny"
              color="secondary"
              variant="ghost"
              onPress={clearPrompt.open}>
              <ButtonText>Limpar histórico</ButtonText>
            </Button>
          </View>
          <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
            Limpar o histórico não apaga suas compras nem seus aluguéis.
          </Text>
          <Rows
            items={s.history}
            onRemove={i => remove(`/me/adult/history/${i.historyId}`)}
          />
        </View>
      )}
      <Prompt.Basic
        control={clearPrompt}
        title="Limpar histórico?"
        description="Remove o histórico e o progresso do AQUA +18 neste perfil. Compras, aluguéis e assinaturas continuam."
        confirmButtonCta="Limpar"
        confirmButtonColor="negative"
        onConfirm={() => remove('/me/adult/history')}
      />
    </View>
  )
}

function Section({
  title,
  items,
  onRemove,
  progress,
  expiry,
}: {
  title: string
  items?: Item[]
  onRemove?: (i: Item) => void
  progress?: boolean
  expiry?: boolean
}) {
  if (!items?.length) return null
  return (
    <View style={[a.gap_sm]}>
      <Text style={[a.text_lg, a.font_bold]}>{title}</Text>
      <Rows
        items={items}
        onRemove={onRemove}
        progress={progress}
        expiry={expiry}
      />
    </View>
  )
}

function Rows({
  items,
  onRemove,
  progress,
  expiry,
}: {
  items: Item[]
  onRemove?: (i: Item) => void
  progress?: boolean
  expiry?: boolean
}) {
  const t = useTheme()
  return (
    <View style={[a.gap_sm]}>
      {items.map(item => {
        const body = (
          <View style={[a.flex_row, a.align_center, a.gap_md, a.flex_1]}>
            <View
              style={[
                a.rounded_sm,
                a.overflow_hidden,
                t.atoms.bg_contrast_50,
                {width: 96, aspectRatio: 16 / 9},
              ]}>
              {item.posterUrl && (
                <Image
                  source={{uri: adultMediaUrl(item.posterUrl)}}
                  style={[a.w_full, a.h_full]}
                  contentFit="cover"
                  accessibilityIgnoresInvertColors
                />
              )}
            </View>
            <View style={[a.flex_1, a.gap_2xs]}>
              <Text
                style={[
                  a.text_md,
                  a.font_bold,
                  !item.available && t.atoms.text_contrast_medium,
                ]}
                numberOfLines={2}>
                {item.title}
              </Text>
              {!!item.subtitle && (
                <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
                  {item.subtitle}
                </Text>
              )}
              {progress && item.durationMs ? (
                <View
                  style={[a.rounded_full, t.atoms.bg_contrast_50, {height: 4}]}>
                  <View
                    style={[
                      a.rounded_full,
                      {
                        height: 4,
                        width: `${Math.min(100, (100 * (item.positionMs ?? 0)) / item.durationMs)}%`,
                        backgroundColor: '#009eff',
                      },
                    ]}
                  />
                </View>
              ) : null}
              {expiry && item.expiresAt && (
                <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
                  {new Date(item.expiresAt) > new Date()
                    ? `Disponível até ${new Date(item.expiresAt).toLocaleString('pt-BR')}`
                    : 'Aluguel expirado'}
                </Text>
              )}
              {item.available && !item.access.allowed && !expiry && (
                <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
                  Bloqueado — sujeito ao acesso atual
                </Text>
              )}
            </View>
          </View>
        )
        return (
          <View
            key={`${item.type}:${item.id}:${item.historyId ?? ''}`}
            style={[a.flex_row, a.align_center, a.gap_sm]}>
            {item.available && item.href ? (
              <Link to={item.href} label={item.title} style={[a.flex_1]}>
                {body}
              </Link>
            ) : (
              body
            )}
            {onRemove && (
              <Button
                label={`Remover ${item.title}`}
                size="tiny"
                color="secondary"
                variant="ghost"
                onPress={() => onRemove(item)}>
                <ButtonText>Remover</ButtonText>
              </Button>
            )}
          </View>
        )
      })}
    </View>
  )
}

/** Save / Watch later toggles (separate relations) for a detail page. */
export function LibraryButtons({type, id}: {type: string; id: string}) {
  const agent = useAgent()
  const qc = useQueryClient()
  const lib = useQuery({
    queryKey: adultQueryKey('library', agent.session?.did),
    queryFn: () => adultApi<{sections: Sections}>(agent, '/me/library'),
  })
  const has = (items?: Item[]) =>
    !!items?.some(i => i.type === type && i.id === id)
  const saved = has(lib.data?.sections.saved)
  const later = has(lib.data?.sections.watchLater)
  const toggle = async (list: 'saved' | 'watch-later', on: boolean) => {
    await adultApi(
      agent,
      `/me/library/${list}/${type}/${encodeURIComponent(id)}`,
      {method: on ? 'DELETE' : 'PUT'},
    )
    qc.invalidateQueries({queryKey: adultQueryKey('library')})
  }
  return (
    <View style={[a.flex_row, a.gap_sm]}>
      <Button
        label={saved ? 'Remover dos salvos' : 'Salvar'}
        size="small"
        color="secondary"
        onPress={() => toggle('saved', saved)}>
        <ButtonText>{saved ? 'Salvo' : 'Salvar'}</ButtonText>
      </Button>
      <Button
        label={later ? 'Remover de assistir depois' : 'Assistir depois'}
        size="small"
        color="secondary"
        onPress={() => toggle('watch-later', later)}>
        <ButtonText>{later ? 'Na lista' : 'Assistir depois'}</ButtonText>
      </Button>
    </View>
  )
}

function Subscriptions({title, subs}: {title: string; subs?: Subscription[]}) {
  const t = useTheme()
  if (!subs?.length) return null
  return (
    <View style={[a.gap_sm]}>
      <Text style={[a.text_lg, a.font_bold]}>{title}</Text>
      {subs.map(s => (
        <View key={s.id} style={[a.gap_2xs]}>
          <Text
            style={[a.text_md, a.font_bold]}>{`${s.name} · ${s.tier}`}</Text>
          <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
            {s.renews
              ? `Renova em ${new Date(s.currentPeriodEnd).toLocaleDateString('pt-BR')}`
              : `Acesso até ${new Date(s.currentPeriodEnd).toLocaleDateString('pt-BR')}`}
            {s.status === 'PAST_DUE' ? ' · pagamento pendente' : ''}
          </Text>
        </View>
      ))}
    </View>
  )
}
