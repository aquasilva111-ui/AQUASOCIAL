import React, { createContext, useContext, useEffect, useState } from 'react'
import { Mock616Adapter } from '../../../aqua-economy/src/mock616'
import { WalletService } from '../../../aqua-economy/src/wallet'
import type { WalletAccount } from '../../../aqua-economy/src/types'

interface WalletContextValue {
  service: WalletService
  account: WalletAccount | null
  loading: boolean
  refresh: () => Promise<void>
}

const WalletContext = createContext<WalletContextValue | null>(null)

const adapter = new Mock616Adapter()
const service = new WalletService(adapter)

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<WalletAccount | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    // Em produção isso viria da identidade AQUA (DID) do usuário logado
    const { account: acc } = await service.createAccount('did:plc:mock-user', 'Minha carteira')
    setAccount(acc)
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [])

  return (
    <WalletContext.Provider value={{ service, account, loading, refresh }}>
      {children}
    </WalletContext.Provider>
  )
}

export function useWallet() {
  const ctx = useContext(WalletContext)
  if (!ctx) throw new Error('useWallet must be used inside WalletProvider')
  return ctx
}
