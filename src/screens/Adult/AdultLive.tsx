import {useCallback, useEffect, useState} from 'react'
import {TextInput, View} from 'react-native'
import {useQuery, useQueryClient} from '@tanstack/react-query'

import {
  ADULT_API_URL,
  type AdultAccessDecision,
  adultApi,
  adultMediaUrl,
  type AdultOffer,
  formatMinor,
} from '#/lib/adult/api'
import {newIdempotencyKey} from '#/lib/adult/idempotency'
import {adultQueryKey} from '#/lib/adult/isolation'
import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
} from '#/lib/routes/types'
import {useAgent} from '#/state/session'
import {atoms as a, useTheme} from '#/alf'
import {AdultPlayer} from '#/components/adult/AdultPlayer'
import {Button, ButtonText} from '#/components/Button'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'
import {AdultShell} from './AdultShell'
import {AdultApiNotice, POLICY_LABELS} from './AdultViews'

type LiveCard = {
  id: string
  title: string
  status: string
  accessPolicy: string
  scheduledAt: string | null
  host: string
  viewerCount: number
}

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: 'Agendada',
  STARTING: 'Começando',
  LIVE: 'Ao vivo',
  INTERRUPTED: 'Sinal interrompido',
  ENDED: 'Encerrada',
  CANCELLED: 'Cancelada',
}

const REPORT_REASONS: [string, string][] = [
  ['underage_suspected', 'Possível menor de idade'],
  ['non_consensual', 'Conteúdo não consensual'],
  ['illegal_content', 'Conteúdo ilegal'],
  ['harassment', 'Assédio'],
  ['spam', 'Spam'],
  ['impersonation', 'Falsa identidade'],
  ['copyright', 'Direitos autorais'],
  ['other', 'Outro'],
]

// ------------------------------------------------------------ list + setup

export function AdultLiveScreen() {
  return (
    <AdultShell title="Live +18" testID="adultLiveScreen">
      <LiveHome />
    </AdultShell>
  )
}

function LiveHome() {
  const t = useTheme()
  const agent = useAgent()
  const list = useQuery({
    queryKey: adultQueryKey('live', 'list', agent.session?.did),
    queryFn: () =>
      adultApi<{live: LiveCard[]; upcoming: LiveCard[]}>(agent, '/live'),
    refetchInterval: 15_000,
  })
  if (list.error)
    return (
      <View style={a.p_md}>
        <AdultApiNotice error={list.error} onRetry={() => list.refetch()} />
      </View>
    )
  if (!list.data) return <Text style={[a.p_lg]}>Carregando…</Text>
  return (
    <View style={[a.p_md, a.gap_xl]}>
      <LiveList
        title="Ao vivo agora"
        items={list.data.live}
        empty="Ninguém ao vivo agora."
      />
      <LiveList
        title="Próximas"
        items={list.data.upcoming}
        empty="Nenhuma live agendada."
      />
      <View style={[a.border_t, t.atoms.border_contrast_low]} />
      <CreateLive />
    </View>
  )
}

function LiveList({
  title,
  items,
  empty,
}: {
  title: string
  items: LiveCard[]
  empty: string
}) {
  const t = useTheme()
  return (
    <View style={[a.gap_sm]}>
      <Text style={[a.text_lg, a.font_bold]}>{title}</Text>
      {!items.length && (
        <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>{empty}</Text>
      )}
      {items.map(s => (
        <Link
          key={s.id}
          to={`/adult/live/${s.id}`}
          label={s.title}
          style={[a.flex_col, a.align_start, a.gap_2xs, a.py_xs]}>
          <Text style={[a.text_md, a.font_bold]}>{s.title}</Text>
          <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
            {`${s.host} · ${STATUS_LABEL[s.status] ?? s.status} · ${POLICY_LABELS[s.accessPolicy] ?? ''}${s.status === 'LIVE' ? ` · ${s.viewerCount} assistindo` : ''}${s.scheduledAt ? ` · ${new Date(s.scheduledAt).toLocaleString('pt-BR')}` : ''}`}
          </Text>
        </Link>
      ))}
    </View>
  )
}

/** Approved creators set up a live; the stream key is shown exactly once. */
function CreateLive() {
  const t = useTheme()
  const agent = useAgent()
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const [policy, setPolicy] = useState<
    'free' | 'subscriber_only' | 'ppv_required'
  >('free')
  const [created, setCreated] = useState<{
    streamId: string
    streamKey: string
    ingestUrl: string
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const create = async () => {
    setError(null)
    try {
      const r = await adultApi<{
        streamId: string
        streamKey: string
        ingestUrl: string
      }>(agent, '/live', {
        method: 'POST',
        body: {title: title.trim(), accessPolicy: policy},
      })
      setCreated(r)
      qc.invalidateQueries({queryKey: adultQueryKey('live')})
    } catch (e: any) {
      setError(
        e?.code === 'creator_not_approved'
          ? 'Somente creators aprovados podem criar lives.'
          : 'Não foi possível criar a live.',
      )
    }
  }

  return (
    <View style={[a.gap_sm]}>
      <Text style={[a.text_lg, a.font_bold]}>Criar uma live</Text>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="Título da live"
        accessibilityLabel="Título da live"
        accessibilityHint=""
        style={[
          a.border,
          a.rounded_sm,
          a.p_sm,
          t.atoms.text,
          t.atoms.border_contrast_low,
        ]}
      />
      <View style={[a.flex_row, a.gap_xs]}>
        {(['free', 'subscriber_only', 'ppv_required'] as const).map(p => (
          <Button
            key={p}
            label={POLICY_LABELS[p]}
            size="small"
            color={policy === p ? 'primary' : 'secondary'}
            onPress={() => setPolicy(p)}>
            <ButtonText>{POLICY_LABELS[p]}</ButtonText>
          </Button>
        ))}
      </View>
      <Button
        label="Criar live"
        size="small"
        color="primary"
        disabled={!title.trim()}
        onPress={create}
        style={[a.self_start]}>
        <ButtonText>Criar live</ButtonText>
      </Button>
      {error && <Text style={[a.text_sm, {color: '#c2570c'}]}>{error}</Text>}
      {created && <StreamKeyNotice {...created} />}
    </View>
  )
}

function StreamKeyNotice({
  streamId,
  streamKey,
  ingestUrl,
}: {
  streamId: string
  streamKey: string
  ingestUrl: string
}) {
  const t = useTheme()
  return (
    <View style={[a.gap_xs, a.p_md, a.rounded_md, t.atoms.bg_contrast_25]}>
      <Text style={[a.text_sm, a.font_bold]}>
        Guarde sua chave agora: ela não será mostrada de novo. Não compartilhe.
      </Text>
      <Text selectable style={[a.text_xs, {fontFamily: 'monospace'}]}>
        {streamKey}
      </Text>
      <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
        Transmita com um encoder que envie HLS por HTTP PUT, por exemplo:
      </Text>
      <Text selectable style={[a.text_xs, {fontFamily: 'monospace'}]}>
        {`ffmpeg -re -i entrada.mp4 -c:v libx264 -g 60 -c:a aac -f hls -hls_time 2 -method PUT ${ADULT_API_URL}${ingestUrl}`}
      </Text>
      <Link
        to={`/adult/live/${streamId}`}
        label="Abrir a live"
        style={[a.self_start]}>
        <Text style={[a.text_sm, a.font_bold, {color: '#0b5cff'}]}>
          Abrir a live
        </Text>
      </Link>
    </View>
  )
}

// ------------------------------------------------------------ stream page

type Detail = {
  stream: {
    id: string
    title: string
    description: string | null
    status: string
    accessPolicy: string
    chatEnabled: boolean
    slowModeSeconds: number
  }
  access: AdultAccessDecision
  isOwner: boolean
  viewerCount: number
  offers: AdultOffer[]
}

export function AdultLiveStreamScreen({
  route,
}: NativeStackScreenProps<CommonNavigatorParams, 'AdultLiveStream'>) {
  return (
    <AdultShell title="Live +18" testID="adultLiveStreamScreen">
      <LiveStream id={route.params.streamId} />
    </AdultShell>
  )
}

function LiveStream({id}: {id: string}) {
  const t = useTheme()
  const agent = useAgent()
  const qc = useQueryClient()
  const [viewers, setViewers] = useState<number | null>(null)
  const [pendingRef, setPendingRef] = useState<string | null>(null)
  const [newKey, setNewKey] = useState<{
    streamKey: string
    ingestUrl: string
  } | null>(null)
  const detail = useQuery({
    queryKey: adultQueryKey('live', 'detail', id, agent.session?.did),
    queryFn: () => adultApi<Detail>(agent, `/live/${id}`),
    refetchInterval: 10_000,
  })
  const d = detail.data
  const watching =
    !!d?.access.allowed &&
    (d.stream.status === 'LIVE' || d.stream.status === 'INTERRUPTED')

  // One heartbeat per viewer; the server counts distinct viewers, not requests.
  useEffect(() => {
    if (!watching) return
    const beat = () =>
      adultApi<{viewerCount: number}>(agent, `/live/${id}/heartbeat`, {
        method: 'POST',
        body: {},
      })
        .then(r => setViewers(r.viewerCount))
        .catch(() => {})
    beat()
    const timer = setInterval(beat, 15_000)
    return () => clearInterval(timer)
  }, [agent, id, watching])

  const authorize = useCallback(async () => {
    const r = await adultApi<{url: string}>(agent, `/live/${id}/playback`, {
      method: 'POST',
      body: {},
    })
    return adultMediaUrl(r.url)
  }, [agent, id])

  const refresh = () => qc.invalidateQueries({queryKey: adultQueryKey('live')})
  const ownerAction = async (path: string, body: unknown = {}) => {
    const r = await adultApi(agent, `/live/${id}/${path}`, {
      method: 'POST',
      body,
    })
    refresh()
    return r
  }
  const buy = async (offerId: string) => {
    const order = await adultApi<{checkoutUrl: string}>(agent, '/checkout', {
      method: 'POST',
      body: {offerId, idempotencyKey: newIdempotencyKey()},
    })
    if (order.checkoutUrl.startsWith('/dev/mock-checkout/'))
      setPendingRef(order.checkoutUrl.split('/').pop()!)
  }
  const completeTestPayment = async () => {
    if (!pendingRef) return
    await adultApi(agent, `/dev/mock-checkout/${pendingRef}/complete`, {
      method: 'POST',
      body: {outcome: 'succeed'},
    })
    setPendingRef(null)
    refresh()
  }

  if (detail.error)
    return (
      <View style={a.p_md}>
        <AdultApiNotice error={detail.error} onRetry={() => detail.refetch()} />
      </View>
    )
  if (!d) return <Text style={[a.p_lg]}>Carregando…</Text>

  return (
    <View style={[a.p_md, a.gap_lg]}>
      {watching ? (
        <AdultPlayer authorize={authorize} autoPlay />
      ) : (
        <View
          style={[
            a.p_lg,
            a.rounded_md,
            a.align_center,
            t.atoms.bg_contrast_25,
            {aspectRatio: 16 / 9, justifyContent: 'center'},
          ]}>
          <Text style={[a.text_md, a.text_center]}>
            {!d.access.allowed
              ? d.access.reason === 'purchase_required'
                ? 'Live paga (PPV). Desbloqueie para assistir.'
                : d.access.reason === 'not_subscribed'
                  ? 'Live para assinantes.'
                  : 'Acesso restrito.'
              : (STATUS_LABEL[d.stream.status] ?? d.stream.status)}
          </Text>
        </View>
      )}

      <View style={[a.gap_xs]}>
        <Text style={[a.text_xl, a.font_bold]}>{d.stream.title}</Text>
        <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
          {`${STATUS_LABEL[d.stream.status] ?? d.stream.status} · ${viewers ?? d.viewerCount} assistindo`}
        </Text>
        {!!d.stream.description && (
          <Text style={[a.text_md]}>{d.stream.description}</Text>
        )}
      </View>

      {!d.access.allowed && d.offers.length > 0 && (
        <View style={[a.gap_sm]}>
          {d.offers.map(o => (
            <Button
              key={o.id}
              label="Desbloquear live"
              size="small"
              color="primary"
              onPress={() => buy(o.id)}
              style={[a.self_start]}>
              <ButtonText>{`Desbloquear · ${formatMinor(o.priceMinor, o.currency)}${o.accessHours ? ` · ${o.accessHours}h` : ''}`}</ButtonText>
            </Button>
          ))}
          {pendingRef && (
            <Button
              label="Confirmar pagamento de teste"
              size="small"
              color="secondary"
              onPress={completeTestPayment}
              style={[a.self_start]}>
              <ButtonText>Confirmar pagamento de teste (DEV)</ButtonText>
            </Button>
          )}
        </View>
      )}

      {d.isOwner && (
        <View style={[a.gap_sm, a.p_md, a.rounded_md, t.atoms.bg_contrast_25]}>
          <Text style={[a.text_md, a.font_bold]}>Controles da live</Text>
          <View style={[a.flex_row, a.flex_wrap, a.gap_sm]}>
            {['SCHEDULED', 'INTERRUPTED'].includes(d.stream.status) && (
              <Button
                label="Iniciar"
                size="small"
                color="primary"
                onPress={() => ownerAction('start')}>
                <ButtonText>Iniciar</ButtonText>
              </Button>
            )}
            {['STARTING', 'LIVE', 'INTERRUPTED'].includes(d.stream.status) && (
              <>
                <Button
                  label="Encerrar e gravar"
                  size="small"
                  color="secondary"
                  onPress={() => ownerAction('end', {record: true})}>
                  <ButtonText>Encerrar e gravar</ButtonText>
                </Button>
                <Button
                  label="Encerrar sem gravar"
                  size="small"
                  color="secondary"
                  onPress={() => ownerAction('end', {record: false})}>
                  <ButtonText>Encerrar sem gravar</ButtonText>
                </Button>
              </>
            )}
            <Button
              label="Trocar chave"
              size="small"
              color="secondary"
              onPress={async () =>
                setNewKey(
                  await adultApi(agent, `/live/${id}/rotate-key`, {
                    method: 'POST',
                    body: {},
                  }),
                )
              }>
              <ButtonText>Trocar chave</ButtonText>
            </Button>
          </View>
          {newKey && <StreamKeyNotice streamId={id} {...newKey} />}
        </View>
      )}

      {watching && d.stream.chatEnabled && (
        <Chat id={id} slowModeSeconds={d.stream.slowModeSeconds} />
      )}
      <Report id={id} />
    </View>
  )
}

function Chat({id, slowModeSeconds}: {id: string; slowModeSeconds: number}) {
  const t = useTheme()
  const agent = useAgent()
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const chat = useQuery({
    queryKey: adultQueryKey('live', 'chat', id, agent.session?.did),
    queryFn: () =>
      adultApi<{messages: {id: string; author_did: string; body: string}[]}>(
        agent,
        `/live/${id}/chat`,
      ),
    refetchInterval: 3_000,
  })
  const send = async () => {
    setError(null)
    try {
      await adultApi(agent, `/live/${id}/chat`, {
        method: 'POST',
        body: {body: text},
      })
      setText('')
      chat.refetch()
    } catch (e: any) {
      setError(
        e?.code === 'slow_mode'
          ? `Modo lento: aguarde ${slowModeSeconds}s entre mensagens.`
          : e?.code === 'muted'
            ? 'Você está silenciado neste chat.'
            : 'Mensagem não enviada.',
      )
    }
  }
  return (
    <View style={[a.gap_sm]}>
      <Text style={[a.text_lg, a.font_bold]}>Chat</Text>
      <View style={[a.gap_xs]}>
        {chat.data?.messages.map(m => (
          <Text key={m.id} style={[a.text_sm]}>
            <Text
              style={[
                a.font_bold,
                t.atoms.text_contrast_medium,
              ]}>{`${m.author_did.slice(-6)}: `}</Text>
            {m.body}
          </Text>
        ))}
      </View>
      <View style={[a.flex_row, a.gap_sm]}>
        <TextInput
          value={text}
          onChangeText={setText}
          maxLength={500}
          placeholder="Escreva no chat"
          accessibilityLabel="Mensagem do chat"
          accessibilityHint=""
          onSubmitEditing={send}
          style={[
            a.flex_1,
            a.border,
            a.rounded_sm,
            a.p_sm,
            t.atoms.text,
            t.atoms.border_contrast_low,
          ]}
        />
        <Button
          label="Enviar"
          size="small"
          color="primary"
          disabled={!text.trim()}
          onPress={send}>
          <ButtonText>Enviar</ButtonText>
        </Button>
      </View>
      {error && <Text style={[a.text_xs, {color: '#c2570c'}]}>{error}</Text>}
    </View>
  )
}

function Report({id}: {id: string}) {
  const t = useTheme()
  const agent = useAgent()
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const report = async (reason: string) => {
    try {
      await adultApi(agent, `/live/${id}/report`, {
        method: 'POST',
        body: {reason},
      })
      setDone('Denúncia enviada. Obrigado.')
    } catch (e: any) {
      setDone(
        e?.code === 'already_reported'
          ? 'Você já denunciou esta live recentemente.'
          : 'Não foi possível enviar.',
      )
    }
    setOpen(false)
  }
  return (
    <View style={[a.gap_xs]}>
      <Button
        label="Denunciar live"
        size="tiny"
        color="secondary"
        variant="ghost"
        onPress={() => setOpen(!open)}
        style={[a.self_start]}>
        <ButtonText>Denunciar</ButtonText>
      </Button>
      {open && (
        <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
          {REPORT_REASONS.map(([value, label]) => (
            <Button
              key={value}
              label={label}
              size="tiny"
              color="secondary"
              onPress={() => report(value)}>
              <ButtonText>{label}</ButtonText>
            </Button>
          ))}
        </View>
      )}
      {done && (
        <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>{done}</Text>
      )}
    </View>
  )
}
