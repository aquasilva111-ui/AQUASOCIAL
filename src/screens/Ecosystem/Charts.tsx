import {CHARTS} from '#/lib/ecosystem/charts'
import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
} from '#/lib/routes/types'
import {useTrendingTopics} from '#/state/queries/trending/useTrendingTopics'
import {atoms as a} from '#/alf'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'
import {Card, NoticeText, Page, Status} from './shared'
export function ChartsScreen({
  route,
}: NativeStackScreenProps<CommonNavigatorParams, 'Charts'>) {
  const chart = route.params?.chart ?? 'trending'
  const definition = CHARTS.find(c => c.id === chart)
  const trending = useTrendingTopics()
  return (
    <Page title="Charts / Pulse">
      <NoticeText>
        Movimento da rede, com a fonte e os limites de cada ranking.
      </NoticeText>
      {CHARTS.map(c => (
        <Link key={c.id} to={`/charts/${c.id}`} label={`Chart ${c.title}`}>
          <Text
            style={[a.font_semi_bold, c.id === chart && {color: '#002BEF'}]}>
            {c.title}
          </Text>
        </Link>
      ))}
      {!definition && <NoticeText error>Chart não encontrado.</NoticeText>}
      {chart === 'trending' ? (
        <>
          <Status
            pending={trending.isLoading}
            error={trending.error}
            onRetry={() => trending.refetch()}
          />
          <NoticeText>
            Fonte: AT Protocol · getTrendingTopics. A ordem vem da fonte;
            velocidade, autores únicos e crescimento AQUA ainda não foram
            coletados.
          </NoticeText>
          {trending.data?.topics.map((topic, index) => (
            <Card key={topic.topic}>
              <Link
                to={`/topic/${encodeURIComponent(topic.topic)}`}
                label={topic.displayName ?? topic.topic}>
                <Text style={[a.text_lg, a.font_bold]}>
                  {index + 1}. {topic.displayName ?? topic.topic}
                </Text>
              </Link>
              {topic.description && <Text>{topic.description}</Text>}
              <NoticeText>
                Por que está aqui? A fonte selecionou este assunto como
                tendência. Não há métricas locais para explicar sua posição.
              </NoticeText>
            </Card>
          ))}
          {trending.data && !trending.data.topics.length && (
            <NoticeText>Nenhuma tendência retornada pela fonte.</NoticeText>
          )}
        </>
      ) : (
        definition && (
          <NoticeText>
            Coleta de sinais para {definition.title} não configurada. Nenhum
            ranking estimado será exibido.
          </NoticeText>
        )
      )}
    </Page>
  )
}
