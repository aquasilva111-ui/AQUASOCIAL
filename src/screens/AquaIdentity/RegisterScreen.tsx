import {useEffect, useState} from 'react'
import {View} from 'react-native'

import {saveEphemeralPdsSession} from '#/lib/aqua-identity/accounts'
import {
  readAquaIdentityConfig,
  signupAvailability,
} from '#/lib/aqua-identity/config'
import {formatAquaHandle} from '#/lib/aqua-identity/handles'
import {
  checkPdsHealth,
  createNativeAccount,
  nativeSignupOffer,
  type PdsHealth,
} from '#/lib/aqua-identity/pds'
import {reasonText} from '#/lib/aqua-identity/reasons'
import {attemptLimiter, rememberAccount} from '#/lib/aqua-identity/runtime'
import {sessionBrowserStore} from '#/lib/aqua-identity/storage'
import {atoms as a, useTheme} from '#/alf'
import {Admonition} from '#/components/Admonition'
import {Button, ButtonText} from '#/components/Button'
import {FormError} from '#/components/forms/FormError'
import * as TextField from '#/components/forms/TextField'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'
import {useGoToIdentity} from './DomainPanel'
import {HintText, IdentityShell} from './IdentityShell'

export function AquaIdentityRegisterScreen() {
  const t = useTheme()
  const go = useGoToIdentity()
  const config = readAquaIdentityConfig()
  const gate = signupAvailability(config)
  const configuredPds = gate.enabled ? gate.pdsUrl : ''
  const [health, setHealth] = useState<PdsHealth | undefined>()
  const [email, setEmail] = useState('')
  const [local, setLocal] = useState('')
  const [password, setPassword] = useState('')
  const [invite, setInvite] = useState('')
  const [captcha, setCaptcha] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const handle = formatAquaHandle(local || 'nome', config.handleDomain)
  const offer = nativeSignupOffer({
    config,
    health: configuredPds ? health : undefined,
  })

  useEffect(() => {
    if (!configuredPds) return
    let cancelled = false
    checkPdsHealth({
      pdsUrl: configuredPds,
      fetch: globalThis.fetch.bind(globalThis),
    })
      .then(result => {
        if (!cancelled) setHealth(result)
      })
      .catch(() => {
        if (!cancelled) setHealth({ok: false, reason: 'pds-unreachable'})
      })
    return () => {
      cancelled = true
    }
  }, [configuredPds])

  const submit = async () => {
    if (!offer.showForm) {
      setError(reasonText(offer.reason))
      return
    }
    setError('')
    setBusy(true)
    try {
      const result = await createNativeAccount({
        config,
        limiter: attemptLimiter(),
        fetch: globalThis.fetch.bind(globalThis),
        account: {
          email,
          password,
          localHandle: local,
          inviteCode: invite,
          captchaToken: captcha,
        },
      })
      setPassword('')
      if (!result.ok) {
        setError(reasonText(result.reason, result.message))
        return
      }
      if (result.ephemeral) {
        saveEphemeralPdsSession(sessionBrowserStore(), {
          did: result.account.did,
          accessJwt: result.ephemeral.accessJwt,
          refreshJwt: result.ephemeral.refreshJwt,
        })
      }
      rememberAccount(result.account)
      go.onboarding()
    } finally {
      setBusy(false)
      setPassword('')
    }
  }

  return (
    <IdentityShell
      testID="aquaIdentityRegister"
      leadin="AQUA"
      title="Criar conta"
      description="O cadastro nativo só abre quando o PDS da AQUA estiver configurado.">
      <Admonition type={offer.showForm ? 'tip' : 'warning'}>
        {offer.showForm
          ? `O PDS ${offer.pdsUrl} respondeu em /xrpc/_health (${offer.version}). A senha segue só até esse PDS e não fica na AQUA.`
          : reasonText(offer.reason)}
      </Admonition>
      {offer.showForm ? (
        <>
          <View>
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
              />
            </TextField.Root>
          </View>
          <View>
            <TextField.LabelText>Nome do handle</TextField.LabelText>
            <TextField.Root>
              <TextField.Input
                testID="aquaIdentityHandle"
                label="Nome do handle"
                value={local}
                onChangeText={setLocal}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </TextField.Root>
            <HintText>
              {handle.ok
                ? `Handle ${handle.handle}. O domínio vem da configuração.`
                : reasonText(handle.reason)}
            </HintText>
          </View>
          <View>
            <TextField.LabelText>Senha do PDS</TextField.LabelText>
            <TextField.Root>
              <TextField.Input
                testID="aquaIdentityPassword"
                label="Senha do PDS"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="new-password"
              />
            </TextField.Root>
            <HintText>
              Essa senha não é gravada no site nem num servidor da AQUA.
            </HintText>
          </View>
          {config.inviteRequired ? (
            <View>
              <TextField.LabelText>Código de convite</TextField.LabelText>
              <TextField.Root>
                <TextField.Input
                  label="Código de convite"
                  value={invite}
                  onChangeText={setInvite}
                  autoCapitalize="none"
                />
              </TextField.Root>
            </View>
          ) : null}
          {config.captchaEnabled ? (
            <View>
              <TextField.LabelText>Verificação antiabuso</TextField.LabelText>
              <TextField.Root>
                <TextField.Input
                  label="Token da verificação"
                  value={captcha}
                  onChangeText={setCaptcha}
                  autoCapitalize="none"
                />
              </TextField.Root>
              <HintText>
                {config.captchaSiteKey
                  ? `Site key configurada. O BFF precisa validar o token; a presença dele no navegador não prova nada.`
                  : 'Captcha ligado, sem site key. O cadastro continua bloqueado até a configuração.'}
              </HintText>
            </View>
          ) : null}
          <FormError error={error} />
          <Button
            testID="aquaIdentityCreate"
            label="Criar conta"
            color="primary"
            size="large"
            disabled={busy}
            onPress={() => {
              submit().catch(() => {})
            }}>
            <ButtonText>Criar conta</ButtonText>
          </Button>
        </>
      ) : null}
      <Link to="/login" label="Entrar com conta existente">
        <Text style={[a.text_md, a.font_bold, {color: t.palette.primary_500}]}>
          Já tenho uma conta Bluesky
        </Text>
      </Link>
    </IdentityShell>
  )
}
