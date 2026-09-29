import {
  type AccessControlledResource,
  canAccess,
  clearEntitlements,
  grantEntitlement,
  invalidateEntitlementDecisions,
  listEntitlements,
  revokeEntitlement,
} from '#/lib/adult/entitlements'

const USER = 'did:plc:user'
const OTHER_USER = 'did:plc:other'
const CREATOR = 'did:plc:creator'

function resource(
  policy: AccessControlledResource['policy'],
  extra: Partial<AccessControlledResource> = {},
): AccessControlledResource {
  return {
    id: 'at://creator/post/1',
    type: 'post',
    creatorId: CREATOR,
    policy,
    ...extra,
  }
}

function request(over: Partial<Parameters<typeof canAccess>[0]> = {}) {
  return {
    userId: USER,
    resourceId: 'at://creator/post/1',
    resourceType: 'post' as const,
    adultContextActive: true,
    ...over,
  }
}

beforeEach(() => {
  clearEntitlements()
  invalidateEntitlementDecisions()
})

describe('AQUA Entitlements — cenários end-to-end', () => {
  it('A: conteúdo FREE fica disponível para usuário autorizado no contexto', () => {
    const decision = canAccess(request(), resource('free'))
    expect(decision.allowed).toBe(true)
  })

  it('B: SUBSCRIBER_ONLY sem entitlement nega com razão explícita', () => {
    const decision = canAccess(request(), resource('subscriber_only'))
    expect(decision.allowed).toBe(false)
    expect(decision.reason).toBe('not_subscribed')
  })

  it('C: entitlement de assinatura válido libera o conteúdo', () => {
    grantEntitlement({
      userId: USER,
      resourceId: 'at://creator/post/1',
      resourceType: 'post',
      type: 'subscription',
    })
    const decision = canAccess(request(), resource('subscriber_only'))
    expect(decision.allowed).toBe(true)
    expect(decision.entitlementType).toBe('subscription')
  })

  it('D: entitlement expirado nega novos acessos', () => {
    grantEntitlement({
      userId: USER,
      resourceId: 'at://creator/post/1',
      resourceType: 'post',
      type: 'rental',
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    })
    const decision = canAccess(request(), resource('rental_required'))
    expect(decision.allowed).toBe(false)
    expect(decision.reason).toBe('rental_expired')
  })

  it('E: acesso direto sem contexto adulto é negado', () => {
    grantEntitlement({
      userId: USER,
      resourceId: 'at://creator/post/1',
      resourceType: 'post',
      type: 'purchase',
    })
    const decision = canAccess(
      request({adultContextActive: false}),
      resource('purchase_required'),
    )
    expect(decision.allowed).toBe(false)
    expect(decision.reason).toBe('adult_context_required')
  })

  it('F: sair do AdultContext (contexto inativo) bloqueia mesmo conteúdo free', () => {
    const decision = canAccess(
      request({adultContextActive: false}),
      resource('free'),
    )
    expect(decision.allowed).toBe(false)
  })

  it('nega sem usuário autenticado', () => {
    const decision = canAccess(request({userId: undefined}), resource('free'))
    expect(decision.allowed).toBe(false)
    expect(decision.reason).toBe('not_authenticated')
  })
})

describe('AQUA Entitlements — segurança (7.19)', () => {
  it('entitlement de outra pessoa nunca autoriza este usuário', () => {
    grantEntitlement({
      userId: OTHER_USER,
      resourceId: 'at://creator/post/1',
      resourceType: 'post',
      type: 'subscription',
    })
    const decision = canAccess(request(), resource('subscriber_only'))
    expect(decision.allowed).toBe(false)
  })

  it('entitlement de outro recurso não autoriza este recurso', () => {
    grantEntitlement({
      userId: USER,
      resourceId: 'at://creator/post/OTHER',
      resourceType: 'post',
      type: 'subscription',
    })
    expect(canAccess(request(), resource('subscriber_only')).allowed).toBe(
      false,
    )
  })

  it('tier errado não abre conteúdo tier_required', () => {
    grantEntitlement({
      userId: USER,
      resourceId: 'at://creator/post/1',
      resourceType: 'post',
      type: 'tier',
      tierId: 'silver',
    })
    const decision = canAccess(
      request(),
      resource('tier_required', {requiredTierId: 'gold'}),
    )
    expect(decision.allowed).toBe(false)
    expect(decision.reason).toBe('wrong_tier')
  })

  it('revoke invalida imediatamente, inclusive decisão cacheada', () => {
    const grant = grantEntitlement({
      userId: USER,
      resourceId: 'at://creator/post/1',
      resourceType: 'post',
      type: 'purchase',
    })
    expect(canAccess(request(), resource('purchase_required')).allowed).toBe(
      true,
    )
    revokeEntitlement(grant.id)
    invalidateEntitlementDecisions('at://creator/post/1')
    expect(canAccess(request(), resource('purchase_required')).allowed).toBe(
      false,
    )
  })

  it('conteúdo removido só abre com concessão administrativa', () => {
    expect(
      canAccess(request(), resource('free', {removed: true})).allowed,
    ).toBe(false)
    grantEntitlement({
      userId: USER,
      resourceId: 'at://creator/post/1',
      resourceType: 'post',
      type: 'administrative',
    })
    expect(
      canAccess(request(), resource('free', {removed: true})).allowed,
    ).toBe(true)
  })

  it('criador suspenso nega acesso', () => {
    grantEntitlement({
      userId: USER,
      resourceId: 'at://creator/post/1',
      resourceType: 'post',
      type: 'subscription',
    })
    const decision = canAccess(
      request(),
      resource('subscriber_only', {creatorSuspended: true}),
    )
    expect(decision.allowed).toBe(false)
    expect(decision.reason).toBe('creator_suspended')
  })

  it('política desconhecida falha fechada', () => {
    const decision = canAccess(request(), resource('mystery_policy' as never))
    expect(decision.allowed).toBe(false)
  })

  it('recurso malformado falha fechado', () => {
    const decision = canAccess(request(), {} as AccessControlledResource)
    expect(decision.allowed).toBe(false)
  })

  it('listagem de entitlements é por usuário', () => {
    grantEntitlement({
      userId: OTHER_USER,
      resourceId: 'x',
      resourceType: 'post',
      type: 'purchase',
    })
    expect(listEntitlements(USER)).toEqual([])
    expect(listEntitlements(OTHER_USER)).toHaveLength(1)
  })
})
