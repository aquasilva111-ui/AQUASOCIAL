import React, { useEffect, useState } from 'react'
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { useWallet } from './WalletContext'

export function WalletReceiveScreen() {
  const { service, account, loading } = useWallet()
  const [info, setInfo] = useState<any>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!account) return
    service.getReceiveInfo(account.address).then(setInfo)
  }, [account, service])

  const copy = async () => {
    if (!info) return
    await Clipboard.setStringAsync(info.address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading || !info) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Receber</Text>
      <Text style={styles.network}>Rede: {info.network}</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Endereço</Text>
        <Text style={styles.address} selectable>{info.address}</Text>
        <Text style={styles.uri}>{info.uri}</Text>

        <Pressable style={styles.copyBtn} onPress={copy}>
          <Text style={styles.copyText}>{copied ? 'Copiado!' : 'Copiar endereço'}</Text>
        </Pressable>
      </View>

      <Text style={styles.hint}>{info.memoHint}</Text>
      <Text style={styles.warning}>Nunca compartilhe sua seed ou chave privada.</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b1220', padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 28, fontWeight: '700', color: '#fff', marginBottom: 8 },
  network: { color: '#7EC8F5', marginBottom: 20 },
  card: {
    backgroundColor: '#11278c',
    borderRadius: 16,
    padding: 20,
  },
  label: { color: '#aaa', fontSize: 13, marginBottom: 4 },
  address: { color: '#fff', fontSize: 16, fontFamily: 'monospace', marginBottom: 8 },
  uri: { color: '#7EC8F5', fontSize: 13, marginBottom: 16 },
  copyBtn: {
    backgroundColor: '#0D2BDB',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  copyText: { color: '#fff', fontWeight: '600' },
  hint: { color: '#888', marginTop: 16, fontSize: 13 },
  warning: { color: '#f87171', marginTop: 20, fontSize: 13 },
})
