import {useState} from 'react'
import {TextInput, View} from 'react-native'
import {useQuery, useQueryClient} from '@tanstack/react-query'

import {adultApi, AdultApiError, formatMinor} from '#/lib/adult/api'
import {adultQueryKey} from '#/lib/adult/isolation'
import {useAgent} from '#/state/session'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Layout from '#/components/Layout'
import {Text} from '#/components/Typography'
import {AdultShell} from './AdultShell'
import {AdultApiNotice, POLICY_LABELS} from './AdultViews'

/**
 * FASE 13 — Creator & Studio Dashboard. Everything shown here is decided by
 * aqua-adult-api: tabs the role can't use are hidden for convenience only,
 * and every action is re-authorized on the server.
 */

type Permission =
  | 'manageTeam'
  | 'viewTeam'
  | 'sell'
  | 'editTitles'
  | 'viewContent'
  | 'viewRevenue'
  | 'viewAnalytics'
  | 'viewSafety'
  | 'managePayouts'

type SellerRef = {kind: 'creator'} | {kind: 'studio'; id: string; name: string}

type Home = {
  seller: {
    type: 'creator' | 'studio'
    role: string
    permissions: Permission[]
    handle?: string
    name?: string
    verification?: string
  }
  content: Record<string, any> | null
  media: Record<string, number> | null
  subscriptions: {
    enabled: boolean
    activeSubscribers: number
    activeTiers: number
  } | null
  offers: {
    activeOffers: Record<string, number>
    paidOrders: number
  } | null
  revenue: Record<string, Record<string, string>> | null
  live: Record<string, number> | null
  safety: {contentUnderModeration: number; liveReportsLast30Days: number} | null
}

type Tab =
  | 'home'
  | 'content'
  | 'media'
  | 'subscriptions'
  | 'offers'
  | 'analytics'
  | 'revenue'
  | 'payouts'
  | 'live'
  | 'safety'
  | 'team'

const TABS: {
  tab: Tab
  label: string
  need?: Permission
  studioOnly?: boolean
}[] = [
  {tab: 'home', label: 'Início'},
  {tab: 'content', label: 'Conteúdo', need: 'viewContent'},
  {tab: 'media', label: 'Mídia', need: 'viewContent'},
  {tab: 'subscriptions', label: 'Assinaturas', need: 'sell'},
  {tab: 'offers', label: 'PPV', need: 'sell'},
  {tab: 'analytics', label: 'Analytics', need: 'viewAnalytics'},
  {tab: 'revenue', label: 'Receita', need: 'viewRevenue'},
  {tab: 'payouts', label: 'Payouts', need: 'viewRevenue'},
  {tab: 'live', label: 'Live', need: 'viewContent'},
  {tab: 'safety', label: 'Safety', need: 'viewSafety'},
  {tab: 'team', label: 'Equipe', need: 'viewTeam', studioOnly: true},
]

const ROLE_LABEL: Record<string, string> = {
  CREATOR: 'Creator',
  OWNER: 'Dono',
  ADMIN: 'Admin',
  EDITOR: 'Editor',
  ANALYST: 'Analista',
  MODERATOR: 'Moderador',
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Rascunho',
  scheduled: 'Agendado',
  published: 'Publicado',
  archived: 'Arquivado',
  unavailable: 'Indisponível',
  quarantined: 'Em quarentena',
  removed: 'Removido',
  uploading: 'Enviando',
  processing: 'Processando',
  ready: 'Pronto',
  failed: 'Falhou',
  REQUESTED: 'Solicitado',
  APPROVED: 'Aprovado',
  REJECTED: 'Recusado',
  CANCELLED: 'Cancelado',
  PAID: 'Pago',
  FAILED: 'Falhou',
  PENDING_PROVIDER: 'Aguardando provedor',
  PENDING_VERIFICATION: 'Em verificação',
  VERIFIED: 'Verificada',
  DISABLED: 'Desativada',
  SCHEDULED: 'Agendada',
  LIVE: 'Ao vivo',
  ENDED: 'Encerrada',
  INTERRUPTED: 'Interrompida',
  QUARANTINED: 'Em quarentena',
  REMOVED: 'Removida',
}

/** Human messages for the API's stable error codes. */
const ERROR_LABEL: Record<string, string> = {
  offer_required: 'Conteúdo pago precisa de preço. Nada foi publicado.',
  offer_kind_mismatch:
    'Esse tipo de oferta não libera essa política de acesso.',
  offer_not_applicable: 'Conteúdo sem cobrança avulsa não leva preço.',
  invalid_amount: 'Valor inválido.',
  invalid_tier: 'Escolha um nível de assinatura seu.',
  access_hours_required: 'Informe por quantas horas o acesso vale.',
  publish_at_required: 'Informe a data de publicação.',
  publish_at_in_past: 'A data de publicação precisa estar no futuro.',
  media_not_ready: 'A mídia ainda não está pronta.',
  under_moderation: 'Item em moderação: você não pode alterá-lo.',
  no_active_tier: 'Crie ou ative um nível antes de ligar as assinaturas.',
  payout_account_not_verified:
    'A conta de recebimento ainda não foi verificada.',
  insufficient_available_balance: 'Saldo disponível insuficiente.',
  insufficient_role: 'Sua função no studio não permite essa ação.',
  not_seller: 'Você não pode vender por este perfil.',
  studio_not_verified: 'O studio ainda não foi verificado.',
  invalid_request: 'Dados inválidos.',
}

const errorText = (e: unknown) =>
  e instanceof AdultApiError
    ? (ERROR_LABEL[e.code] ?? `Não foi possível concluir (${e.code}).`)
    : 'Não foi possível concluir.'

/** "19,90" → "1990". Integer math only; null when not a valid amount. */
export function parsePriceInput(text: string, currency: string) {
  const digits = currency === 'JPY' ? 0 : 2
  const m = text.trim().match(/^(\d{1,9})(?:[.,](\d{1,2}))?$/)
  if (!m || (digits === 0 && m[2])) return null
  const minor = m[1] + (m[2] ?? '').padEnd(digits, '0')
  return minor.replace(/^0+(?=\d)/, '')
}

const date = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString('pt-BR') : '—'

export function AdultCreatorDashboardScreen() {
  return (
    <AdultShell title="Creator Dashboard" testID="adultCreatorDashboardScreen">
      <Layout.Content>
        <Dashboard />
      </Layout.Content>
    </AdultShell>
  )
}

function Dashboard() {
  const t = useTheme()
  const agent = useAgent()
  const did = agent.session?.did
  const qc = useQueryClient()
  const [seller, setSeller] = useState<SellerRef>({kind: 'creator'})
  const [tab, setTab] = useState<Tab>('home')

  const studios = useQuery({
    queryKey: adultQueryKey('dashboard', did, 'studios'),
    queryFn: () =>
      adultApi<{studios: {id: string; name: string; role: string}[]}>(
        agent,
        '/dashboard/studios',
      ),
  })
  const base =
    seller.kind === 'creator'
      ? '/dashboard/creator'
      : `/dashboard/studios/${seller.id}`
  const home = useQuery({
    queryKey: adultQueryKey('dashboard', did, base, 'home'),
    queryFn: () => adultApi<Home>(agent, base),
    retry: false,
  })

  const pick = (s: SellerRef) => {
    setSeller(s)
    setTab('home')
  }

  const notCreator =
    home.error instanceof AdultApiError &&
    home.error.code === 'creator_not_approved'

  return (
    <View style={[a.p_md, a.gap_lg]}>
      <View style={[a.flex_row, a.flex_wrap, a.gap_sm]}>
        <Chip
          label="Creator"
          selected={seller.kind === 'creator'}
          onPress={() => pick({kind: 'creator'})}
        />
        {studios.data?.studios.map(s => (
          <Chip
            key={s.id}
            label={`${s.name} · ${ROLE_LABEL[s.role] ?? s.role}`}
            selected={seller.kind === 'studio' && seller.id === s.id}
            onPress={() => pick({kind: 'studio', id: s.id, name: s.name})}
          />
        ))}
      </View>

      {notCreator ? (
        <NotCreator
          hasStudios={!!studios.data?.studios.length}
          onApproved={() =>
            qc.invalidateQueries({queryKey: adultQueryKey('dashboard')})
          }
        />
      ) : home.error ? (
        <AdultApiNotice error={home.error} onRetry={() => home.refetch()} />
      ) : !home.data ? (
        <Text style={[t.atoms.text_contrast_medium]}>Carregando…</Text>
      ) : (
        <>
          <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
            {seller.kind === 'studio'
              ? `${home.data.seller.name} · função: ${ROLE_LABEL[home.data.seller.role]}`
              : `@${home.data.seller.handle ?? 'creator'}`}
            {home.data.seller.verification &&
            home.data.seller.verification !== 'verified'
              ? ' · studio ainda não verificado'
              : ''}
          </Text>
          <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
            {TABS.filter(
              x =>
                (!x.need || home.data.seller.permissions.includes(x.need)) &&
                (!x.studioOnly || seller.kind === 'studio'),
            ).map(x => (
              <Chip
                key={x.tab}
                label={x.label}
                selected={tab === x.tab}
                onPress={() => setTab(x.tab)}
              />
            ))}
          </View>
          <TabBody tab={tab} base={base} home={home.data} seller={seller} />
        </>
      )}
    </View>
  )
}

function NotCreator({
  hasStudios,
  onApproved,
}: {
  hasStudios: boolean
  onApproved: () => void
}) {
  const t = useTheme()
  const agent = useAgent()
  return (
    <View style={[a.p_lg, a.gap_md, a.rounded_md, t.atoms.bg_contrast_25]}>
      <Text style={[a.text_md]}>
        O dashboard é para creators aprovados
        {hasStudios ? ' — ou escolha um dos seus studios acima.' : '.'}
      </Text>
      {__DEV__ && (
        <Button
          label="Simular aprovação de creator (desenvolvimento)"
          size="small"
          color="primary"
          onPress={async () => {
            await adultApi(agent, '/dev/creator-approval', {
              method: 'POST',
              body: {handle: agent.session?.handle},
            })
            onApproved()
          }}>
          <ButtonText>Simular aprovação (DEV)</ButtonText>
        </Button>
      )}
    </View>
  )
}

function TabBody({
  tab,
  base,
  home,
  seller,
}: {
  tab: Tab
  base: string
  home: Home
  seller: SellerRef
}) {
  switch (tab) {
    case 'content':
      return <ContentTab base={base} home={home} seller={seller} />
    case 'media':
      return <MediaTab base={base} />
    case 'subscriptions':
      return <SubscriptionsTab base={base} seller={seller} />
    case 'offers':
      return <OffersTab base={base} />
    case 'analytics':
      return <AnalyticsTab base={base} />
    case 'revenue':
      return <RevenueTab base={base} />
    case 'payouts':
      return <PayoutsTab base={base} home={home} />
    case 'live':
      return <LiveTab base={base} />
    case 'safety':
      return <SafetyTab base={base} />
    case 'team':
      return <TeamTab base={base} />
    default:
      return <HomeTab home={home} />
  }
}

// ---------------------------------------------------------------- shared UI

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string
  selected: boolean
  onPress: () => void
}) {
  return (
    <Button
      label={label}
      size="small"
      variant="solid"
      color={selected ? 'primary' : 'secondary'}
      onPress={onPress}>
      <ButtonText>{label}</ButtonText>
    </Button>
  )
}

function Stat({label, value}: {label: string; value: string | number}) {
  const t = useTheme()
  return (
    <View
      style={[
        a.p_md,
        a.rounded_md,
        a.border,
        a.gap_xs,
        t.atoms.border_contrast_low,
        t.atoms.bg_contrast_25,
        {flexGrow: 1, flexBasis: 140},
      ]}>
      <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>{label}</Text>
      <Text style={[a.text_lg, a.font_bold]}>{value}</Text>
    </View>
  )
}

function Stats({children}: {children: React.ReactNode}) {
  return <View style={[a.flex_row, a.flex_wrap, a.gap_sm]}>{children}</View>
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <View style={[a.gap_sm]}>
      <Text style={[a.text_lg, a.font_bold]}>{title}</Text>
      {children}
    </View>
  )
}

function EmptyText({children}: {children: React.ReactNode}) {
  const t = useTheme()
  return (
    <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>{children}</Text>
  )
}

function Row({children}: {children: React.ReactNode}) {
  const t = useTheme()
  return (
    <View
      style={[
        a.p_sm,
        a.rounded_sm,
        a.border,
        a.gap_xs,
        t.atoms.border_contrast_low,
      ]}>
      {children}
    </View>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const t = useTheme()
  return (
    <View style={[a.gap_xs]}>
      <Text style={[a.text_sm, a.font_semi_bold]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        accessibilityLabel={label}
        accessibilityHint=""
        style={[
          a.border,
          a.rounded_sm,
          a.p_sm,
          t.atoms.text,
          t.atoms.border_contrast_low,
        ]}
      />
    </View>
  )
}

function ErrorText({error}: {error: unknown}) {
  if (!error) return null
  return <Text style={[a.text_sm, {color: '#c2570c'}]}>{errorText(error)}</Text>
}

function useSection<T>(base: string, path: string) {
  const agent = useAgent()
  return useQuery({
    queryKey: adultQueryKey('dashboard', agent.session?.did, base, path),
    queryFn: () => adultApi<T>(agent, `${base}${path}`),
    retry: false,
  })
}

/** Runs an API action and refreshes every dashboard query afterwards. */
function useAction() {
  const agent = useAgent()
  const qc = useQueryClient()
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const run = async (path: string, method: string, body: unknown = {}) => {
    setBusy(true)
    setError(null)
    try {
      const result = await adultApi(agent, path, {method, body})
      await qc.invalidateQueries({queryKey: adultQueryKey('dashboard')})
      return result
    } catch (e) {
      setError(e)
      return undefined
    } finally {
      setBusy(false)
    }
  }
  return {run, error, busy}
}

function Loading<T>({
  q,
  children,
}: {
  q: {data?: T; error: unknown; refetch: () => unknown}
  children: (data: T) => React.ReactNode
}) {
  const t = useTheme()
  if (q.error)
    return <AdultApiNotice error={q.error} onRetry={() => q.refetch()} />
  if (!q.data)
    return <Text style={[t.atoms.text_contrast_medium]}>Carregando…</Text>
  return <>{children(q.data)}</>
}

const sum = (o: Record<string, number> | null | undefined) =>
  Object.values(o ?? {}).reduce((x, y) => x + y, 0)

// ---------------------------------------------------------------- home

function HomeTab({home}: {home: Home}) {
  const brl = home.revenue?.BRL
  return (
    <View style={[a.gap_lg]}>
      {home.content && (
        <Section title="Conteúdo">
          <Stats>
            {home.seller.type === 'creator' ? (
              <>
                <Stat label="Vídeos" value={sum(home.content.videos)} />
                <Stat
                  label="Publicados"
                  value={home.content.videos?.published ?? 0}
                />
                <Stat
                  label="Rascunhos"
                  value={home.content.videos?.draft ?? 0}
                />
                <Stat label="Posts +18" value={sum(home.content.posts)} />
              </>
            ) : (
              <>
                <Stat label="Filmes" value={sum(home.content.movies)} />
                <Stat label="Séries" value={sum(home.content.series)} />
                <Stat label="Episódios" value={home.content.episodes ?? 0} />
                <Stat label="Coleções" value={home.content.collections ?? 0} />
              </>
            )}
          </Stats>
        </Section>
      )}
      {home.media && (
        <Section title="Mídia">
          <Stats>
            <Stat label="Prontas" value={home.media.ready} />
            <Stat
              label="Processando"
              value={home.media.processing + home.media.uploading}
            />
            <Stat label="Falharam" value={home.media.failed} />
            <Stat label="Em quarentena" value={home.media.quarantined} />
          </Stats>
        </Section>
      )}
      {(home.subscriptions || home.offers) && (
        <Section title="Vendas">
          <Stats>
            {home.subscriptions && (
              <>
                <Stat
                  label="Assinantes ativos"
                  value={home.subscriptions.activeSubscribers}
                />
                <Stat
                  label="Níveis ativos"
                  value={home.subscriptions.activeTiers}
                />
                <Stat
                  label="Assinaturas"
                  value={home.subscriptions.enabled ? 'Ligadas' : 'Desligadas'}
                />
              </>
            )}
            {home.offers && (
              <>
                <Stat
                  label="Ofertas PPV"
                  value={home.offers.activeOffers.ppv ?? 0}
                />
                <Stat label="Pedidos pagos" value={home.offers.paidOrders} />
              </>
            )}
          </Stats>
        </Section>
      )}
      {home.revenue && (
        <Section title="Receita (BRL)">
          <Stats>
            <Stat label="Líquido" value={formatMinor(brl?.net ?? '0', 'BRL')} />
            <Stat
              label="Disponível"
              value={formatMinor(brl?.available ?? '0', 'BRL')}
            />
            <Stat
              label="Pendente"
              value={formatMinor(brl?.pending ?? '0', 'BRL')}
            />
          </Stats>
        </Section>
      )}
      {home.live && (
        <Section title="Live">
          <Stats>
            <Stat label="Ao vivo agora" value={home.live.LIVE ?? 0} />
            <Stat label="Agendadas" value={home.live.SCHEDULED ?? 0} />
            <Stat label="Encerradas" value={home.live.ENDED ?? 0} />
          </Stats>
        </Section>
      )}
      {home.safety && (
        <Section title="Safety">
          <Stats>
            <Stat
              label="Em moderação"
              value={home.safety.contentUnderModeration}
            />
            <Stat
              label="Denúncias em lives (30 dias)"
              value={home.safety.liveReportsLast30Days}
            />
          </Stats>
        </Section>
      )}
    </View>
  )
}

// ---------------------------------------------------------------- content

type VideoRow = {
  id: string
  title: string
  status: string
  accessPolicy: string
  mediaStatus: string
  viewCount: string
  scheduledAt: string | null
  offers: {kind: string; priceMinor: string; currency: string}[]
}

function ContentTab({
  base,
  home,
  seller,
}: {
  base: string
  home: Home
  seller: SellerRef
}) {
  const [section, setSection] = useState('all')
  const q = useSection<Record<string, any[]>>(
    base,
    `/content?section=${section}`,
  )
  const act = useAction()
  const [creating, setCreating] = useState(false)
  const sections =
    seller.kind === 'creator'
      ? [
          ['all', 'Tudo'],
          ['videos', 'Vídeos'],
          ['posts', 'Posts'],
          ['collections', 'Coleções'],
          ['drafts', 'Rascunhos'],
          ['scheduled', 'Agendados'],
          ['archived', 'Arquivados'],
        ]
      : [
          ['all', 'Tudo'],
          ['titles', 'Títulos'],
          ['collections', 'Coleções'],
          ['drafts', 'Rascunhos'],
          ['scheduled', 'Agendados'],
          ['archived', 'Arquivados'],
        ]
  return (
    <View style={[a.gap_md]}>
      <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
        {sections.map(([key, label]) => (
          <Chip
            key={key}
            label={label}
            selected={section === key}
            onPress={() => setSection(key)}
          />
        ))}
      </View>
      {seller.kind === 'creator' && (
        <Button
          label={creating ? 'Fechar' : 'Novo vídeo'}
          size="small"
          color="primary"
          onPress={() => setCreating(v => !v)}>
          <ButtonText>{creating ? 'Fechar' : 'Novo vídeo'}</ButtonText>
        </Button>
      )}
      {creating && <NewVideo base={base} onDone={() => setCreating(false)} />}
      <ErrorText error={act.error} />
      <Loading q={q}>
        {data => (
          <View style={[a.gap_md]}>
            {data.videos && (
              <Section title="Vídeos">
                {!data.videos.length && (
                  <EmptyText>Nenhum vídeo aqui.</EmptyText>
                )}
                {(data.videos as VideoRow[]).map(v => (
                  <Row key={v.id}>
                    <Text style={[a.font_bold]}>{v.title}</Text>
                    <Text style={[a.text_sm]}>
                      {STATUS_LABEL[v.status] ?? v.status} ·{' '}
                      {POLICY_LABELS[v.accessPolicy] ?? v.accessPolicy} · mídia{' '}
                      {STATUS_LABEL[v.mediaStatus] ?? v.mediaStatus} ·{' '}
                      {v.viewCount} views
                      {v.scheduledAt && v.status === 'scheduled'
                        ? ` · publica em ${date(v.scheduledAt)}`
                        : ''}
                      {v.offers.map(
                        o =>
                          ` · ${o.kind.toUpperCase()} ${formatMinor(o.priceMinor, o.currency)}`,
                      )}
                    </Text>
                    {!['quarantined', 'removed'].includes(v.status) && (
                      <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
                        {v.status !== 'published' && (
                          <Button
                            label="Publicar"
                            size="tiny"
                            color="primary"
                            disabled={act.busy || v.mediaStatus !== 'ready'}
                            onPress={() =>
                              act.run(`/creator/videos/${v.id}`, 'PATCH', {
                                status: 'published',
                              })
                            }>
                            <ButtonText>Publicar</ButtonText>
                          </Button>
                        )}
                        {v.status !== 'draft' && (
                          <Button
                            label="Voltar a rascunho"
                            size="tiny"
                            color="secondary"
                            disabled={act.busy}
                            onPress={() =>
                              act.run(`/creator/videos/${v.id}`, 'PATCH', {
                                status: 'draft',
                              })
                            }>
                            <ButtonText>Rascunho</ButtonText>
                          </Button>
                        )}
                        {v.status !== 'archived' && (
                          <Button
                            label="Arquivar"
                            size="tiny"
                            color="secondary"
                            disabled={act.busy}
                            onPress={() =>
                              act.run(`/creator/videos/${v.id}`, 'PATCH', {
                                status: 'archived',
                              })
                            }>
                            <ButtonText>Arquivar</ButtonText>
                          </Button>
                        )}
                      </View>
                    )}
                  </Row>
                ))}
              </Section>
            )}
            {data.posts && (
              <Section title="Posts +18">
                {!data.posts.length && (
                  <EmptyText>
                    Nenhum post com política de acesso registrada.
                  </EmptyText>
                )}
                {data.posts.map((p: any) => (
                  <Row key={p.uri}>
                    <Text style={[a.text_sm]} numberOfLines={1}>
                      {p.uri}
                    </Text>
                    <Text style={[a.text_sm]}>
                      {STATUS_LABEL[p.status] ?? p.status} ·{' '}
                      {POLICY_LABELS[p.accessPolicy] ?? p.accessPolicy}
                    </Text>
                  </Row>
                ))}
              </Section>
            )}
            {data.movies && (
              <StudioTitles
                movies={data.movies}
                series={data.series ?? []}
                home={home}
              />
            )}
            {data.collections && (
              <Section title="Coleções">
                {!data.collections.length && (
                  <EmptyText>Nenhuma coleção.</EmptyText>
                )}
                {data.collections.map((c: any) => (
                  <Row key={c.id}>
                    <Text style={[a.font_bold]}>{c.title}</Text>
                    <Text style={[a.text_sm]}>
                      {STATUS_LABEL[c.status] ?? c.status} · {c.items} itens ·{' '}
                      {POLICY_LABELS[c.accessPolicy] ?? c.accessPolicy}
                    </Text>
                  </Row>
                ))}
              </Section>
            )}
          </View>
        )}
      </Loading>
    </View>
  )
}

function StudioTitles({
  movies,
  series,
  home,
}: {
  movies: any[]
  series: any[]
  home: Home
}) {
  const act = useAction()
  const canEdit = home.seller.permissions.includes('editTitles')
  const status = (type: string, id: string, next: string) =>
    act.run(`/studio-titles/${type}/${id}`, 'PATCH', {status: next})
  const line = (x: any) =>
    `${STATUS_LABEL[x.status] ?? x.status} · ${POLICY_LABELS[x.accessPolicy] ?? x.accessPolicy}` +
    (x.releaseDate
      ? ` · lançamento ${String(x.releaseDate).slice(0, 10)}`
      : '') +
    (x.availabilityStart ? ` · de ${date(x.availabilityStart)}` : '') +
    (x.availabilityEnd ? ` até ${date(x.availabilityEnd)}` : '') +
    ` · ${x.credits} créditos`
  const actions = (type: string, x: any) =>
    canEdit && !['quarantined', 'removed'].includes(x.status) ? (
      <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
        {x.status !== 'published' && (
          <Button
            label="Publicar"
            size="tiny"
            color="primary"
            disabled={act.busy}
            onPress={() => status(type, x.id, 'published')}>
            <ButtonText>Publicar</ButtonText>
          </Button>
        )}
        {x.status !== 'archived' && (
          <Button
            label="Arquivar"
            size="tiny"
            color="secondary"
            disabled={act.busy}
            onPress={() => status(type, x.id, 'archived')}>
            <ButtonText>Arquivar</ButtonText>
          </Button>
        )}
      </View>
    ) : null
  return (
    <View style={[a.gap_md]}>
      <ErrorText error={act.error} />
      <Section title="Filmes">
        {!movies.length && <EmptyText>Nenhum filme.</EmptyText>}
        {movies.map(m => (
          <Row key={m.id}>
            <Text style={[a.font_bold]}>{m.title}</Text>
            <Text style={[a.text_sm]}>
              {line(m)} · {m.viewCount} views
            </Text>
            {actions('movie', m)}
          </Row>
        ))}
      </Section>
      <Section title="Séries">
        {!series.length && <EmptyText>Nenhuma série.</EmptyText>}
        {series.map(s => (
          <Row key={s.id}>
            <Text style={[a.font_bold]}>{s.title}</Text>
            <Text style={[a.text_sm]}>
              {line(s)} · {s.seasons} temporadas · {s.episodes} episódios
            </Text>
            {actions('series', s)}
          </Row>
        ))}
      </Section>
    </View>
  )
}

const POLICY_CHOICES = [
  'free',
  'follower_only',
  'subscriber_only',
  'tier_required',
  'ppv_required',
  'purchase_required',
  'rental_required',
] as const
const PAID_KIND: Record<string, 'ppv' | 'purchase' | 'rental'> = {
  ppv_required: 'ppv',
  purchase_required: 'purchase',
  rental_required: 'rental',
}

function NewVideo({base, onDone}: {base: string; onDone: () => void}) {
  const t = useTheme()
  const media = useSection<{assets: any[]}>(base, '/media')
  const tiers = useSection<{tiers: any[]}>(base, '/subscriptions')
  const act = useAction()
  const [assetId, setAssetId] = useState<string>()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [policy, setPolicy] = useState<string>()
  const [tierId, setTierId] = useState<string>()
  const [price, setPrice] = useState('')
  const [hours, setHours] = useState('48')
  const [visibility, setVisibility] = useState<
    'draft' | 'published' | 'scheduled'
  >('draft')
  const [when, setWhen] = useState('')
  const [local, setLocal] = useState<string>()

  const videos = (media.data?.assets ?? []).filter(
    x => x.kind === 'video' && x.purpose === 'original',
  )
  const kind = policy ? PAID_KIND[policy] : undefined

  const submit = async () => {
    setLocal(undefined)
    // The server re-validates all of this; checks here only save a round trip.
    if (!assetId || !title.trim() || !policy)
      return setLocal('Escolha a mídia, o título e a política de acesso.')
    const body: Record<string, unknown> = {
      mediaAssetId: assetId,
      title: title.trim(),
      description: description.trim() || undefined,
      category: category.trim() || undefined,
      accessPolicy: policy,
      visibility,
    }
    if (policy === 'tier_required') body.requiredTierId = tierId
    if (kind) {
      const minor = parsePriceInput(price, 'BRL')
      if (!minor || minor === '0')
        return setLocal('Informe um preço válido (ex.: 19,90).')
      body.offer = {
        kind,
        priceMinor: minor,
        currency: 'BRL',
        accessHours:
          kind === 'purchase' ? undefined : Number(hours) || undefined,
      }
    }
    if (visibility === 'scheduled') {
      const at = new Date(when.trim().replace(' ', 'T'))
      if (Number.isNaN(at.getTime()))
        return setLocal('Data inválida. Use AAAA-MM-DD HH:MM.')
      body.publishAt = at.toISOString()
    }
    const ok = await act.run('/dashboard/creator/videos', 'POST', body)
    if (ok) onDone()
  }

  return (
    <View
      style={[
        a.p_md,
        a.gap_md,
        a.rounded_md,
        a.border,
        t.atoms.border_contrast_low,
      ]}>
      <Text style={[a.text_md, a.font_bold]}>Novo vídeo</Text>
      <Text style={[a.text_sm, a.font_semi_bold]}>
        Mídia (do AQUA Media Engine)
      </Text>
      {!videos.length && (
        <EmptyText>
          Nenhum vídeo enviado ainda. Envie um vídeo para ele aparecer aqui.
        </EmptyText>
      )}
      <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
        {videos.map(v => (
          <Chip
            key={v.id}
            label={`${v.id.slice(-6)} · ${STATUS_LABEL[v.state] ?? v.state}`}
            selected={assetId === v.id}
            onPress={() => setAssetId(v.id)}
          />
        ))}
      </View>
      <Field label="Título" value={title} onChange={setTitle} />
      <Field label="Descrição" value={description} onChange={setDescription} />
      <Field label="Categoria" value={category} onChange={setCategory} />
      <Text style={[a.text_sm, a.font_semi_bold]}>Política de acesso</Text>
      <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
        {POLICY_CHOICES.map(p => (
          <Chip
            key={p}
            label={POLICY_LABELS[p]}
            selected={policy === p}
            onPress={() => setPolicy(p)}
          />
        ))}
      </View>
      {policy === 'tier_required' && (
        <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
          {!tiers.data?.tiers.length && (
            <EmptyText>Crie um nível na aba Assinaturas.</EmptyText>
          )}
          {tiers.data?.tiers
            .filter(x => x.active)
            .map(x => (
              <Chip
                key={x.id}
                label={x.name}
                selected={tierId === x.id}
                onPress={() => setTierId(x.id)}
              />
            ))}
        </View>
      )}
      {kind && (
        <>
          <Field
            label="Preço (BRL)"
            value={price}
            onChange={setPrice}
            placeholder="19,90"
          />
          {kind !== 'purchase' && (
            <Field
              label="Acesso por (horas)"
              value={hours}
              onChange={setHours}
            />
          )}
        </>
      )}
      <Text style={[a.text_sm, a.font_semi_bold]}>Publicação</Text>
      <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
        <Chip
          label="Rascunho"
          selected={visibility === 'draft'}
          onPress={() => setVisibility('draft')}
        />
        <Chip
          label="Publicar agora"
          selected={visibility === 'published'}
          onPress={() => setVisibility('published')}
        />
        <Chip
          label="Agendar"
          selected={visibility === 'scheduled'}
          onPress={() => setVisibility('scheduled')}
        />
      </View>
      {visibility === 'scheduled' && (
        <Field
          label="Publicar em"
          value={when}
          onChange={setWhen}
          placeholder="2026-10-01 20:00"
        />
      )}
      {local && <Text style={[a.text_sm, {color: '#c2570c'}]}>{local}</Text>}
      <ErrorText error={act.error} />
      <Button
        label="Salvar vídeo"
        size="small"
        color="primary"
        disabled={act.busy}
        onPress={submit}>
        <ButtonText>{act.busy ? 'Salvando…' : 'Salvar vídeo'}</ButtonText>
      </Button>
    </View>
  )
}

// ---------------------------------------------------------------- media

function MediaTab({base}: {base: string}) {
  const q = useSection<{summary: Record<string, number>; assets: any[]}>(
    base,
    '/media',
  )
  return (
    <Loading q={q}>
      {data => (
        <View style={[a.gap_md]}>
          <Stats>
            <Stat label="Enviando" value={data.summary.uploading} />
            <Stat label="Processando" value={data.summary.processing} />
            <Stat label="Prontas" value={data.summary.ready} />
            <Stat label="Falharam" value={data.summary.failed} />
            <Stat label="Em quarentena" value={data.summary.quarantined} />
            <Stat label="Removidas" value={data.summary.removed} />
          </Stats>
          {!data.assets.length && <EmptyText>Nenhuma mídia.</EmptyText>}
          {data.assets.map(m => (
            <Row key={m.id}>
              <Text style={[a.text_sm, a.font_bold]}>
                {m.kind} · {m.purpose} · {STATUS_LABEL[m.state] ?? m.state}
              </Text>
              <Text style={[a.text_xs]}>
                {m.id} ·{' '}
                {m.durationMs ? `${Math.round(m.durationMs / 1000)}s · ` : ''}
                {m.width && m.height ? `${m.width}×${m.height} · ` : ''}
                {date(m.createdAt)}
              </Text>
            </Row>
          ))}
        </View>
      )}
    </Loading>
  )
}

// ---------------------------------------------------------------- subscriptions

function SubscriptionsTab({base, seller}: {base: string; seller: SellerRef}) {
  const q = useSection<{
    enabled: boolean
    activeSubscribers: number
    tiers: any[]
  }>(base, '/subscriptions')
  const act = useAction()
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [period, setPeriod] = useState<'month' | 'year'>('month')
  const [local, setLocal] = useState<string>()
  const [repriceId, setRepriceId] = useState<string>()
  const [newPrice, setNewPrice] = useState('')

  const create = async () => {
    setLocal(undefined)
    const minor = parsePriceInput(price, 'BRL')
    if (!name.trim() || !minor || minor === '0')
      return setLocal('Informe nome e preço (ex.: 19,90).')
    const ok = await act.run('/creator/tiers', 'POST', {
      sellerType: seller.kind,
      sellerId: seller.kind === 'studio' ? seller.id : undefined,
      name: name.trim(),
      priceMinor: minor,
      currency: 'BRL',
      billingPeriod: period,
    })
    if (ok) {
      setName('')
      setPrice('')
    }
  }

  return (
    <Loading q={q}>
      {data => (
        <View style={[a.gap_md]}>
          <Stats>
            <Stat label="Assinantes ativos" value={data.activeSubscribers} />
            <Stat
              label="Assinaturas"
              value={data.enabled ? 'Ligadas' : 'Desligadas'}
            />
          </Stats>
          <Button
            label={data.enabled ? 'Desligar assinaturas' : 'Ligar assinaturas'}
            size="small"
            color={data.enabled ? 'secondary' : 'primary'}
            disabled={act.busy}
            onPress={() =>
              act.run(`${base}/settings`, 'PATCH', {
                subscriptionsEnabled: !data.enabled,
              })
            }>
            <ButtonText>
              {data.enabled ? 'Desligar assinaturas' : 'Ligar assinaturas'}
            </ButtonText>
          </Button>
          <EmptyText>
            Desligar impede novas assinaturas. Quem já assina continua com
            acesso até o fim do período pago.
          </EmptyText>
          <ErrorText error={act.error} />
          <Section title="Níveis">
            {!data.tiers.length && <EmptyText>Nenhum nível criado.</EmptyText>}
            {data.tiers.map(x => (
              <Row key={x.id}>
                <Text style={[a.font_bold]}>
                  {x.name} · {formatMinor(x.priceMinor, x.currency)}/
                  {x.billingPeriod === 'month' ? 'mês' : 'ano'}
                  {x.active ? '' : ' · inativo'}
                </Text>
                <Text style={[a.text_sm]}>
                  {x.activeSubscribers} ativos · {x.allTimeSubscriptions} no
                  total
                </Text>
                <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
                  <Button
                    label={x.active ? 'Desativar nível' : 'Ativar nível'}
                    size="tiny"
                    color="secondary"
                    disabled={act.busy}
                    onPress={() =>
                      act.run(`/creator/tiers/${x.id}`, 'PATCH', {
                        active: !x.active,
                      })
                    }>
                    <ButtonText>{x.active ? 'Desativar' : 'Ativar'}</ButtonText>
                  </Button>
                  <Button
                    label="Mudar preço"
                    size="tiny"
                    color="secondary"
                    onPress={() =>
                      setRepriceId(repriceId === x.id ? undefined : x.id)
                    }>
                    <ButtonText>Mudar preço</ButtonText>
                  </Button>
                </View>
                {repriceId === x.id && (
                  <View style={[a.gap_xs]}>
                    <Field
                      label="Novo preço (BRL)"
                      value={newPrice}
                      onChange={setNewPrice}
                      placeholder="24,90"
                    />
                    <EmptyText>
                      Vale para novas assinaturas. As atuais mantêm o preço
                      contratado.
                    </EmptyText>
                    <Button
                      label="Salvar preço"
                      size="tiny"
                      color="primary"
                      disabled={act.busy}
                      onPress={async () => {
                        const minor = parsePriceInput(newPrice, x.currency)
                        if (!minor || minor === '0') return
                        const ok = await act.run(
                          `/creator/tiers/${x.id}`,
                          'PATCH',
                          {priceMinor: minor},
                        )
                        if (ok) setRepriceId(undefined)
                      }}>
                      <ButtonText>Salvar</ButtonText>
                    </Button>
                  </View>
                )}
              </Row>
            ))}
          </Section>
          <Section title="Novo nível">
            <Field
              label="Nome"
              value={name}
              onChange={setName}
              placeholder="Gold"
            />
            <Field
              label="Preço (BRL)"
              value={price}
              onChange={setPrice}
              placeholder="19,90"
            />
            <View style={[a.flex_row, a.gap_xs]}>
              <Chip
                label="Mensal"
                selected={period === 'month'}
                onPress={() => setPeriod('month')}
              />
              <Chip
                label="Anual"
                selected={period === 'year'}
                onPress={() => setPeriod('year')}
              />
            </View>
            {local && (
              <Text style={[a.text_sm, {color: '#c2570c'}]}>{local}</Text>
            )}
            <Button
              label="Criar nível"
              size="small"
              color="primary"
              disabled={act.busy}
              onPress={create}>
              <ButtonText>Criar nível</ButtonText>
            </Button>
          </Section>
        </View>
      )}
    </Loading>
  )
}

// ---------------------------------------------------------------- PPV offers

function OffersTab({base}: {base: string}) {
  const q = useSection<{offers: any[]}>(base, '/offers')
  const act = useAction()
  const [editing, setEditing] = useState<string>()
  const [price, setPrice] = useState('')
  const KIND: Record<string, string> = {
    ppv: 'PPV',
    purchase: 'Compra',
    rental: 'Aluguel',
  }
  return (
    <Loading q={q}>
      {data => (
        <View style={[a.gap_md]}>
          <EmptyText>
            Novas ofertas nascem junto com o conteúdo. Mudar o preço cria uma
            oferta nova; pedidos antigos continuam com o valor pago.
          </EmptyText>
          <ErrorText error={act.error} />
          {!data.offers.length && <EmptyText>Nenhuma oferta.</EmptyText>}
          {data.offers.map(o => (
            <Row key={o.id}>
              <Text style={[a.font_bold]}>
                {KIND[o.kind] ?? o.kind} ·{' '}
                {formatMinor(o.priceMinor, o.currency)}
                {o.accessHours ? ` · ${o.accessHours}h` : ''}
                {o.active ? '' : ' · inativa'}
              </Text>
              <Text style={[a.text_sm]}>
                {o.resourceType} {o.resourceId} · {o.sales} vendas
              </Text>
              {o.active && (
                <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
                  <Button
                    label="Desativar oferta"
                    size="tiny"
                    color="secondary"
                    disabled={act.busy}
                    onPress={() =>
                      act.run(`/dashboard/offers/${o.id}`, 'PATCH', {
                        active: false,
                      })
                    }>
                    <ButtonText>Desativar</ButtonText>
                  </Button>
                  <Button
                    label="Mudar preço"
                    size="tiny"
                    color="secondary"
                    onPress={() =>
                      setEditing(editing === o.id ? undefined : o.id)
                    }>
                    <ButtonText>Mudar preço</ButtonText>
                  </Button>
                </View>
              )}
              {editing === o.id && (
                <View style={[a.gap_xs]}>
                  <Field
                    label="Novo preço"
                    value={price}
                    onChange={setPrice}
                    placeholder="9,90"
                  />
                  <Button
                    label="Salvar preço"
                    size="tiny"
                    color="primary"
                    disabled={act.busy}
                    onPress={async () => {
                      const minor = parsePriceInput(price, o.currency)
                      if (!minor || minor === '0') return
                      const ok = await act.run(
                        `/dashboard/offers/${o.id}`,
                        'PATCH',
                        {priceMinor: minor},
                      )
                      if (ok) setEditing(undefined)
                    }}>
                    <ButtonText>Salvar</ButtonText>
                  </Button>
                </View>
              )}
            </Row>
          ))}
        </View>
      )}
    </Loading>
  )
}

// ---------------------------------------------------------------- analytics

function AnalyticsTab({base}: {base: string}) {
  const [days, setDays] = useState(30)
  const q = useSection<any>(base, `/analytics?days=${days}`)
  return (
    <View style={[a.gap_md]}>
      <View style={[a.flex_row, a.gap_xs]}>
        {[7, 30, 90].map(d => (
          <Chip
            key={d}
            label={`${d} dias`}
            selected={days === d}
            onPress={() => setDays(d)}
          />
        ))}
      </View>
      <Loading q={q}>
        {d => (
          <View style={[a.gap_md]}>
            <Stats>
              <Stat label="Views" value={d.views} />
              <Stat label="Espectadores únicos" value={d.uniqueViewers} />
              <Stat
                label="Tempo assistido"
                value={`${Math.round(Number(d.watchTimeMs) / 60000)} min`}
              />
              <Stat label="Views (total)" value={d.lifetimeViews} />
            </Stats>
            <Stats>
              <Stat label="Assinantes" value={d.subscribers} />
              <Stat label="Novas assinaturas" value={d.newSubscriptions} />
              <Stat label="Cancelamentos" value={d.cancelledSubscriptions} />
              <Stat
                label="Conversão"
                value={
                  d.subscriptionConversionBps == null
                    ? '—'
                    : `${(d.subscriptionConversionBps / 100).toFixed(1)}%`
                }
              />
            </Stats>
            <Stats>
              <Stat label="PPV" value={d.ppvPurchases} />
              <Stat label="Compras" value={d.purchases} />
              <Stat label="Aluguéis" value={d.rentals} />
              <Stat label="Reembolsos" value={d.refunds} />
              <Stat label="Chargebacks" value={d.chargebacks} />
            </Stats>
            {Object.entries(
              d.revenue as Record<string, Record<string, string>>,
            ).map(([currency, r]) => (
              <Stats key={currency}>
                <Stat
                  label={`Bruto (${currency})`}
                  value={formatMinor(r.gross, currency)}
                />
                <Stat label="Líquido" value={formatMinor(r.net, currency)} />
              </Stats>
            ))}
            <EmptyText>
              Números agregados. Nenhum dado individual de espectadores é
              exibido.
            </EmptyText>
          </View>
        )}
      </Loading>
    </View>
  )
}

// ---------------------------------------------------------------- revenue

const BALANCE_LINES: [string, string][] = [
  ['gross', 'Bruto'],
  ['platformFees', 'Taxas da plataforma'],
  ['processingFees', 'Taxas de processamento'],
  ['refunds', 'Reembolsos'],
  ['chargebacks', 'Chargebacks'],
  ['reserve', 'Reserva'],
  ['net', 'Líquido'],
  ['pending', 'Pendente'],
  ['available', 'Disponível'],
]

function Balances({
  balances,
}: {
  balances: Record<string, Record<string, string>>
}) {
  if (!Object.keys(balances).length)
    return <EmptyText>Nenhum lançamento ainda.</EmptyText>
  return (
    <View style={[a.gap_md]}>
      {Object.entries(balances).map(([currency, b]) => (
        <Stats key={currency}>
          {BALANCE_LINES.map(([key, label]) => (
            <Stat
              key={key}
              label={label}
              value={formatMinor(b[key] ?? '0', currency)}
            />
          ))}
        </Stats>
      ))}
    </View>
  )
}

const LEDGER_LABEL: Record<string, string> = {
  SALE: 'Venda',
  PLATFORM_FEE: 'Taxa da plataforma',
  PROCESSING_FEE: 'Taxa de processamento',
  REFUND: 'Reembolso',
  CHARGEBACK: 'Chargeback',
  ADJUSTMENT: 'Ajuste',
  PAYOUT: 'Payout',
  RESERVE: 'Reserva',
  RESERVE_RELEASE: 'Liberação de reserva',
}

function RevenueTab({base}: {base: string}) {
  const q = useSection<{balances: any; entries: any[]}>(base, '/revenue')
  return (
    <Loading q={q}>
      {data => (
        <View style={[a.gap_md]}>
          <EmptyText>
            Valores do ledger de receita (calculados no servidor).
          </EmptyText>
          <Balances balances={data.balances} />
          <Section title="Lançamentos recentes">
            {!data.entries.length && <EmptyText>Nenhum lançamento.</EmptyText>}
            {data.entries.map(e => (
              <Row key={e.id}>
                <Text style={[a.text_sm]}>
                  {LEDGER_LABEL[e.type] ?? e.type} ·{' '}
                  {formatMinor(e.amountMinor, e.currency)} · {date(e.createdAt)}
                </Text>
              </Row>
            ))}
          </Section>
        </View>
      )}
    </Loading>
  )
}

// ---------------------------------------------------------------- payouts

function PayoutsTab({base, home}: {base: string; home: Home}) {
  const q = useSection<any>(base, '/payouts')
  const act = useAction()
  const [amount, setAmount] = useState('')
  const [local, setLocal] = useState<string>()
  const canManage = home.seller.permissions.includes('managePayouts')
  return (
    <Loading q={q}>
      {data => (
        <View style={[a.gap_md]}>
          <View
            style={[
              a.p_md,
              a.rounded_md,
              {backgroundColor: 'rgba(214,51,108,0.08)'},
            ]}>
            <Text style={[a.text_sm]}>
              Nenhum provedor de pagamento está configurado. Solicitações ficam
              registradas, mas nenhuma transferência é feita.
            </Text>
          </View>
          <Text style={[a.text_md]}>
            Conta de recebimento:{' '}
            {data.account
              ? (STATUS_LABEL[data.account.status] ?? data.account.status)
              : 'não criada'}
          </Text>
          <ErrorText error={act.error} />
          {canManage && !data.account && (
            <Button
              label="Criar conta de recebimento"
              size="small"
              color="primary"
              disabled={act.busy}
              onPress={() => act.run(`${base}/payout-account`, 'POST')}>
              <ButtonText>Criar conta de recebimento</ButtonText>
            </Button>
          )}
          {__DEV__ &&
            canManage &&
            data.account &&
            data.account.status !== 'VERIFIED' && (
              <Button
                label="Simular verificação da conta (desenvolvimento)"
                size="small"
                color="secondary"
                onPress={() =>
                  act.run(`${base}/dev/payout-account/verify`, 'POST')
                }>
                <ButtonText>Simular verificação (DEV)</ButtonText>
              </Button>
            )}
          <Balances balances={data.balances} />
          {canManage && data.account?.status === 'VERIFIED' && (
            <Section title="Solicitar payout (BRL)">
              <Field
                label="Valor"
                value={amount}
                onChange={setAmount}
                placeholder="100,00"
              />
              {local && (
                <Text style={[a.text_sm, {color: '#c2570c'}]}>{local}</Text>
              )}
              <Button
                label="Solicitar"
                size="small"
                color="primary"
                disabled={act.busy}
                onPress={async () => {
                  setLocal(undefined)
                  const minor = parsePriceInput(amount, 'BRL')
                  if (!minor || minor === '0')
                    return setLocal('Valor inválido.')
                  const ok = await act.run(`${base}/payout-requests`, 'POST', {
                    amountMinor: minor,
                    currency: 'BRL',
                  })
                  if (ok) setAmount('')
                }}>
                <ButtonText>Solicitar</ButtonText>
              </Button>
            </Section>
          )}
          <Section title="Solicitações">
            {!data.requests.length && (
              <EmptyText>Nenhuma solicitação.</EmptyText>
            )}
            {data.requests.map((r: any) => (
              <Row key={r.id}>
                <Text style={[a.text_sm]}>
                  {formatMinor(r.amountMinor, r.currency)} ·{' '}
                  {STATUS_LABEL[r.status] ?? r.status} · {date(r.createdAt)}
                </Text>
                {canManage && r.status === 'REQUESTED' && (
                  <Button
                    label="Cancelar solicitação"
                    size="tiny"
                    color="secondary"
                    disabled={act.busy}
                    onPress={() =>
                      act.run(`${base}/payout-requests/${r.id}/cancel`, 'POST')
                    }>
                    <ButtonText>Cancelar</ButtonText>
                  </Button>
                )}
              </Row>
            ))}
          </Section>
        </View>
      )}
    </Loading>
  )
}

// ---------------------------------------------------------------- live / safety / team

function LiveTab({base}: {base: string}) {
  const q = useSection<{streams: any[]}>(base, '/live')
  return (
    <Loading q={q}>
      {data => (
        <View style={[a.gap_sm]}>
          {!data.streams.length && (
            <EmptyText>Nenhuma live ainda. Crie uma em Live +18.</EmptyText>
          )}
          {data.streams.map(s => (
            <Row key={s.id}>
              <Text style={[a.font_bold]}>{s.title}</Text>
              <Text style={[a.text_sm]}>
                {STATUS_LABEL[s.status] ?? s.status} ·{' '}
                {POLICY_LABELS[s.accessPolicy] ?? s.accessPolicy} · pico de{' '}
                {s.peakViewers} espectadores
                {s.hasRecording ? ' · gravação disponível' : ''}
              </Text>
            </Row>
          ))}
        </View>
      )}
    </Loading>
  )
}

const REPORT_LABEL: Record<string, string> = {
  underage_suspected: 'Suspeita de menor de idade',
  non_consensual: 'Não consensual',
  illegal_content: 'Conteúdo ilegal',
  harassment: 'Assédio',
  spam: 'Spam',
  impersonation: 'Falsidade ideológica',
  copyright: 'Direitos autorais',
  other: 'Outro',
}

function SafetyTab({base}: {base: string}) {
  const q = useSection<any>(base, '/safety')
  return (
    <Loading q={q}>
      {d => (
        <View style={[a.gap_md]}>
          <Stats>
            <Stat label="Em moderação" value={d.contentUnderModeration} />
            <Stat
              label="Denúncias em lives (30 dias)"
              value={d.liveReportsLast30Days}
            />
            <Stat label="Mídias em quarentena" value={d.media.quarantined} />
            <Stat label="Mídias com falha" value={d.media.failed} />
          </Stats>
          <Section title="Conteúdo em moderação">
            {!d.underModeration.length && (
              <EmptyText>Nada em moderação.</EmptyText>
            )}
            {d.underModeration.map((i: any) => (
              <Row key={`${i.type}:${i.id}`}>
                <Text style={[a.text_sm]}>
                  {i.title ?? i.id} · {STATUS_LABEL[i.status] ?? i.status}
                </Text>
              </Row>
            ))}
          </Section>
          <Section title="Denúncias em lives">
            {!d.liveReports.length && <EmptyText>Nenhuma denúncia.</EmptyText>}
            {d.liveReports.map((r: any) => (
              <Row key={`${r.streamId}:${r.reason}`}>
                <Text style={[a.text_sm]}>
                  {r.title} · {REPORT_LABEL[r.reason] ?? r.reason} · {r.count}
                </Text>
              </Row>
            ))}
          </Section>
          <EmptyText>Quem denunciou nunca é exibido.</EmptyText>
        </View>
      )}
    </Loading>
  )
}

function TeamTab({base}: {base: string}) {
  const q = useSection<{members: any[]}>(base, '/team')
  return (
    <Loading q={q}>
      {data => (
        <View style={[a.gap_sm]}>
          {data.members.map(m => (
            <Row key={m.did}>
              <Text style={[a.text_sm, a.font_bold]}>
                {ROLE_LABEL[m.role] ?? m.role}
              </Text>
              <Text style={[a.text_xs]} numberOfLines={1}>
                {m.did}
              </Text>
            </Row>
          ))}
        </View>
      )}
    </Loading>
  )
}
