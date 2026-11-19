import {useEffect, useState} from 'react'
import {View} from 'react-native'

import {IDENTITY_616_BOUNDARY} from '#/lib/aqua-identity/boundary-616'
import {readAquaIdentityConfig} from '#/lib/aqua-identity/config'
import {runIdentityProcedure} from '#/lib/aqua-identity/oauth-browser'
import {reasonText} from '#/lib/aqua-identity/reasons'
import {markEmailConfirmed} from '#/lib/aqua-identity/runtime'
import {
  loadServiceSession,
  type ServiceSessionView,
} from '#/lib/aqua-identity/social'
import {atoms as a, useTheme} from '#/alf'
import {Admonition} from '#/components/Admonition'
import {Button, ButtonText} from '#/components/Button'
import {FormError} from '#/components/forms/FormError'
import * as TextField from '#/components/forms/TextField'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'
import {DomainPanel} from './DomainPanel'
import {HintText, IdentityShell} from './IdentityShell'
import {useCurrentIdentity} from './useCurrentIdentity'

const STEPS = ['Identidade', 'Handle', 'E-mail'] as const

export function AquaIdentityOnboardingScreen() {
  const t = useTheme()
  const account = useCurrentIdentity()
  const serviceUrl = readAquaIdentityConfig().serviceUrl
  const [serviceSession, setServiceSession] = useState<ServiceSessionView>()
  const [email, setEmail] = useState(account?.email ?? '')
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!serviceUrl) return
    let cancelled = false
    loadServiceSession(serviceUrl, globalThis.fetch.bind(globalThis)).then(
      next => {
        if (!cancelled) setServiceSession(next)
      },
    )
    return () => {
      cancelled = true
    }
  }, [serviceUrl])

  const sendEmail = async () => {
    setError('')
    setNotice('')
    setBusy(true)
    try {
      const result = await runIdentityProcedure({
        nsid: 'com.atproto.server.requestEmailConfirmation',
      })
      if (!result.ok) {
        setError(reasonText(result.reason, result.message))
        return
      }
      setNotice('Pedido de confirmação enviado pelo PDS.')
    } finally {
      setBusy(false)
    }
  }

  const confirmEmail = async () => {
    setError('')
    setNotice('')
    setBusy(true)
    try {
      const result = await runIdentityProcedure({
        nsid: 'com.atproto.server.confirmEmail',
        body: {email: email.trim(), token: token.trim()},
      })
      if (!result.ok) {
        setError(reasonText(result.reason, result.message))
        return
      }
      markEmailConfirmed(true)
      setToken('')
      setNotice('E-mail confirmado no PDS.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <IdentityShell
      testID="aquaIdentityOnboarding"
      leadin="AQUA"
      title="Começar"
      description="O DID fica. O handle e o e-mail se ajustam depois.">
      <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
        {STEPS.map((step, index) => (
          <Text
            key={step}
            style={[a.text_sm, a.font_bold, t.atoms.text_contrast_medium]}>
            {index + 1}. {step}
            {index < STEPS.length - 1 ? '  ›' : ''}
          </Text>
        ))}
      </View>
      {serviceSession?.authenticated ? (
        <Admonition type="tip">
          Sessão do serviço de identidade
          {serviceSession.authorization?.did
            ? `, DID ${serviceSession.authorization.did}`
            : ', ainda sem DID'}
          . O id interno não muda quando o handle muda.
        </Admonition>
      ) : null}
      {account ? (
        <Admonition type="tip">
          Conta associada pelo DID {account.did}. Método{' '}
          {account.method === 'oauth' ? 'OAuth' : 'PDS da AQUA'}.
          {account.handle ? ` Handle atual ${account.handle}.` : ''}
        </Admonition>
      ) : (
        <Admonition type="info">
          Ainda não há uma sessão AQUA Identity. Entre com um handle ou DID, ou
          crie a conta quando o PDS existir.
        </Admonition>
      )}
      <Link to="/login" label="Ir para entrar">
        <Text style={[a.text_md, a.font_bold, {color: t.palette.primary_500}]}>
          Entrar
        </Text>
      </Link>
      <DomainPanel />
      <View style={[a.gap_sm]}>
        <Text style={[a.text_lg, a.font_bold]}>E-mail</Text>
        <HintText>
          A confirmação é um procedimento do PDS. Sem sessão ativa, o botão
          explica o que falta em vez de fingir que enviou.
        </HintText>
        <TextField.LabelText>E-mail</TextField.LabelText>
        <TextField.Root>
          <TextField.Input
            label="E-mail"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
          />
        </TextField.Root>
        <TextField.LabelText>Código de confirmação</TextField.LabelText>
        <TextField.Root>
          <TextField.Input
            label="Código de confirmação"
            value={token}
            onChangeText={setToken}
            autoCapitalize="none"
          />
        </TextField.Root>
        <FormError error={error} />
        {notice ? (
          <Text style={[a.text_sm, t.atoms.text_contrast_high]}>{notice}</Text>
        ) : null}
        <Button
          label="Enviar confirmação de e-mail"
          color="secondary"
          size="large"
          disabled={busy}
          onPress={() => {
            sendEmail().catch(() => {})
          }}>
          <ButtonText>Enviar confirmação</ButtonText>
        </Button>
        <Button
          label="Confirmar e-mail"
          color="primary"
          size="large"
          disabled={busy || !email.trim() || !token.trim()}
          onPress={() => {
            confirmEmail().catch(() => {})
          }}>
          <ButtonText>Confirmar e-mail</ButtonText>
        </Button>
      </View>
      <HintText>
        A identidade AT Protocol não depende da 616. No futuro a 616 pode
        apontar um recurso para um DID autorizado, sem receber senha, e-mail ou
        token. Estado: {IDENTITY_616_BOUNDARY.futureAssociation}.
      </HintText>
    </IdentityShell>
  )
}
