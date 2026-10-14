import type { EconomicNetworkAdapter } from './adapter'
import type {
  Balance,
  EconomicIdentity,
  NetworkStatus,
  Transaction,
  WalletAccount,
} from './types'
import { EconomicErrorImpl } from './types'

/**
 * WalletService — camada de orquestração entre UI e EconomicNetworkAdapter.
 * A UI só fala com este serviço (ou com métodos expostos por ele).
 * Nunca chama o adapter de rede diretamente.
 */
export class WalletService {
  constructor(private adapter: EconomicNetworkAdapter) {}

  async getNetworkStatus(): Promise<NetworkStatus> {
    return this.adapter.getNetworkStatus()
  }

  async createAccount(aquaProfileDid: string, label?: string): Promise<{
    identity: EconomicIdentity
    account: WalletAccount
  }> {
    return this.adapter.createAccount(aquaProfileDid, label)
  }

  async getAccount(address: string): Promise<WalletAccount | null> {
    return this.adapter.getAccount(address)
  }

  async getBalances(address: string): Promise<Balance[]> {
    return this.adapter.getBalance(address)
  }

  async getTransactions(address: string, limit?: number): Promise<Transaction[]> {
    return this.adapter.getTransactions(address, limit)
  }

  /**
   * Prepara uma transferência (validações de saldo, destino, etc.).
   * A UI deve mostrar o resumo e pedir confirmação explícita antes de chamar submit.
   */
  async prepareSend(input: {
    from: string
    to: string
    assetId: string
    amount: string
    reference?: string
    idempotencyKey: string
  }) {
    return this.adapter.prepareTransfer(input)
  }

  /**
   * Submete a transferência já preparada.
   * IdempotencyKey deve ser o mesmo usado no prepare.
   */
  async submitSend(prepared: unknown): Promise<Transaction> {
    return this.adapter.submitTransfer(prepared)
  }

  async getTransaction(txId: string): Promise<Transaction | null> {
    return this.adapter.getTransactionStatus(txId)
  }

  /**
   * Visão resumida para a tela Overview da Wallet.
   */
  async getOverview(address: string) {
    const [status, balances, transactions] = await Promise.all([
      this.getNetworkStatus(),
      this.getBalances(address),
      this.getTransactions(address, 10),
    ])

    const totalAvailable = balances.reduce((sum, b) => sum + BigInt(b.available), 0n)

    return {
      networkStatus: status,
      balances,
      totalAvailable: totalAvailable.toString(),
      recentTransactions: transactions,
      // Placeholders para fases futuras
      pendingRoyalties: '0',
      incomeThisMonth: '0',
    }
  }

  /**
   * Gera informações para receber (address + URI mock).
   * Nunca expõe private key.
   */
  async getReceiveInfo(address: string) {
    const account = await this.getAccount(address)
    if (!account) {
      throw new EconomicErrorImpl('VALIDATION', 'Conta não encontrada.', 'ACCOUNT_NOT_FOUND')
    }
    return {
      network: account.network,
      address: account.address,
      // URI mock — formato real será definido quando a 616 existir
      uri: `616mock:${account.address}`,
      memoHint: 'Opcional — referência para o remetente',
    }
  }
}
