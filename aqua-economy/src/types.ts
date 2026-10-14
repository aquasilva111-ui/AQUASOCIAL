/**
 * Domínio econômico do AQUA — modelos puros.
 * A UI nunca fala com a rede diretamente.
 * Tudo passa por adapters (Mock616 primeiro).
 */

export const SCHEMA_VERSION = 1

export type NetworkStatus = 'online' | 'degraded' | 'offline' | 'syncing'

export interface EconomicIdentity {
  id: string
  aquaProfileDid: string
  network: string
  accountId: string
  address: string
  publicKey?: string
  status: 'active' | 'pending' | 'suspended'
  createdAt: string
  schemaVersion: number
}

export type WalletAccountType = 'mock' | 'local-dev' | 'external' | 'custodial' | 'hardware' | 'watch-only'

export interface WalletAccount {
  id: string
  network: string
  address: string
  label?: string
  type: WalletAccountType
  status: 'active' | 'inactive'
  createdAt: string
  lastSyncedAt?: string
  schemaVersion: number
}

export interface Balance {
  assetId: string
  symbol: string
  amount: string // stringified bigint in minor units (or whole units for 616)
  decimals: number
  available: string
  pending: string
  locked?: string
}

export type TransactionType =
  | 'transfer'
  | 'payment'
  | 'royalty'
  | 'purchase'
  | 'donation'
  | 'subscription'
  | 'license'

export type TransactionStatus =
  | 'draft'
  | 'signing'
  | 'submitted'
  | 'pending'
  | 'confirmed'
  | 'failed'
  | 'cancelled'

export interface Transaction {
  id: string
  network: string
  txHash?: string
  type: TransactionType
  from: string
  to: string
  assetId: string
  amount: string
  fee?: string
  status: TransactionStatus
  createdAt: string
  submittedAt?: string
  confirmedAt?: string
  metadata?: Record<string, unknown>
  idempotencyKey?: string
  schemaVersion: number
}

export interface AssetSummary {
  id: string
  type: string
  name: string
  symbol?: string
  contentHash?: string
  owner: string
  creator?: string
  status: string
}

export interface EconomicError {
  category:
    | 'NETWORK'
    | 'AUTH'
    | 'SIGNATURE'
    | 'BALANCE'
    | 'VALIDATION'
    | 'PERMISSION'
    | 'TIMEOUT'
    | 'CONFLICT'
    | 'UNKNOWN'
  message: string
  code?: string
}

export class EconomicErrorImpl extends Error implements EconomicError {
  category: EconomicError['category']
  code?: string
  constructor(category: EconomicError['category'], message: string, code?: string) {
    super(message)
    this.category = category
    this.code = code
    this.name = 'EconomicError'
  }
}
