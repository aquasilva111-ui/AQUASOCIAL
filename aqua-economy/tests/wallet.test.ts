import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Mock616Adapter } from '../src/mock616'
import { WalletService } from '../src/wallet'

describe('WalletService', () => {
  it('getOverview retorna saldo e transações recentes', async () => {
    const adapter = new Mock616Adapter()
    const service = new WalletService(adapter)
    const { account } = await service.createAccount('did:plc:user')

    const overview = await service.getOverview(account.address)

    assert.equal(overview.networkStatus, 'online')
    assert.equal(overview.totalAvailable, '10000')
    assert.equal(overview.recentTransactions.length, 0)
    assert.equal(overview.pendingRoyalties, '0')
  })

  it('getReceiveInfo devolve address e URI mock sem expor chave', async () => {
    const adapter = new Mock616Adapter()
    const service = new WalletService(adapter)
    const { account } = await service.createAccount('did:plc:user')

    const info = await service.getReceiveInfo(account.address)

    assert.equal(info.address, account.address)
    assert.match(info.uri, /^616mock:/)
    assert.ok(!('privateKey' in info))
    assert.ok(!('seed' in info))
  })

  it('fluxo prepare + submit via service', async () => {
    const adapter = new Mock616Adapter()
    const service = new WalletService(adapter)
    const a = (await service.createAccount('did:plc:a')).account
    const b = (await service.createAccount('did:plc:b')).account

    const prepared = await service.prepareSend({
      from: a.address,
      to: b.address,
      assetId: '616',
      amount: '250',
      idempotencyKey: 'ws-1',
    })

    const tx = await service.submitSend(prepared.prepared)
    assert.equal(tx.status, 'pending')
    assert.equal(tx.from, a.address)
    assert.equal(tx.to, b.address)
  })
})
