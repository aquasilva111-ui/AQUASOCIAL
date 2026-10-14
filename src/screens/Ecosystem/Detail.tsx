import {useEffect, useState} from 'react'
import {View} from 'react-native'

import {nowAndNext} from '#/lib/ecosystem/broadcast'
import {
  type BroadcastChannel,
  type Community,
  type EcosystemResource,
  type Portal,
  type Workspace,
} from '#/lib/ecosystem/types'
import {useOpenComposer} from '#/lib/hooks/useOpenComposer'
import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
} from '#/lib/routes/types'
import {
  useEcosystemCapabilities,
  useEcosystemMutation,
  useEcosystemQuery,
} from '#/state/queries/ecosystem'
import {useSession} from '#/state/session'
import {atoms as a} from '#/alf'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'
import {RESOURCE_TITLES} from './Directory'
import {
  Action,
  Card,
  Field,
  NoticeText,
  Page,
  ServiceNotice,
  Status,
} from './shared'

type Input = {key: string; label: string; initial?: string; multiline?: boolean}
export function ActionForm({
  resource,
  action,
  title,
  inputs = [],
  extra = {},
}: {
  resource: EcosystemResource
  action: string
  title: string
  inputs?: Input[]
  extra?: Record<string, unknown>
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(inputs.map(i => [i.key, i.initial ?? ''])),
  )
  const mutation = useEcosystemMutation(`/resources/${resource.id}/actions`)
  return (
    <Card>
      <Text style={[a.font_bold]}>{title}</Text>
      {inputs.map(input => (
        <Field
          key={input.key}
          label={input.label}
          value={values[input.key] ?? ''}
          onChange={value => setValues(v => ({...v, [input.key]: value}))}
          multiline={input.multiline}
        />
      ))}
      <Status error={mutation.error} />
      {mutation.isSuccess && <NoticeText>Alteração salva.</NoticeText>}
      <Action
        label={mutation.isPending ? 'Salvando…' : title}
        disabled={mutation.isPending}
        onPress={() =>
          mutation.mutate({
            action,
            revision: resource.revision,
            ...extra,
            ...values,
          })
        }
      />
    </Card>
  )
}
function Reference({uri, title}: {uri: string; title: string}) {
  const post = /^at:\/\/(did:[^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/.exec(uri)
  if (post)
    return (
      <Link
        to={`/profile/${encodeURIComponent(post[1])}/post/${encodeURIComponent(post[2])}`}
        label={title}>
        <Text style={[a.font_semi_bold]}>{title}</Text>
      </Link>
    )
  if (uri.startsWith('https://'))
    return (
      <Link to={uri} label={title}>
        <Text style={[a.font_semi_bold]}>{title}</Text>
      </Link>
    )
  return (
    <View style={[a.gap_xs]}>
      <Text>{title}</Text>
      <NoticeText>{uri}</NoticeText>
    </View>
  )
}
export function ResourceDetail({id}: {id: string}) {
  const query = useEcosystemQuery<EcosystemResource>(
    `/resources/${encodeURIComponent(id)}`,
  )
  return (
    <Page title={query.data?.name ?? 'Recurso AQUA'}>
      <ServiceNotice />
      <Status
        pending={query.isFetching && !query.data}
        error={query.error}
        onRetry={() => query.refetch()}
      />
      {query.data && <ResourceBody resource={query.data} />}
    </Page>
  )
}
export function ResourceBody({resource: r}: {resource: EcosystemResource}) {
  const {currentAccount} = useSession()
  const owner = currentAccount?.did === r.ownerDid
  const membership =
    r.kind === 'community' || r.kind === 'portal'
      ? (r.data as Community | Portal).members.find(
          m => m.did === currentAccount?.did,
        )
      : undefined
  const editor =
    owner || ['admin', 'editor', 'researcher'].includes(membership?.role ?? '')
  return (
    <>
      <NoticeText>
        {RESOURCE_TITLES[r.kind]} · {r.visibility}
      </NoticeText>
      <Text>{r.description}</Text>
      <Link
        to={`/profile/${encodeURIComponent(r.ownerDid)}`}
        label="Perfil AQUA">
        <Text>Perfil AQUA do proprietário</Text>
      </Link>
      {(r.kind === 'community' || r.kind === 'portal') && (
        <>
          {!membership && r.visibility === 'public' && (
            <ActionForm resource={r} action="join" title="Entrar" />
          )}
          {membership && !owner && (
            <ActionForm resource={r} action="leave" title="Sair" />
          )}
          <Card>
            <Text style={[a.font_bold]}>Membros</Text>
            {(r.data as Community | Portal).members.map(member => (
              <Link
                key={member.did}
                to={`/profile/${encodeURIComponent(member.did)}`}
                label={`Perfil ${member.did}`}>
                <Text>
                  {member.did} · {member.role}
                </Text>
              </Link>
            ))}
          </Card>
          {owner && (
            <ActionForm
              resource={r}
              action="member"
              title="Convidar ou alterar papel"
              inputs={[
                {key: 'did', label: 'AT DID do membro'},
                {
                  key: 'role',
                  label:
                    'Papel (admin, editor, researcher, contributor, moderator, viewer)',
                  initial: 'contributor',
                },
              ]}
            />
          )}
        </>
      )}
      {r.kind === 'community' && (
        <>
          <CommunityContent
            resource={r}
            canPost={!!membership}
            editor={editor}
          />
          {owner && (
            <ActionForm
              resource={r}
              action="ban"
              title="Remover membro pela moderação"
              inputs={[{key: 'did', label: 'AT DID'}]}
            />
          )}
        </>
      )}
      {r.kind === 'portal' && <PortalContent resource={r} editor={editor} />}
      {r.kind === 'broadcast' && (
        <BroadcastContent resource={r} owner={owner} />
      )}
      {r.kind === 'workspace' && <WorkspaceContent resource={r} />}
      {owner && <Activity resource={r} />}
      {owner && !['workspace', 'verification'].includes(r.kind) && (
        <ActionForm
          resource={r}
          action="settings"
          title="Alterar visibilidade"
          inputs={[
            {
              key: 'visibility',
              label: 'Visibilidade (private, unlisted, public)',
              initial: r.visibility,
            },
          ]}
        />
      )}
    </>
  )
}
function CommunityContent({
  resource: r,
  canPost,
  editor,
}: {
  resource: EcosystemResource
  canPost: boolean
  editor: boolean
}) {
  const community = r.data as Community
  const {openComposer} = useOpenComposer()
  return (
    <>
      {!community.channels.length && (
        <NoticeText>Ainda não há canais.</NoticeText>
      )}
      {community.channels.map(channel => (
        <Card key={channel.id}>
          <Text style={[a.text_lg, a.font_bold]}>
            {channel.name} · {channel.type}
          </Text>
          {!channel.posts.length && (
            <NoticeText>Nenhum post neste canal.</NoticeText>
          )}
          {[...channel.posts]
            .sort(
              (first, second) => Number(second.pinned) - Number(first.pinned),
            )
            .map(post => (
              <View key={post.uri} style={[a.gap_md]}>
                <Reference
                  uri={post.uri}
                  title={
                    post.pinned
                      ? 'Post fixado — abrir conversa'
                      : 'Abrir post e thread'
                  }
                />
                {editor && (
                  <>
                    <ActionForm
                      resource={r}
                      action="pin"
                      title={post.pinned ? 'Desafixar' : 'Fixar'}
                      extra={{
                        channelId: channel.id,
                        uri: post.uri,
                        pinned: !post.pinned,
                      }}
                    />
                    <ActionForm
                      resource={r}
                      action="remove_post"
                      title="Remover referência do canal"
                      extra={{channelId: channel.id, uri: post.uri}}
                    />
                  </>
                )}
              </View>
            ))}
          {canPost && (
            <Action
              label="Criar post no AQUA"
              onPress={() => openComposer({})}
            />
          )}
          {canPost && (
            <ActionForm
              resource={r}
              action="post"
              title="Adicionar seu post AQUA"
              inputs={[{key: 'uri', label: 'URI do seu post (at://)'}]}
              extra={{channelId: channel.id}}
            />
          )}
        </Card>
      ))}
      {editor && (
        <ActionForm
          resource={r}
          action="channel"
          title="Criar canal"
          inputs={[
            {key: 'name', label: 'Nome do canal'},
            {
              key: 'type',
              label: 'Tipo (text, forum, media, announcements)',
              initial: 'text',
            },
          ]}
        />
      )}
      <NoticeText>
        Posts, threads, mídia, Saved e denúncias abrem os recursos sociais
        existentes. Voz e stage ainda não estão disponíveis.
      </NoticeText>
    </>
  )
}
function PortalContent({
  resource: r,
  editor,
}: {
  resource: EcosystemResource
  editor: boolean
}) {
  const portal = r.data as Portal
  return (
    <>
      {Object.entries(portal.sections).map(([section, refs]) => (
        <Card key={section}>
          <Text style={[a.text_lg, a.font_bold]}>{section}</Text>
          {refs?.map(ref => (
            <View key={ref.uri} style={[a.gap_xs]}>
              <Reference uri={ref.uri} title={ref.title} />
              {ref.source && <Reference uri={ref.source} title="Fonte" />}
            </View>
          ))}
        </Card>
      ))}
      {!Object.keys(portal.sections).length && (
        <NoticeText>
          Este portal ainda não possui referências ou fontes.
        </NoticeText>
      )}
      {editor && (
        <>
          <ActionForm
            resource={r}
            action="source"
            title="Adicionar fonte externa"
            inputs={[
              {key: 'title', label: 'Título da fonte'},
              {key: 'uri', label: 'URL oficial (HTTPS)'},
            ]}
          />
          <ActionForm
            resource={r}
            action="reference"
            title="Referenciar conteúdo AQUA"
            inputs={[
              {key: 'title', label: 'Título'},
              {key: 'uri', label: 'URI do recurso (at://)'},
              {
                key: 'section',
                label:
                  'Seção (overview, research, documents, data, timeline, discussions, media, related)',
                initial: 'research',
              },
              {
                key: 'type',
                label:
                  'Tipo (post, video, image, book, music, doc, app, dataset)',
                initial: 'post',
              },
            ]}
          />
          <Link to="/docs" label="Documentos colaborativos AQUA">
            <Text>Abrir AQUA Docs para edição colaborativa</Text>
          </Link>
        </>
      )}
      {portal.country && (
        <Card>
          <Text style={[a.font_bold]}>
            Country portal · {portal.country.countryCode}
          </Text>
          {Object.entries(portal.country.facts).map(([key, fact]) => (
            <View key={key} style={[a.gap_sm]}>
              <Text>
                {key}: {fact.value}
              </Text>
              <Reference uri={fact.source} title="Fonte deste dado" />
              <NoticeText>
                Consulta da fonte:{' '}
                {new Date(fact.retrievedAt).toLocaleDateString()}
              </NoticeText>
            </View>
          ))}
        </Card>
      )}
      {editor && (
        <ActionForm
          resource={r}
          action="country_fact"
          title="Registrar dado de país com fonte"
          inputs={[
            {key: 'countryCode', label: 'Código de país (duas letras)'},
            {
              key: 'field',
              label:
                'Campo (population, economy, health, education, geography, culture, government)',
            },
            {key: 'value', label: 'Valor verificado na fonte'},
            {key: 'source', label: 'Fonte HTTPS'},
            {key: 'retrievedAt', label: 'Data de consulta ISO 8601'},
          ]}
        />
      )}
      <NoticeText>
        Dados de países são inseridos com fonte; nenhuma estatística é gerada
        automaticamente. Convenções aguardam suas definições.
      </NoticeText>
    </>
  )
}
function BroadcastContent({
  resource: r,
  owner,
}: {
  resource: EcosystemResource
  owner: boolean
}) {
  const channel = r.data as BroadcastChannel
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(id)
  }, [])
  const schedule = nowAndNext(channel.schedule, now)
  return (
    <>
      <Card>
        <Text style={[a.font_bold]}>
          Agora: {schedule.now?.title ?? 'Nenhum programa neste horário'}
        </Text>
        {schedule.now && (
          <Reference
            uri={schedule.now.mediaUri ?? schedule.now.liveSource ?? ''}
            title="Abrir fonte do programa"
          />
        )}
        <Text>Próximo: {schedule.next?.title ?? 'Sem próximo programa'}</Text>
      </Card>
      <ActionForm resource={r} action="follow" title="Seguir canal" />
      <ActionForm resource={r} action="unfollow" title="Deixar de seguir" />
      {channel.schedule.map(item => (
        <Card key={item.id}>
          <Text style={[a.font_bold]}>{item.title}</Text>
          <NoticeText>
            {new Date(item.startAt).toLocaleString()} —{' '}
            {new Date(item.endAt).toLocaleString()}
          </NoticeText>
          <Reference
            uri={item.mediaUri ?? item.liveSource ?? ''}
            title="Fonte da programação"
          />
          {owner && (
            <ActionForm
              resource={r}
              action="remove_schedule"
              title="Remover programa"
              extra={{scheduleId: item.id}}
            />
          )}
        </Card>
      ))}
      {owner && (
        <ActionForm
          resource={r}
          action="schedule"
          title="Adicionar programa"
          inputs={[
            {key: 'title', label: 'Título'},
            {key: 'startAt', label: 'Início ISO 8601 (inclua fuso)'},
            {key: 'endAt', label: 'Fim ISO 8601 (inclua fuso)'},
            {key: 'mediaUri', label: 'Mídia HTTPS'},
          ]}
        />
      )}
      <NoticeText>
        Grade e fontes reais disponíveis. Player contínuo, ingest, embeds e
        notificações de programação ainda exigem integração.
      </NoticeText>
    </>
  )
}
function WorkspaceContent({resource: r}: {resource: EcosystemResource}) {
  const workspace = r.data as Workspace
  const capabilities = useEcosystemCapabilities()
  const [provider, setProvider] = useState('')
  const [layers, setLayers] = useState('')
  const ask = useEcosystemMutation<{
    plan: {status: string; reason: string}
    result?: string
  }>(`/workspaces/${r.id}/ask`)
  const run = useEcosystemMutation(`/workspaces/${r.id}/run`)
  const [intent, setIntent] = useState('inspect_workspace')
  return (
    <>
      <Card>
        <Text style={[a.text_lg, a.font_bold]}>Conversation · U.I.</Text>
        <Field label="Intenção" value={intent} onChange={setIntent} />
        <Action
          label="Ask"
          disabled={ask.isPending}
          onPress={() => ask.mutate({intent})}
        />
        <Status error={ask.error} />
        {ask.data && (
          <NoticeText>
            {ask.data.plan.status}: {ask.data.result ?? ask.data.plan.reason}
          </NoticeText>
        )}
        <NoticeText>
          Ferramentas determinísticas primeiro. A U.I. consulta provedores como
          recursos especializados; nenhuma IA externa recebe contexto
          automaticamente.
        </NoticeText>
        <Text style={[a.font_bold]}>AI Providers</Text>
        <NoticeText>
          {capabilities.data?.aiProviders.length
            ? `Disponíveis: ${capabilities.data.aiProviders.join(', ')}`
            : 'Nenhum provedor de IA configurado.'}
        </NoticeText>
        <Field
          label="Send to… (nome do provedor disponível)"
          value={provider}
          onChange={setProvider}
        />
        <Field
          label="Camadas a compartilhar (opcional: GLOBAL, PROJECT, TASK, TEMPORARY)"
          value={layers}
          onChange={setLayers}
        />
        <NoticeText>
          Ao enviar, você autoriza este provedor a receber a intenção e somente
          as camadas que informou acima. Nenhuma decisão é aplicada
          automaticamente.
        </NoticeText>
        <Action
          label="Enviar ao provedor selecionado"
          disabled={
            ask.isPending || !capabilities.data?.aiProviders.includes(provider)
          }
          onPress={() =>
            ask.mutate({
              intent,
              provider,
              authorizeExternal: true,
              layers: layers
                .split(',')
                .map(l => l.trim())
                .filter(Boolean),
            })
          }
        />
        {workspace.messages?.map(message => (
          <View key={message.id} style={[a.gap_sm]}>
            <Text style={[a.font_bold]}>
              {message.role} · {message.provider}
            </Text>
            <Text>{message.text}</Text>
          </View>
        ))}
      </Card>
      <Card>
        <Text style={[a.text_lg, a.font_bold]}>Tasks</Text>
        {workspace.tasks.map(task => (
          <View key={task.id} style={[a.gap_sm]}>
            <Text>
              {task.title} · {task.status}
            </Text>
            <ActionForm
              resource={r}
              action="resolve_task"
              title="Atualizar tarefa"
              inputs={[
                {
                  key: 'status',
                  label: 'Status (pending, completed, blocked, NEEDS_DECISION)',
                  initial: task.status,
                },
              ]}
              extra={{taskId: task.id}}
            />
          </View>
        ))}
      </Card>
      <ActionForm
        resource={r}
        action="task"
        title="Create Task"
        inputs={[{key: 'title', label: 'Título da tarefa'}]}
      />
      <ActionForm
        resource={r}
        action="task"
        title="Registrar decisão pendente"
        inputs={[{key: 'title', label: 'Decisão necessária'}]}
        extra={{needsDecision: true}}
      />
      <Card>
        <Text style={[a.text_lg, a.font_bold]}>Context</Text>
        {Object.entries(workspace.context).map(([layer, context]) => (
          <View key={layer}>
            <Text style={[a.font_bold]}>{layer}</Text>
            <Text>{context}</Text>
          </View>
        ))}
      </Card>
      <ActionForm
        resource={r}
        action="context"
        title="Salvar contexto"
        inputs={[
          {
            key: 'layer',
            label: 'Camada (GLOBAL, PROJECT, TASK, TEMPORARY)',
            initial: 'PROJECT',
          },
          {key: 'text', label: 'Contexto', multiline: true},
        ]}
      />
      <Card>
        <Text style={[a.text_lg, a.font_bold]}>Decisions</Text>
        {workspace.decisions.map(decision => (
          <Text key={decision.id}>{decision.text}</Text>
        ))}
      </Card>
      <ActionForm
        resource={r}
        action="decision"
        title="Registrar decisão do usuário"
        inputs={[{key: 'text', label: 'Decisão estabelecida', multiline: true}]}
      />
      <Card>
        <Text style={[a.text_lg, a.font_bold]}>Automata</Text>
        {workspace.automata.map(automaton => (
          <Card key={automaton.id}>
            <Text>
              {automaton.mission} · {automaton.status}
            </Text>
            <NoticeText>
              Território: {automaton.territory.join(', ')} · máximo{' '}
              {automaton.limits.maxSteps} passo(s),{' '}
              {automaton.limits.maxExternalCalls} chamadas externas.
            </NoticeText>
            {automaton.result && <Text>{automaton.result}</Text>}
            {automaton.blockedReason && (
              <NoticeText error>{automaton.blockedReason}</NoticeText>
            )}
            {automaton.status === 'EQUIPPED' && (
              <Action
                label="Executar inspeção determinística"
                disabled={run.isPending}
                onPress={() =>
                  run.mutate({revision: r.revision, automatonId: automaton.id})
                }
              />
            )}
          </Card>
        ))}
        <Status error={run.error} />
      </Card>
      <ActionForm
        resource={r}
        action="automaton"
        title="Create Automaton"
        inputs={[{key: 'mission', label: 'Missão de inspeção do workspace'}]}
      />
      <Card>
        <Text style={[a.font_bold]}>Files · Projects</Text>
        <NoticeText>
          Arquivos e repositórios privados não são copiados para provedores.
        </NoticeText>
        {workspace.files.map(file => (
          <Reference key={file.uri} uri={file.uri} title={file.title} />
        ))}
        {workspace.linkedRepos.map(uri => (
          <Reference key={uri} uri={uri} title="Repositório vinculado" />
        ))}
        {workspace.linkedServices.map(uri => (
          <Reference key={uri} uri={uri} title="Serviço vinculado" />
        ))}
        <Link to="/creative-hub" label="Creative Hub">
          <Text>Abrir Creative Hub</Text>
        </Link>
        <Link to="/launch" label="Launch Hub">
          <Text>Abrir Launch Hub</Text>
        </Link>
      </Card>
      <ActionForm
        resource={r}
        action="file"
        title="Adicionar referência a arquivo"
        inputs={[
          {key: 'uri', label: 'URI AT do recurso'},
          {key: 'title', label: 'Título'},
          {
            key: 'type',
            label: 'Tipo (doc, image, video, post, dataset)',
            initial: 'doc',
          },
        ]}
      />
      <ActionForm
        resource={r}
        action="link"
        title="Vincular projeto ou serviço"
        inputs={[
          {key: 'uri', label: 'URL HTTPS sem credenciais'},
          {key: 'type', label: 'Tipo (repo ou service)', initial: 'repo'},
        ]}
      />
    </>
  )
}
function Activity({resource}: {resource: EcosystemResource}) {
  const query = useEcosystemQuery<{
    events: {id: string; action: string; timestamp: string}[]
  }>(`/resources/${resource.id}/audit`)
  return (
    <Card>
      <Text style={[a.font_bold]}>Activity</Text>
      <Status error={query.error} />
      {query.data?.events.map(e => (
        <Text key={e.id}>
          {e.action} · {new Date(e.timestamp).toLocaleString()}
        </Text>
      ))}
    </Card>
  )
}
export function CommunityDetailScreen({
  route,
}: NativeStackScreenProps<CommonNavigatorParams, 'CommunityDetail'>) {
  return <ResourceDetail id={route.params.id} />
}
export function PortalDetailScreen({
  route,
}: NativeStackScreenProps<CommonNavigatorParams, 'PortalDetail'>) {
  return <ResourceDetail id={route.params.id} />
}
export function BroadcastDetailScreen({
  route,
}: NativeStackScreenProps<CommonNavigatorParams, 'BroadcastDetail'>) {
  return <ResourceDetail id={route.params.id} />
}
export function WorkspaceDetailScreen({
  route,
}: NativeStackScreenProps<CommonNavigatorParams, 'WorkspaceDetail'>) {
  return <ResourceDetail id={route.params.id} />
}
