import {useEffect, useState} from 'react'
import {View} from 'react-native'

import {readAquaIdentityConfig} from '#/lib/aqua-identity/config'
import {reasonText} from '#/lib/aqua-identity/reasons'
import {
  emptySocialDirectory,
  loadSocialDirectory,
  postIdentityService,
  socialAuthorizeUrl,
  type SocialDirectory,
  type SocialOAuthButton,
} from '#/lib/aqua-identity/social'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {FormError} from '#/components/forms/FormError'
import {Text} from '#/components/Typography'
import {HintText} from './IdentityShell'

type ServiceSession = {
  authenticated?: boolean
  csrfToken?: string
  reauthFresh?: boolean
  authorization?: {userId: string; did: string | null} | null
  identities?: {provider: string}[]
}

const OAUTH_LABEL: Record<SocialOAuthButton, string> = {
  google: 'Google',
  apple: 'Apple',
  github: 'GitHub',
}

function openService(url: string) {
  if (typeof window === 'undefined') return
  window.location.assign(url)
}

export function SocialAccounts() {
  const t = useTheme()
  const serviceUrl = readAquaIdentityConfig().serviceUrl
  const [directory, setDirectory] =
    useState<SocialDirectory>(emptySocialDirectory)
  const [session, setSession] = useState<ServiceSession>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!serviceUrl) return
    let cancelled = false
    const load = async () => {
      const next = await loadSocialDirectory(
        serviceUrl,
        globalThis.fetch.bind(globalThis),
      )
      if (cancelled) return
      setDirectory(next)
      if (next.providers.length === 0 && !next.atproto) return
      try {
        const response = await fetch(new URL('/session', serviceUrl), {
          credentials: 'include',
          headers: {accept: 'application/json'},
        })
        if (!response.ok || cancelled) return
        setSession((await response.json()) as ServiceSession)
      } catch {
        // The static site keeps working when the service is down.
      }
    }
    load().catch(() => {})
    return () => {
      cancelled = true
    }
  }, [serviceUrl])

  if (!serviceUrl || (directory.providers.length === 0 && !directory.atproto)) {
    return null
  }
  if (!session.authenticated) {
    return (
      <HintText>
        A vinculação de provedores fica no serviço de identidade. Entre por um
        provedor configurado para ver as contas ligadas a esta sessão.
      </HintText>
    )
  }

  const linked = new Set((session.identities ?? []).map(item => item.provider))
  const fresh = session.reauthFresh === true
  const csrf = session.csrfToken ?? ''
  const available = directory.providers.filter(
    (provider): provider is SocialOAuthButton =>
      provider === 'google' || provider === 'apple' || provider === 'github',
  )

  const unlink = async (provider: string) => {
    setError('')
    setBusy(true)
    try {
      const result = await postIdentityService(
        serviceUrl,
        '/identities/unlink',
        {provider},
        csrf,
      )
      if (!result.ok) {
        setError(reasonText(result.reason))
        return
      }
      setSession(current => ({
        ...current,
        identities: (current.identities ?? []).filter(
          item => item.provider !== provider,
        ),
      }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={[a.gap_md]}>
      <Text style={[a.text_lg, a.font_bold, t.atoms.text_contrast_high]}>
        Provedores
      </Text>
      <HintText>
        {session.authorization?.did
          ? `DID ${session.authorization.did}.`
          : 'Esta sessão ainda não tem DID. Ele entra pelo AT Protocol.'}{' '}
        Permissões usam o id interno ou o DID, nunca o handle. Vincular ou
        desvincular pede uma entrada recente.
      </HintText>
      {!fresh ? (
        <HintText>
          A entrada desta sessão já não é recente. Entre de novo antes de
          vincular ou desvincular.
        </HintText>
      ) : null}
      <FormError error={error} />
      {(session.identities ?? []).map(item => (
        <View
          key={item.provider}
          style={[a.flex_row, a.align_center, a.gap_md]}>
          <Text style={[a.text_md, a.flex_1, t.atoms.text_contrast_high]}>
            {item.provider}
          </Text>
          <Button
            label={`Desvincular ${item.provider}`}
            color="secondary"
            size="small"
            disabled={busy || !fresh}
            onPress={() => {
              unlink(item.provider).catch(() => {})
            }}>
            <ButtonText>Desvincular</ButtonText>
          </Button>
        </View>
      ))}
      {available
        .filter(provider => !linked.has(provider))
        .map(provider => (
          <Button
            key={provider}
            label={`Vincular ${OAUTH_LABEL[provider]}`}
            color="secondary"
            size="large"
            disabled={busy || !fresh}
            onPress={() => {
              openService(
                socialAuthorizeUrl(serviceUrl, provider, 'link', csrf),
              )
            }}>
            <ButtonText>Vincular {OAUTH_LABEL[provider]}</ButtonText>
          </Button>
        ))}
    </View>
  )
}
