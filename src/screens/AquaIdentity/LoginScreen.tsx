import {useState} from 'react'
import {View} from 'react-native'

import {readAquaIdentityConfig} from '#/lib/aqua-identity/config'
import {prepareOAuthSignIn} from '#/lib/aqua-identity/flow'
import {beginPublicOAuth} from '#/lib/aqua-identity/oauth-browser'
import {
  requestOwnPdsPasswordReset,
  resetOwnPdsPassword,
} from '#/lib/aqua-identity/pds'
import {reasonText} from '#/lib/aqua-identity/reasons'
import {attemptLimiter} from '#/lib/aqua-identity/runtime'
import {atoms as a, useTheme} from '#/alf'
import {Admonition} from '#/components/Admonition'
import {Button, ButtonText} from '#/components/Button'
import {FormError} from '#/components/forms/FormError'
import * as TextField from '#/components/forms/TextField'
import {At_Stroke2_Corner0_Rounded as AtIcon} from '#/components/icons/At'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'
import {HintText, IdentityShell} from './IdentityShell'

export function AquaIdentityLoginScreen() {
  const t = useTheme()
  const [identifier, setIdentifier] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [recovery, setRecovery] = useState(false)
  const [email, setEmail] = useState('')
  const [token, setToken] = useState('')
  const [password, setPassword] = useState('')

  const signIn = async () => {
    setError('')
    setNotice('')
    setBusy(true)
    try {
      const prepared = await prepareOAuthSignIn({
        identifier,
        config: readAquaIdentityConfig(),
        limiter: attemptLimiter(),
        fetch: globalThis.fetch.bind(globalThis),
      })
      if (!prepared.ok) {
        setError(reasonText(prepared.reason, prepared.message))
        return
      }
      const started = await beginPublicOAuth(prepared.pending)
      if (!started.ok) {
        setError(reasonText(started.reason, started.message))
      }
    } finally {
      setBusy(false)
    }
  }

  const sendReset = async () => {
    setError('')
    setNotice('')
    setBusy(true)
    try {
      const result = await requestOwnPdsPasswordReset({
        config: readAquaIdentityConfig(),
        email,
        limiter: attemptLimiter(),
        fetch: globalThis.fetch.bind(globalThis),
      })
      if (!result.ok) {
        setError(reasonText(result.reason, result.message))
        return
      }
      setNotice(
        'Se esse e-mail existir no PDS da AQUA, o código de recuperação foi enviado. A senha não passa pela AQUA.',
      )
    } finally {
      setBusy(false)
    }
  }

  const confirmReset = async () => {
    setError('')
    setNotice('')
    setBusy(true)
    try {
      const result = await resetOwnPdsPassword({
        config: readAquaIdentityConfig(),
        token,
        password,
        limiter: attemptLimiter(),
        fetch: globalThis.fetch.bind(globalThis),
      })
      setPassword('')
      if (!result.ok) {
        setError(reasonText(result.reason, result.message))
        return
      }
      setToken('')
      setNotice('Senha do PDS atualizada. Ela não ficou armazenada na AQUA.')
    } finally {
      setBusy(false)
      setPassword('')
    }
  }

  return (
    <IdentityShell
      testID="aquaIdentityLogin"
      leadin="AQUA"
      title="Entrar"
      description="Sua conta é o DID. A senha do Bluesky não entra aqui.">
      <Admonition type="tip">
        Contas que já existem no Bluesky entram por OAuth do AT Protocol. A AQUA
        não pede nem guarda essa senha.
      </Admonition>
      <View>
        <TextField.LabelText>Handle ou DID</TextField.LabelText>
        <TextField.Root>
          <TextField.Icon icon={AtIcon} />
          <TextField.Input
            testID="aquaIdentityIdentifier"
            label="Handle ou DID"
            value={identifier}
            onChangeText={setIdentifier}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            editable={!busy}
          />
        </TextField.Root>
      </View>
      <FormError error={error} />
      {notice ? (
        <Text style={[a.text_sm, t.atoms.text_contrast_high]}>{notice}</Text>
      ) : null}
      <Button
        testID="aquaIdentitySignIn"
        label="Entrar com AT Protocol"
        color="primary"
        size="large"
        disabled={busy || !identifier.trim()}
        onPress={() => {
          signIn().catch(() => {})
        }}>
        <ButtonText>Entrar com AT Protocol</ButtonText>
      </Button>
      <HintText>
        A associação interna usa o DID estável. Se o handle mudar, a conta
        continua a mesma.
      </HintText>
      <Link to="/register" label="Criar conta AQUA">
        <Text style={[a.text_md, a.font_bold, {color: t.palette.primary_500}]}>
          Criar conta no PDS da AQUA
        </Text>
      </Link>
      <Button
        label="Recuperar acesso do PDS AQUA"
        color="secondary"
        size="large"
        onPress={() => setRecovery(value => !value)}>
        <ButtonText>Recuperar acesso do PDS AQUA</ButtonText>
      </Button>
      {recovery ? (
        <View style={[a.gap_md]}>
          <HintText>
            Isso só fala com o PDS da AQUA, se ele estiver configurado. Uma
            conta Bluesky recupera a senha no PDS dela.
          </HintText>
          <TextField.LabelText>E-mail</TextField.LabelText>
          <TextField.Root>
            <TextField.Input
              label="E-mail de recuperação"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
            />
          </TextField.Root>
          <Button
            label="Enviar código de recuperação"
            color="secondary"
            size="large"
            disabled={busy || !email.trim()}
            onPress={() => {
              sendReset().catch(() => {})
            }}>
            <ButtonText>Enviar código</ButtonText>
          </Button>
          <TextField.LabelText>Código e nova senha</TextField.LabelText>
          <TextField.Root>
            <TextField.Input
              label="Código de recuperação"
              value={token}
              onChangeText={setToken}
              autoCapitalize="none"
            />
          </TextField.Root>
          <TextField.Root>
            <TextField.Input
              label="Nova senha do PDS"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
            />
          </TextField.Root>
          <Button
            label="Definir nova senha"
            color="primary"
            size="large"
            disabled={busy || !token.trim() || !password}
            onPress={() => {
              confirmReset().catch(() => {})
            }}>
            <ButtonText>Definir nova senha</ButtonText>
          </Button>
        </View>
      ) : null}
    </IdentityShell>
  )
}
