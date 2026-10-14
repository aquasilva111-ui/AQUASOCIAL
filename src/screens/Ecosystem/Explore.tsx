import {useState} from 'react'

import {type EcosystemResource} from '#/lib/ecosystem/types'
import {useEcosystemQuery} from '#/state/queries/ecosystem'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'
import {RESOURCE_TITLES, resourcePath} from './Directory'
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
export function EcosystemExploreScreen() {
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')
  const results = useEcosystemQuery<{
    resources: EcosystemResource[]
    discoveryConfigured: boolean
  }>(`/search?q=${encodeURIComponent(query)}`, query.length > 1)
  return (
    <Page title="Explorar AQUA">
      <ResourceLinks />
      <ServiceNotice />
      <Field
        label="Buscar Communities, Portals, Apps e Broadcast"
        value={input}
        onChange={setInput}
      />
      <Action
        label="Buscar no ecossistema"
        disabled={input.trim().length < 2}
        onPress={() => setQuery(input.trim())}
      />
      <Status
        pending={results.isFetching}
        error={results.error}
        onRetry={() => results.refetch()}
      />
      {results.data?.resources.map(r => (
        <Card key={r.id}>
          <Link to={resourcePath(r)} label={r.name}>
            <Text>{r.name}</Text>
          </Link>
          <NoticeText>{RESOURCE_TITLES[r.kind]}</NoticeText>
        </Card>
      ))}
      {results.data && !results.data.resources.length && (
        <NoticeText>Nenhum resultado acessível.</NoticeText>
      )}
      <Link to="/search" label="Busca social AQUA">
        <Text>Busca social: pessoas, posts e feeds</Text>
      </Link>
    </Page>
  )
}
