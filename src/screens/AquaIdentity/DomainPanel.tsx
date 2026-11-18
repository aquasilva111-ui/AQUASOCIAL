import {useState} from 'react'
import {View} from 'react-native'
import {useNavigation} from '@react-navigation/native'

import {readAquaIdentityConfig} from '#/lib/aqua-identity/config'
import {
  dnsTxtName,
  dnsTxtValue,
  verifyHandleDid,
  wellKnownBody,
  wellKnownUrl,
} from '#/lib/aqua-identity/domain'
import {formatAquaHandle, planHandleChange} from '#/lib/aqua-identity/handles'
import {runIdentityProcedure} from '#/lib/aqua-identity/oauth-browser'
import {reasonText} from '#/lib/aqua-identity/reasons'
import {updateCurrentHandle} from '#/lib/aqua-identity/runtime'
import {type NavigationProp} from '#/lib/routes/types'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {FormError} from '#/components/forms/FormError'
import * as TextField from '#/components/forms/TextField'
import {Text} from '#/components/Typography'
import {HintText} from './IdentityShell'
import {useCurrentIdentity} from './useCurrentIdentity'

export function DomainPanel() {
  const t = useTheme()
  const account = useCurrentIdentity()
  const config = readAquaIdentityConfig()
  const [local, setLocal] = useState('')
  const [custom, setCustom] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const aqua = formatAquaHandle(local || 'nome', config.handleDomain)

  const apply = async (nextHandle: string) => {
    setError('')
    setNotice('')
    if (!account) {
      setError(reasonText('missing-did'))
      return
    }
    const plan = planHandleChange({
      did: account.did,
      currentHandle: account.handle,
      nextHandle,
    })
    if (!plan.ok) {
      setError(reasonText(plan.reason))
      return
    }
    setBusy(true)
    try {
      const verified = await verifyHandleDid({
        handle: plan.to,
        expectedDid: plan.did,
        fetch: globalThis.fetch.bind(globalThis),
        dohUrl: config.dohUrl,
      })
      if (!verified.ok) {
        setError(reasonText(verified.reason))
        setNotice(
          'O DID da conta não muda. Publique o registro e tente de novo.',
        )
        return
      }
      const updated = await runIdentityProcedure({
        nsid: 'com.atproto.identity.updateHandle',
        body: {handle: plan.to},
      })
      if (!updated.ok) {
        setError(reasonText(updated.reason, updated.message))
        return
      }
      updateCurrentHandle(plan.to)
      setNotice(
        `Handle atualizado para ${plan.to}. O DID continua ${plan.did}.`,
      )
    } finally {
      setBusy(false)
    }
  }

  const did = account?.did
  const previewHandle = custom.trim() || (aqua.ok ? aqua.handle : '')

  return (
    <View style={[a.gap_md]}>
      <Text style={[a.text_lg, a.font_bold, t.atoms.text_contrast_high]}>
        Handle
      </Text>
      <HintText>
        A conta é o DID. O handle AQUA fica no domínio configurado. Um domínio
        próprio precisa publicar esse mesmo DID e pode voltar depois.
      </HintText>
      {did ? (
        <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>DID {did}</Text>
      ) : (
        <HintText>O DID aparece aqui depois da entrada.</HintText>
      )}
      <View>
        <TextField.LabelText>Nome no domínio AQUA</TextField.LabelText>
        <TextField.Root>
          <TextField.Input
            label="Nome do handle"
            value={local}
            onChangeText={setLocal}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </TextField.Root>
        <HintText>
          {config.handleDomain
            ? aqua.ok
              ? `Ficaria ${aqua.handle}`
              : reasonText(aqua.reason)
            : reasonText('handle-domain-unset')}
        </HintText>
      </View>
      <View>
        <TextField.LabelText>Domínio próprio</TextField.LabelText>
        <TextField.Root>
          <TextField.Input
            label="Handle de domínio próprio"
            value={custom}
            onChangeText={setCustom}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="nome.exemplo.com"
          />
        </TextField.Root>
      </View>
      {previewHandle && did ? (
        <View style={[a.gap_xs]}>
          <Text style={[a.text_sm, a.font_bold]}>Publicar antes de trocar</Text>
          <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
            DNS TXT {dnsTxtName(previewHandle)} = {dnsTxtValue(did)}
          </Text>
          <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
            {wellKnownUrl(previewHandle)} com o texto {wellKnownBody(did)}
          </Text>
        </View>
      ) : null}
      <FormError error={error} />
      {notice ? (
        <Text style={[a.text_sm, t.atoms.text_contrast_high]}>{notice}</Text>
      ) : null}
      <Button
        label="Usar domínio próprio"
        color="primary"
        size="large"
        disabled={busy || !custom.trim()}
        onPress={() => {
          apply(custom).catch(() => {})
        }}>
        <ButtonText>Usar domínio próprio</ButtonText>
      </Button>
      <Button
        label="Voltar ao handle AQUA"
        color="secondary"
        size="large"
        disabled={busy || !aqua.ok || !local.trim()}
        onPress={() => {
          if (aqua.ok) apply(aqua.handle).catch(() => {})
        }}>
        <ButtonText>Voltar ao handle AQUA</ButtonText>
      </Button>
    </View>
  )
}

export function useGoToIdentity() {
  const navigation = useNavigation<NavigationProp>()
  return {
    login: () => navigation.navigate('AquaIdentityLogin'),
    register: () => navigation.navigate('AquaIdentityRegister'),
    onboarding: () => navigation.navigate('AquaIdentityOnboarding'),
  }
}
