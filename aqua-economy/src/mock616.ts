import type { EconomicNetworkAdapter } from './adapter'
import {
  EconomicErrorImpl,
  type Balance,
  type EconomicIdentity,
  type NetworkStatus,
  type Transaction,
  type WalletAccount,
} from './types'

const NATIVE_ASSET = '616'
const DECIMALS = 2

interface MockState {
  accounts: Map<string, { identity: EconomicIdentity; account: WalletAccount; balance: bigint }>
  transactions: Map<string, Transaction>
  idempotency: Map<string, string> // key → txId
  networkStatus: NetworkStatus
  nextId: number
}

/**
 * Mock616Adapter — simula a 616 Network de forma determinística.
 * Permite cenários de teste: online, offline, saldo insuficiente, pending→confirmed, retry idempotente.
 */
export class Mock616Adapter implements EconomicNetworkAdapter {
  readonly networkId = 'mock616'
  private state: MockState

  constructor(initialStatus: NetworkStatus = 'online') {
    this.state = {
      accounts: new Map(),
      transactions: new Map(),
      idempotency: new Map(),
      networkStatus: initialStatus,
      nextId: 1,
    }
  }

  setNetworkStatus(status: NetworkStatus) {
    this.state.networkStatus = status
  }

  async getNetworkStatus(): Promise<NetworkStatus> {
    return this.state.networkStatus
  }

  private ensureOnline() {
    if (this.state.networkStatus === 'offline') {
      throw new EconomicErrorImpl(
        'NETWORK',
        '616 está temporariamente indisponível.',
        'NETWORK_OFFLINE'
      )
    }
  }

  async createAccount(aquaProfileDid: string, label?: string) {
    this.ensureOnline()
    const id = `acc_${this.state.nextId++}`
    const address = `616mock_${id}`
    const now = new Date().toISOString()

    const identity: EconomicIdentity = {
      id,
      aquaProfileDid,
      network: this.networkId,
      accountId: id,
      address,
      status: 'active',
      createdAt: now,
      schemaVersion: 1,
    }

    const account: WalletAccount = {
      id,
      network: this.networkId,
      address,
      label: label ?? 'Conta principal',
      type: 'mock',
      status: 'active',
      createdAt: now,
      lastSyncedAt: now,
      schemaVersion: 1,
    }

    this.state.accounts.set(address, { identity, account, balance: 10000n }) // 100.00 616 iniciais

    return { identity, account }
  }

  async getAccount(address: string): Promise<WalletAccount | null> {
    return this.state.accounts.get(address)?.account ?? null
  }

  async getBalance(address: string): Promise<Balance[]> {
    this.ensureOnline()
    const acc = this.state.accounts.get(address)
    if (!acc) return []
    return [
      {
        assetId: NATIVE_ASSET,
        symbol: '616',
        amount: acc.balance.toString(),
        decimals: DECIMALS,
        available: acc.balance.toString(),
        pending: '0',
      },
    ]
  }

  async getTransactions(address: string, limit = 20): Promise<Transaction[]> {
    this.ensureOnline()
    const txs = Array.from(this.state.transactions.values())
      .filter((t) => t.from === address || t.to === address)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return txs.slice(0, limit)
  }

  async prepareTransfer(input: {
    from: string
    to: string
    assetId: string
    amount: string
    reference?: string
    idempotencyKey: string
  }) {
    this.ensureOnline()
    if (input.assetId !== NATIVE_ASSET) {
      throw new EconomicErrorImpl('VALIDATION', 'Apenas 616 é suportado no mock.', 'UNSUPPORTED_ASSET')
    }
    const amount = BigInt(input.amount)
    if (amount <= 0n) {
      throw new EconomicErrorImpl('VALIDATION', 'Valor deve ser positivo.', 'INVALID_AMOUNT')
    }
    const from = this.state.accounts.get(input.from)
    if (!from) throw new EconomicErrorImpl('VALIDATION', 'Conta de origem não encontrada.', 'ACCOUNT_NOT_FOUND')
    if (from.balance < amount) {
      throw new EconomicErrorImpl('BALANCE', 'Saldo insuficiente para concluir esta transferência.', 'INSUFFICIENT_FUNDS')
    }
    return { prepared: input, feeEstimate: '0' }
  }

  async submitTransfer(prepared: any): Promise<Transaction> {
    this.ensureOnline()
    const input = prepared as {
      from: string
      to: string
      assetId: string
      amount: string
      idempotencyKey: string
    }

    // Idempotency: retry não duplica
    const existingId = this.state.idempotency.get(input.idempotencyKey)
    if (existingId) {
      const existing = this.state.transactions.get(existingId)
      if (existing) return existing
    }

    const amount = BigInt(input.amount)
    const from = this.state.accounts.get(input.from)
    if (!from || from.balance < amount) {
      throw new EconomicErrorImpl('BALANCE', 'Saldo insuficiente.', 'INSUFFICIENT_FUNDS')
    }

    const toAcc = this.state.accounts.get(input.to)
    if (!toAcc) {
      throw new EconomicErrorImpl('VALIDATION', 'Destino inválido.', 'INVALID_DESTINATION')
    }

    const txId = `tx_${this.state.nextId++}`
    const now = new Date().toISOString()

    const tx: Transaction = {
      id: txId,
      network: this.networkId,
      txHash: `mockhash_${txId}`,
      type: 'transfer',
      from: input.from,
      to: input.to,
      assetId: NATIVE_ASSET,
      amount: input.amount,
      fee: '0',
      status: 'pending',
      createdAt: now,
      submittedAt: now,
      idempotencyKey: input.idempotencyKey,
      schemaVersion: 1,
    }

    // Debita imediatamente (simula pending)
    from.balance -= amount
    this.state.transactions.set(txId, tx)
    this.state.idempotency.set(input.idempotencyKey, txId)

    // Confirma assincronamente (simula rede)
    setTimeout(() => {
      const current = this.state.transactions.get(txId)
      if (current && current.status === 'pending') {
        current.status = 'confirmed'
        current.confirmedAt = new Date().toISOString()
        // Credita o destino
        const dest = this.state.accounts.get(input.to)
        if (dest) dest.balance += amount
      }
    }, 50)

    return tx
  }

  async getTransactionStatus(txId: string): Promise<Transaction | null> {
    return this.state.transactions.get(txId) ?? null
  }
}
