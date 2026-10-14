import type {
  Balance,
  EconomicIdentity,
  NetworkStatus,
  Transaction,
  WalletAccount,
} from './types'

/**
 * Contrato que qualquer rede econômica (Mock616, Real616) deve implementar.
 * A UI e o WalletService só conhecem esta interface.
 */
export interface EconomicNetworkAdapter {
  readonly networkId: string

  getNetworkStatus(): Promise<NetworkStatus>

  createAccount(aquaProfileDid: string, label?: string): Promise<{
    identity: EconomicIdentity
    account: WalletAccount
  }>

  getAccount(address: string): Promise<WalletAccount | null>

  getBalance(address: string, assetId?: string): Promise<Balance[]>

  getTransactions(address: string, limit?: number): Promise<Transaction[]>

  prepareTransfer(input: {
    from: string
    to: string
    assetId: string
    amount: string
    reference?: string
    idempotencyKey: string
  }): Promise<{ prepared: unknown; feeEstimate?: string }>

  submitTransfer(
    prepared: unknown,
    signature?: string
  ): Promise<Transaction>

  getTransactionStatus(txId: string): Promise<Transaction | null>

  // Extensões futuras (royalties, assets, credits) podem ser adicionadas aqui
}
