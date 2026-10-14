import {type AppManifest, type EcosystemResource} from '#/lib/ecosystem/types'
import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
} from '#/lib/routes/types'
import {isWeb} from '#/platform/detection'
import {
  useEcosystemCapabilities,
  useEcosystemMutation,
  useEcosystemQuery,
} from '#/state/queries/ecosystem'
import {Text} from '#/components/Typography'
import {AppFrame} from './AppFrame'
import {Action, Card, NoticeText, Page, ServiceNotice, Status} from './shared'
function safeDecode(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
export function AppDetailScreen({
  route,
}: NativeStackScreenProps<CommonNavigatorParams, 'AppDetail'>) {
  const list = useEcosystemQuery<EcosystemResource>(
    `/apps/${encodeURIComponent(safeDecode(route.params.creator))}/${encodeURIComponent(route.params.slug)}`,
  )
  const r = list.data
  return (
    <Page title={r?.name ?? 'Games & Apps'}>
      <ServiceNotice />
      <Status
        pending={list.isFetching && !list.data}
        error={list.error}
        onRetry={() => list.refetch()}
      />
      {list.data && !r && (
        <NoticeText>App não encontrado ou sem acesso.</NoticeText>
      )}
      {r && <AppRun key={r.id} resource={r} />}
    </Page>
  )
}
function AppRun({resource: r}: {resource: EcosystemResource}) {
  const manifest = r.data as AppManifest
  const caps = useEcosystemCapabilities()
  const ticket = useEcosystemMutation<{url: string}>(`/apps/${r.id}/run-ticket`)
  return (
    <Card>
      <Text>{manifest.description}</Text>
      <NoticeText>
        Runtime: {manifest.runtime} · versão {manifest.version}. Permissões:
        nenhuma.
      </NoticeText>
      <NoticeText>Bundle: {manifest.entry}</NoticeText>
      <Action
        label="Executar em sandbox"
        disabled={!isWeb || !caps.data?.appRunner || ticket.isPending}
        onPress={() => ticket.mutate({})}
      />
      <Status error={ticket.error} />
      {ticket.data && <AppFrame src={ticket.data.url} title={r.name} />}
      <NoticeText>
        {!isWeb
          ? 'Runtime nativo não implementado.'
          : !caps.data?.appRunner
            ? 'Runner isolado não configurado.'
            : 'Código executado com sandbox e CSP, sem acesso ao perfil, storage, câmera ou microfone.'}
      </NoticeText>
    </Card>
  )
}
