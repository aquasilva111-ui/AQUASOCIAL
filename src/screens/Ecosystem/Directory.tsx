import {useState} from 'react'
import {View} from 'react-native'

import {ECOSYSTEM_CONFIGURED} from '#/lib/ecosystem/api'
import {type EcosystemResource, type ResourceKind} from '#/lib/ecosystem/types'
import {
  useEcosystemMutation,
  useEcosystemResources,
} from '#/state/queries/ecosystem'
import {useSession} from '#/state/session'
import {atoms as a} from '#/alf'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'
import {
  Action,
  Card,
  Field,
  NoticeText,
  Page,
  ResourceLinks,
  ServiceNotice,
  Status,
} from './shared'

export const RESOURCE_TITLES: Record<ResourceKind, string> = {
  community: 'Communities',
  portal: 'Portals',
  app: 'Games & Apps',
  broadcast: 'Broadcast',
  workspace: 'Workspaces',
  verification: 'Verificação',
}
const DESCRIPTIONS: Partial<Record<ResourceKind, string>> = {
  community:
    'Pessoas reunidas por canais, conversas e referências a posts do AQUA.',
  portal:
    'Assuntos organizados por fontes e referências. Dados externos sempre precisam de fonte.',
  app: 'Aplicações web publicadas por creators. O runtime começa sem permissões.',
  broadcast:
    'Canais contínuos de vídeo ou rádio com programação. Eventos live continuam em View.',
  workspace: 'Contexto, decisões e tarefas sobre a mesma identidade AQUA.',
}
export function resourcePath(r: EcosystemResource) {
  if (r.kind === 'app')
    return `/apps/${encodeURIComponent(r.ownerDid)}/${r.slug}`
  return `/${{community: 'communities', portal: 'portals', broadcast: 'broadcast', workspace: 'ui-ai/workspaces', verification: 'verification/requests'}[r.kind]}/${r.id}`
}
export function Directory({kind}: {kind: ResourceKind}) {
  const {hasSession} = useSession()
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const resources = useEcosystemResources(kind, search)
  return (
    <Page title={RESOURCE_TITLES[kind]}>
      <NoticeText>{DESCRIPTIONS[kind]}</NoticeText>
      <ResourceLinks />
      <ServiceNotice />
      <Field
        label="Buscar por nome ou descrição"
        value={search}
        onChange={setSearch}
      />
      <Status
        pending={resources.isFetching && !resources.data}
        error={resources.error}
        onRetry={() => resources.refetch()}
      />
      {resources.data && !resources.data.discoveryConfigured && (
        <NoticeText>
          Descoberta pública aguarda integração com a moderação. Seus recursos
          estão disponíveis.
        </NoticeText>
      )}
      {resources.data?.limited && (
        <NoticeText>
          A consulta alcançou o limite de 200 recursos; o índice paginado ainda
          precisa ser integrado.
        </NoticeText>
      )}
      {resources.data && !resources.data.resources.length && (
        <NoticeText>Nenhum recurso encontrado.</NoticeText>
      )}
      {resources.data?.resources.map(r => (
        <Card key={r.id}>
          <Link to={resourcePath(r)} label={`Abrir ${r.name}`}>
            <Text style={[a.text_xl, a.font_bold]}>{r.name}</Text>
          </Link>
          <Text>{r.description}</Text>
          <NoticeText>
            {r.visibility} · {r.ownerDid}
          </NoticeText>
        </Card>
      ))}
      <Action
        label={creating ? 'Fechar formulário' : 'Criar'}
        disabled={!ECOSYSTEM_CONFIGURED || !hasSession}
        onPress={() => setCreating(!creating)}
      />
      {creating && (
        <CreateResource kind={kind} onCreated={() => setCreating(false)} />
      )}
      {(kind === 'app' || kind === 'workspace') && (
        <View style={[a.flex_row, a.gap_lg]}>
          <Link to="/creative-hub" label="Criar no Creative Hub">
            <Text>Criar no Creative Hub</Text>
          </Link>
          <Link to="/launch" label="Launch Hub">
            <Text>Launch Hub</Text>
          </Link>
        </View>
      )}
    </Page>
  )
}
export function CreateResource({
  kind,
  onCreated,
}: {
  kind: ResourceKind
  onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [entry, setEntry] = useState('')
  const [version, setVersion] = useState('1.0.0')
  const [type, setType] = useState('video')
  const create = useEcosystemMutation('/resources')
  return (
    <Card>
      <Text style={[a.text_lg, a.font_bold]}>Novo recurso privado</Text>
      <Field label="Nome" value={name} onChange={setName} />
      <Field label="Slug" value={slug} onChange={setSlug} />
      <Field
        label="Descrição"
        value={description}
        onChange={setDescription}
        multiline
      />
      {kind === 'app' && (
        <>
          <Field
            label="Bundle JavaScript publicado (HTTPS, .js)"
            value={entry}
            onChange={setEntry}
          />
          <Field label="Versão" value={version} onChange={setVersion} />
          <NoticeText>
            A origem de publicação precisa estar autorizada pelo servidor.
            Build/deployment de apps ainda exige uma ferramenta externa.
          </NoticeText>
        </>
      )}
      {kind === 'broadcast' && (
        <Field label="Tipo (video ou radio)" value={type} onChange={setType} />
      )}
      <Status error={create.error} />
      <Action
        label={create.isPending ? 'Salvando…' : 'Criar recurso'}
        disabled={
          create.isPending ||
          !name.trim() ||
          !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
        }
        onPress={() =>
          create.mutate(
            {
              kind,
              name,
              slug,
              description,
              visibility: 'private',
              data:
                kind === 'app'
                  ? {entry, version, permissions: [], runtime: 'web'}
                  : kind === 'broadcast'
                    ? {type}
                    : {},
            },
            {onSuccess: onCreated},
          )
        }
      />
    </Card>
  )
}
export const CommunitiesScreen = () => <Directory kind="community" />
export const PortalsScreen = () => <Directory kind="portal" />
export const AppsScreen = () => <Directory kind="app" />
export const BroadcastScreen = () => <Directory kind="broadcast" />
export const WorkspacesScreen = () => <Directory kind="workspace" />
