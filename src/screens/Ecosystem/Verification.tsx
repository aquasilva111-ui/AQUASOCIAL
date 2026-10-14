import {useState} from 'react'
import {View} from 'react-native'

import {ECOSYSTEM_CONFIGURED} from '#/lib/ecosystem/api'
import {
  type EcosystemResource,
  ENTITY_TYPES,
  type VerificationRequest,
} from '#/lib/ecosystem/types'
import {
  useEcosystemMutation,
  useEcosystemQuery,
  useEcosystemResources,
} from '#/state/queries/ecosystem'
import {useSession} from '#/state/session'
import {atoms as a} from '#/alf'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'
import {ActionForm} from './Detail'
import {
  Action,
  Card,
  Field,
  NoticeText,
  Page,
  ServiceNotice,
  Status,
} from './shared'

export function VerificationRequestScreen() {
  const {hasSession, currentAccount} = useSession()
  const list = useEcosystemResources('verification')
  const create = useEcosystemMutation('/resources')
  const [legalName, setLegalName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [entityType, setEntityType] = useState('person')
  const [website, setWebsite] = useState('')
  const [country, setCountry] = useState('BR')
  return (
    <Page title="Solicitar verificação">
      <NoticeText>
        Solicitação formal de autenticidade da sua identidade AQUA. Enviar um
        pedido não concede badge.
      </NoticeText>
      <ServiceNotice />
      <Card>
        <Field
          label="Tipo de entidade"
          value={entityType}
          onChange={setEntityType}
        />
        <NoticeText>{ENTITY_TYPES.join(', ')}</NoticeText>
        <Field label="Nome legal" value={legalName} onChange={setLegalName} />
        <Field
          label="Nome público"
          value={displayName}
          onChange={setDisplayName}
        />
        <Field
          label="Site oficial HTTPS"
          value={website}
          onChange={setWebsite}
        />
        <Field
          label="País (ISO de duas letras)"
          value={country}
          onChange={setCountry}
        />
        <NoticeText>
          Pedido e evidências são privados, acessíveis ao solicitante e aos
          revisores autorizados. Não envie documentos ou segredos em URLs;
          upload privado ainda não está disponível.
        </NoticeText>
        <Status error={create.error} />
        <Action
          label="Salvar rascunho"
          disabled={
            !ECOSYSTEM_CONFIGURED ||
            !hasSession ||
            create.isPending ||
            !legalName ||
            !displayName ||
            !website
          }
          onPress={() =>
            create.mutate({
              kind: 'verification',
              name: displayName,
              slug: `request-${Date.now()}`,
              description: 'Solicitação de autenticidade',
              data: {entityType, legalName, displayName, website, country},
            })
          }
        />
      </Card>
      <Status
        pending={list.isFetching && !list.data}
        error={list.error}
        onRetry={() => list.refetch()}
      />
      {list.data?.resources
        .filter(r => r.ownerDid === currentAccount?.did)
        .map(r => (
          <RequestCard key={r.id} resource={r} />
        ))}
      <Link to="/verification/review" label="Revisão autorizada">
        <Text>Painel de revisão (exige permissão)</Text>
      </Link>
    </Page>
  )
}
function RequestCard({resource: r}: {resource: EcosystemResource}) {
  const request = r.data as VerificationRequest
  return (
    <Card>
      <Text style={[a.font_bold]}>{request.displayName}</Text>
      <NoticeText>{request.status}</NoticeText>
      {request.reviewNotes && <Text>{request.reviewNotes}</Text>}
      {['draft', 'needs_information'].includes(request.status) && (
        <ActionForm resource={r} action="submit" title="Enviar para revisão" />
      )}
      <NoticeText>
        O badge existente só muda quando um emissor autorizado publica a
        verificação AT. Aprovação e revogação aguardam essa integração.
      </NoticeText>
    </Card>
  )
}
export function VerificationReviewScreen() {
  const capabilities = useEcosystemQuery<{reviewer: boolean}>(
    '/me/capabilities',
  )
  return (
    <Page title="Revisão de verificação">
      <ServiceNotice />
      <Status
        pending={capabilities.isFetching && !capabilities.data}
        error={capabilities.error}
      />
      {capabilities.data?.reviewer ? (
        <ReviewQueue />
      ) : (
        capabilities.data && (
          <NoticeText>Seu DID não tem permissão de revisão.</NoticeText>
        )
      )}
    </Page>
  )
}
function ReviewQueue() {
  const list = useEcosystemResources('verification')
  return (
    <>
      <Status pending={list.isFetching && !list.data} error={list.error} />
      {list.data?.resources.map(r => (
        <ReviewCard key={r.id} resource={r} />
      ))}
      {list.data && !list.data.resources.length && (
        <NoticeText>Sem solicitações.</NoticeText>
      )}
    </>
  )
}
function ReviewCard({resource: r}: {resource: EcosystemResource}) {
  const request = r.data as VerificationRequest
  const [notes, setNotes] = useState('')
  const review = useEcosystemMutation(`/verification/${r.id}/review`)
  return (
    <Card>
      <Text style={[a.font_bold]}>
        {request.legalName} · {request.entityType}
      </Text>
      <NoticeText>
        {request.applicantDid} · {request.country} · {request.status}
      </NoticeText>
      <Link to={request.website} label="Evidência oficial">
        <Text>Site oficial</Text>
      </Link>
      <Field
        label="Notas da revisão"
        value={notes}
        onChange={setNotes}
        multiline
      />
      <View style={[a.flex_row, a.flex_wrap, a.gap_md]}>
        {[
          ['under_review', 'Iniciar revisão'],
          ['request_more_info', 'Solicitar informações'],
          ['reject', 'Rejeitar'],
        ].map(([action, label]) => (
          <Action
            key={action}
            label={label}
            disabled={review.isPending}
            onPress={() => review.mutate({revision: r.revision, action, notes})}
          />
        ))}
      </View>
      <Action
        label="Aprovação indisponível: emissor AT não configurado"
        disabled
        onPress={() => {}}
      />
      <Action
        label="Revogação indisponível: emissor AT não configurado"
        disabled
        onPress={() => {}}
      />
      <Status error={review.error} />
    </Card>
  )
}
