import {View} from 'react-native'

import {type MonetizationEntry, type WalletSummary} from '#/lib/ecosystem/types'
import {
  useEcosystemMutation,
  useEcosystemQuery,
} from '#/state/queries/ecosystem'
import {atoms as a} from '#/alf'
import {Text} from '#/components/Typography'
import {Action, Card, NoticeText, Page, ServiceNotice, Status} from './shared'
const money = (minor: number, currency: string) => {
  if (!Number.isSafeInteger(minor)) return 'Valor inválido'
  const format = new Intl.NumberFormat('pt-BR', {style: 'currency', currency})
  return format.format(
    minor / 10 ** (format.resolvedOptions().maximumFractionDigits ?? 2),
  )
}
export function WalletScreen() {
  const query = useEcosystemQuery<{
    summaries: WalletSummary[]
    entries: MonetizationEntry[]
    paymentsConfigured: boolean
    message: string
  }>('/me/wallet')
  return (
    <Page title="Wallet / Monetização">
      <NoticeText>
        Registro econômico da sua identidade AQUA. Saldos registrados não
        representam custódia de dinheiro pelo AQUA.
      </NoticeText>
      <ServiceNotice />
      <Status
        pending={query.isFetching && !query.data}
        error={query.error}
        onRetry={() => query.refetch()}
      />
      {query.data && (
        <>
          <NoticeText>{query.data.message}</NoticeText>
          {!query.data.entries.length && (
            <NoticeText>
              Nenhum lançamento conciliado. Os saldos ainda não estão
              disponíveis.
            </NoticeText>
          )}
          {query.data.summaries.map(s => (
            <Card key={s.currency}>
              <Text style={[a.font_bold]}>{s.currency}</Text>
              <Text>Pendente: {money(s.pending, s.currency)}</Text>
              <Text>
                Disponível registrado: {money(s.available, s.currency)}
              </Text>
              <Text>Pago: {money(s.paid, s.currency)}</Text>
            </Card>
          ))}
          {query.data.entries.map(e => (
            <Card key={e.id}>
              <Text>
                {e.sourceType} · {e.status}
              </Text>
              <Text>
                Bruto: {money(e.gross, e.currency)} · Taxas:{' '}
                {money(e.fees, e.currency)} · Líquido:{' '}
                {money(e.net, e.currency)}
              </Text>
              <NoticeText>
                {e.sourceId} · {new Date(e.createdAt).toLocaleString()}
              </NoticeText>
            </Card>
          ))}
        </>
      )}
      <Action label="Saque indisponível" disabled onPress={() => {}} />
      <NoticeText>
        Checkout, estorno e webhooks continuam no PaymentProvider de Shops.
        Conciliação com o ledger e payout ainda precisam ser implementados antes
        de habilitar monetização transversal.
      </NoticeText>
    </Page>
  )
}
export function MetricBars({
  metrics,
}: {
  metrics: {event: string; count: number}[]
}) {
  const max = Math.max(1, ...metrics.map(m => m.count))
  return (
    <View style={[a.gap_lg]}>
      {metrics.map(m => (
        <View
          key={m.event}
          accessibilityLabel={`${m.event}: ${m.count}`}
          accessibilityHint="Contagem agregada deste evento"
          style={[a.gap_sm]}>
          <Text>
            {m.event}: {m.count}
          </Text>
          <View
            style={{
              height: 12,
              width: `${(100 * m.count) / max}%`,
              backgroundColor: '#002BEF',
              borderRadius: 6,
            }}
          />
        </View>
      ))}
    </View>
  )
}
export function AnalyticsScreen() {
  const query = useEcosystemQuery<{
    window: string
    metrics: {event: string; count: number; durationMs: number}[]
    scope: string
  }>('/me/analytics')
  const privacy = useEcosystemQuery<{analytics: boolean}>('/me/privacy')
  const consent = useEcosystemMutation<{analytics: boolean}>(
    '/me/privacy',
    'PUT',
  )
  return (
    <Page title="Analytics">
      <NoticeText>
        Eventos agregados dos recursos que pertencem a você. Sem fingerprinting,
        tracking entre sites ou cópia de conteúdo privado.
      </NoticeText>
      <ServiceNotice />
      <Status
        pending={query.isFetching && !query.data}
        error={query.error}
        onRetry={() => query.refetch()}
      />
      <Status error={privacy.error} />
      <Status error={consent.error} />
      {privacy.data && (
        <Card>
          <Text>
            Coleta de suas interações:{' '}
            {privacy.data.analytics ? 'permitida' : 'desativada'}
          </Text>
          <Action
            label={
              privacy.data.analytics ? 'Desativar coleta' : 'Permitir coleta'
            }
            disabled={consent.isPending}
            onPress={() =>
              consent.mutate({analytics: !privacy.data!.analytics})
            }
          />
          <NoticeText>
            Consentimento começa desativado. Revogar interrompe novos registros;
            eventos agregados anteriores não contêm o DID do visitante.
          </NoticeText>
        </Card>
      )}
      {query.data && (
        <Card>
          <Text style={[a.font_bold]}>Overview · últimos 30 dias</Text>
          {!query.data.metrics.length ? (
            <NoticeText>
              Nenhum evento registrado. Isto não informa o total de
              visualizações dos outros módulos.
            </NoticeText>
          ) : (
            <MetricBars metrics={query.data.metrics} />
          )}
          <NoticeText>
            Escopo: recursos Ecosystem. A ingestão histórica de View, Drops,
            Reads, Music e Store não está conectada.
          </NoticeText>
        </Card>
      )}
      <NoticeText>
        Content, Audience, Revenue e demais visões aguardam fontes e definições
        de métricas. Eventos de compras só podem vir do provedor de pagamento.
      </NoticeText>
    </Page>
  )
}
