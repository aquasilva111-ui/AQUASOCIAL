import React, { useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native'
import { useWallet } from './WalletContext'

export function WalletSendScreen() {
  const { service, account } = useWallet()
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [prepared, setPrepared] = useState<any>(null)

  const prepare = async () => {
    if (!account || !to || !amount) return
    setBusy(true)
    try {
      const result = await service.prepareSend({
        from: account.address,
        to,
        assetId: '616',
        amount: (BigInt(amount) * 100n).toString(), // major → minor
        reference: note || undefined,
        idempotencyKey: `send-${Date.now()}`,
      })
      setPrepared(result)
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Não foi possível preparar a transferência.')
    } finally {
      setBusy(false)
    }
  }

  const confirm = async () => {
    if (!prepared) return
    setBusy(true)
    try {
      const tx = await service.submitSend(prepared.prepared)
      Alert.alert('Enviado', `Transação ${tx.id} está ${tx.status}.`)
      setPrepared(null)
      setTo('')
      setAmount('')
      setNote('')
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Falha ao enviar.')
    } finally {
      setBusy(false)
    }
  }

  if (prepared) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Confirmar envio</Text>
        <View style={styles.summary}>
          <Text style={styles.line}>Você está enviando:</Text>
          <Text style={styles.amount}>{amount} 616</Text>
          <Text style={styles.line}>Para:</Text>
          <Text style={styles.mono}>{to}</Text>
          <Text style={styles.line}>Rede: 616 MOCK</Text>
          <Text style={styles.line}>Taxa: 0</Text>
        </View>
        <Pressable style={styles.confirmBtn} onPress={confirm} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Confirmar</Text>}
        </Pressable>
        <Pressable onPress={() => setPrepared(null)}>
          <Text style={styles.cancel}>Cancelar</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Enviar</Text>
      <TextInput
        style={styles.input}
        placeholder="Endereço de destino"
        placeholderTextColor="#666"
        value={to}
        onChangeText={setTo}
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        placeholder="Quantidade (616)"
        placeholderTextColor="#666"
        value={amount}
        onChangeText={setAmount}
        keyboardType="numeric"
      />
      <TextInput
        style={styles.input}
        placeholder="Nota (opcional)"
        placeholderTextColor="#666"
        value={note}
        onChangeText={setNote}
      />
      <Pressable style={styles.sendBtn} onPress={prepare} disabled={busy || !to || !amount}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Continuar</Text>}
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b1220', padding: 16 },
  title: { fontSize: 28, fontWeight: '700', color: '#fff', marginBottom: 20 },
  input: {
    backgroundColor: '#1e293b',
    color: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    fontSize: 16,
  },
  sendBtn: {
    backgroundColor: '#0D2BDB',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  confirmBtn: {
    backgroundColor: '#16a34a',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  summary: { backgroundColor: '#11278c', borderRadius: 16, padding: 20 },
  line: { color: '#aaa', marginTop: 8 },
  amount: { color: '#fff', fontSize: 28, fontWeight: '700' },
  mono: { color: '#7EC8F5', fontFamily: 'monospace' },
  cancel: { color: '#888', textAlign: 'center', marginTop: 16 },
})
