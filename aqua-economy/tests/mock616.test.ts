import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Mock616Adapter } from '../src/mock616'
import { EconomicErrorImpl } from '../src/types'

describe('Mock616Adapter — Fase 1', () => {
  it('cria conta mock com saldo inicial', async () => {
    const adapter = new Mock616Adapter()
    const { account } = await adapter.createAccount('did:plc:test')
    const balances = await adapter.getBalance(account.address)
    assert.equal(balances.length, 1)
    assert.equal(balances[0].symbol, '616')
    assert.equal(balances[0].available, '10000')
  })

  it('consulta transações (vazio no início)', async () => {
    const adapter = new Mock616Adapter()
    const { account } = await adapter.createAccount('did:plc:a')
    const txs = await adapter.getTransactions(account.address)
    assert.equal(txs.length, 0)
  })

  it('envia transferência mock e passa por pending → confirmed', async () => {
    const adapter = new Mock616Adapter()
    const a = (await adapter.createAccount('did:plc:a')).account
    const b = (await adapter.createAccount('did:plc:b')).account

    const prepared = await adapter.prepareTransfer({
      from: a.address,
      to: b.address,
      assetId: '616',
      amount: '1000',
      idempotencyKey: 'idem-1',
    })

    const tx = await adapter.submitTransfer(prepared.prepared)
    assert.equal(tx.status, 'pending')
    assert.equal(tx.amount, '1000')

    // Espera a confirmação simulada
    await new Promise((r) => setTimeout(r, 80))

    const confirmed = await adapter.getTransactionStatus(tx.id)
    assert.equal(confirmed?.status, 'confirmed')

    const balA = await adapter.getBalance(a.address)
    const balB = await adapter.getBalance(b.address)
    assert.equal(balA[0].available, '9000')
    assert.equal(balB[0].available, '11000')
  })

  it('erro de saldo insuficiente', async () => {
    const adapter = new Mock616Adapter()
    const a = (await adapter.createAccount('did:plc:a')).account
    const b = (await adapter.createAccount('did:plc:b')).account

    await assert.rejects(
      () =>
        adapter.prepareTransfer({
          from: a.address,
          to: b.address,
          assetId: '616',
          amount: '999999',
          idempotencyKey: 'idem-fail',
        }),
      (err: any) => err instanceof EconomicErrorImpl && err.code === 'INSUFFICIENT_FUNDS'
    )
  })

  it('network offline bloqueia operações', async () => {
    const adapter = new Mock616Adapter('offline')
    await assert.rejects(
      () => adapter.createAccount('did:plc:x'),
      (err: any) => err instanceof EconomicErrorImpl && err.category === 'NETWORK'
    )
  })

  it('retry com mesma idempotencyKey não duplica', async () => {
    const adapter = new Mock616Adapter()
    const a = (await adapter.createAccount('did:plc:a')).account
    const b = (await adapter.createAccount('did:plc:b')).account

    const input = {
      from: a.address,
      to: b.address,
      assetId: '616',
      amount: '500',
      idempotencyKey: 'idem-same',
    }

    const prepared = await adapter.prepareTransfer(input)
    const tx1 = await adapter.submitTransfer(prepared.prepared)
    const tx2 = await adapter.submitTransfer(prepared.prepared)

    assert.equal(tx1.id, tx2.id)
    assert.equal(tx1.status, tx2.status)
  })
})
