import {useEffect, useState} from 'react'
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
import {
  atprotoServiceLoginUrl,
  emptySocialDirectory,
  loadSocialDirectory,
  postIdentityService,
  readSocialError,
  socialAuthorizeUrl,
  type SocialDirectory,
  type SocialOAuthButton,
} from '#/lib/aqua-identity/social'
import {atoms as a, useTheme} from '#/alf'
import {Admonition} from '#/components/Admonition'
import {Button, ButtonText} from '#/components/Button'
import {FormError} from '#/components/forms/FormError'
import * as TextField from '#/components/forms/TextField'
import {At_Stroke2_Corner0_Rounded as AtIcon} from '#/components/icons/At'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'
import {HintText, IdentityShell} from './IdentityShell'

const OAUTH_LABEL: Record<SocialOAuthButton, string> = {
  google: 'Continuar com Google',
  apple: 'Continuar com Apple',
  github: 'Continuar com GitHub',
}

function openService(url: string) {
  if (typeof window === 'undefined') return
  window.location.assign(url)
}

export function AquaIdentityLoginScreen() {
  const t = useTheme()
  const serviceUrl = readAquaIdentityConfig().serviceUrl
  const [directory, setDirectory] =
    useState<SocialDirectory>(emptySocialDirectory)
  const [identifier, setIdentifier] = useState('')
  const [error, setError] = useState(() => {
    const search = typeof location === 'undefined' ? '' : location.search
    const code = readSocialError(search)
    return code ? reasonText(code) : ''
  })
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [recovery, setRecovery] = useState(false)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [token, setToken] = useState('')
  const [password, setPassword] = useState('')
  const [aquaPassword, setAquaPassword] = useState('')

  useEffect(() => {
    if (!serviceUrl) return
    let cancelled = false
    loadSocialDirectory(serviceUrl, globalThis.fetch.bind(globalThis)).then(
      next => {
        if (!cancelled) setDirectory(next)
      },
    )
    return () => {
      cancelled = true
    }
  }, [serviceUrl])

  const signIn = async () => {
    setError('')
    setNotice('')
    setBusy(true)
    try {
      if (directory.atproto && serviceUrl && typeof window !== 'undefined') {
        openService(atprotoServiceLoginUrl(serviceUrl, identifier))
        return
      }
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

  const sendCode = async () => {
    setError('')
    setNotice('')
    setBusy(true)
    try {
      const result = await postIdentityService(
        serviceUrl,
        '/login/email/start',
        {email: email.trim()},
      )
      if (!result.ok) {
        setError(reasonText(result.reason))
        return
      }
      setNotice(
        'Se o envio estiver disponível, o código chega nesse e-mail. Ele expira e a AQUA não guarda a senha de outro provedor.',
      )
    } finally {
      setBusy(false)
    }
  }

  const finishCode = async () => {
    setError('')
    setNotice('')
    setBusy(true)
    try {
      const result = await postIdentityService(
        serviceUrl,
        '/login/email/finish',
        {email: email.trim(), code: code.trim()},
      )
      if (!result.ok) {
        setError(reasonText(result.reason))
        return
      }
      if (typeof window !== 'undefined') {
        openService(
          new URL('/settings/identity', window.location.origin).toString(),
        )
      }
    } finally {
      setBusy(false)
    }
  }

  const finishPassword = async () => {
    setError('')
    setNotice('')
    setBusy(true)
    try {
      const result = await postIdentityService(serviceUrl, '/login/password', {
        email: email.trim(),
        password: aquaPassword,
      })
      setAquaPassword('')
      if (!result.ok) {
        setError(reasonText(result.reason))
        return
      }
      if (typeof window !== 'undefined') {
        openService(
          new URL('/settings/identity', window.location.origin).toString(),
        )
      }
    } finally {
      setBusy(false)
      setAquaPassword('')
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

  const oauthButtons = directory.providers.filter(
    (provider): provider is SocialOAuthButton =>
      provider === 'google' || provider === 'apple' || provider === 'github',
  )

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
      {oauthButtons.length > 0 || directory.providers.includes('email') ? (
        <View style={[a.gap_md]}>
          <Text style={[a.text_md, a.font_bold, t.atoms.text_contrast_high]}>
            Outros provedores
          </Text>
          <HintText>
            Só aparecem os provedores configurados no serviço de identidade. O
            segredo fica no servidor. Google, Apple e GitHub não entregam a
            senha deles para a AQUA.
          </HintText>
          {oauthButtons.map(provider => (
            <Button
              key={provider}
              label={OAUTH_LABEL[provider]}
              color="secondary"
              size="large"
              disabled={busy}
              onPress={() => {
                openService(socialAuthorizeUrl(serviceUrl, provider, 'login'))
              }}>
              <ButtonText>{OAUTH_LABEL[provider]}</ButtonText>
            </Button>
          ))}
          {directory.providers.includes('email') ? (
            <View style={[a.gap_md]}>
              <TextField.LabelText>E-mail</TextField.LabelText>
              <TextField.Root>
                <TextField.Input
                  testID="aquaIdentityEmail"
                  label="E-mail"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  editable={!busy}
                />
              </TextField.Root>
              <Button
                label="Enviar código por e-mail"
                color="secondary"
                size="large"
                disabled={busy || !email.trim()}
                onPress={() => {
                  sendCode().catch(() => {})
                }}>
                <ButtonText>Enviar código</ButtonText>
              </Button>
              <TextField.LabelText>Código</TextField.LabelText>
              <TextField.Root>
                <TextField.Input
                  testID="aquaIdentityEmailCode"
                  label="Código de acesso"
                  value={code}
                  onChangeText={setCode}
                  autoCapitalize="none"
                  editable={!busy}
                />
              </TextField.Root>
              <Button
                label="Entrar com o código"
                color="primary"
                size="large"
                disabled={busy || !email.trim() || !code.trim()}
                onPress={() => {
                  finishCode().catch(() => {})
                }}>
                <ButtonText>Entrar com o código</ButtonText>
              </Button>
            </View>
          ) : null}
          {directory.providers.includes('password') ? (
            <View style={[a.gap_md]}>
              <TextField.LabelText>Senha AQUA</TextField.LabelText>
              <HintText>
                Esta senha é da conta AQUA, com hash no serviço. Não é a senha
                do Google nem a do Bluesky.
              </HintText>
              <TextField.Root>
                <TextField.Input
                  label="Senha AQUA"
                  value={aquaPassword}
                  onChangeText={setAquaPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  editable={!busy}
                />
              </TextField.Root>
              <Button
                label="Entrar com senha AQUA"
                color="secondary"
                size="large"
                disabled={busy || !email.trim() || !aquaPassword}
                onPress={() => {
                  finishPassword().catch(() => {})
                }}>
                <ButtonText>Entrar com senha AQUA</ButtonText>
              </Button>
            </View>
          ) : null}
        </View>
      ) : null}
      <Text style={[a.text_md, a.font_bold, t.atoms.text_contrast_high]}>
        Bluesky
      </Text>
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
        label="Entrar com Bluesky"
        color="primary"
        size="large"
        disabled={busy || !identifier.trim()}
        onPress={() => {
          signIn().catch(() => {})
        }}>
        <ButtonText>Entrar com Bluesky</ButtonText>
      </Button>
      <HintText>
        A associação interna usa o DID estável. Se o handle mudar, a conta
        continua a mesma. Outros PDS do AT Protocol também entram por aqui.
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
