import React, { useEffect, useState } from 'react'
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native'
import { useWallet } from './WalletContext'

export function WalletOverviewScreen() {
  const { service, account, loading } = useWallet()
  const [overview, setOverview] = useState<any>(null)

  useEffect(() => {
    if (!account) return
    service.getOverview(account.address).then(setOverview)
  }, [account, service])

  if (loading || !overview) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.muted}>Carregando carteira…</Text>
      </View>
    )
  }

  const balance = overview.balances[0]
  const displayAmount = (BigInt(balance?.available ?? '0') / 100n).toString()

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>AQUA Wallet</Text>
        <Text style={styles.network}>616 MOCK NETWORK</Text>
      </View>

      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Saldo</Text>
        <Text style={styles.balance}>{displayAmount} 616</Text>
        <Text style={styles.pending}>Royalties pendentes: {overview.pendingRoyalties}</Text>
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.actionBtn}>
          <Text style={styles.actionText}>Receber</Text>
        </Pressable>
        <Pressable style={styles.actionBtn}>
          <Text style={styles.actionText}>Enviar</Text>
        </Pressable>
      </View>

      <Text style={styles.section}>Atividade recente</Text>
      {overview.recentTransactions.length === 0 ? (
        <Text style={styles.muted}>Nenhuma transação ainda.</Text>
      ) : (
        overview.recentTransactions.map((tx: any) => (
          <View key={tx.id} style={styles.txRow}>
            <Text style={styles.txType}>{tx.type}</Text>
            <Text style={styles.txAmount}>{tx.amount} 616</Text>
            <Text style={styles.txStatus}>{tx.status}</Text>
          </View>
        ))
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b1220', padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { marginBottom: 20 },
  title: { fontSize: 28, fontWeight: '700', color: '#fff' },
  network: { color: '#7EC8F5', fontSize: 12, marginTop: 4 },
  balanceCard: {
    backgroundColor: '#11278c',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  balanceLabel: { color: '#aaa', fontSize: 14 },
  balance: { color: '#fff', fontSize: 36, fontWeight: '700', marginVertical: 4 },
  pending: { color: '#7EC8F5', fontSize: 13 },
  actions: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  actionBtn: {
    flex: 1,
    backgroundColor: '#0D2BDB',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  actionText: { color: '#fff', fontWeight: '600' },
  section: { color: '#fff', fontSize: 18, fontWeight: '600', marginBottom: 12 },
  muted: { color: '#888' },
  txRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  txType: { color: '#fff' },
  txAmount: { color: '#7EC8F5' },
  txStatus: { color: '#aaa', fontSize: 12 },
})
