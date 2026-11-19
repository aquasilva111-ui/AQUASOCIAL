import {useEffect, useRef, useState} from 'react'
import {View} from 'react-native'
import {useNavigation} from '@react-navigation/native'

import {
  completePublicOAuth,
  resetPublicOAuthAttempt,
} from '#/lib/aqua-identity/oauth-browser'
import {reasonText} from '#/lib/aqua-identity/reasons'
import {type NavigationProp} from '#/lib/routes/types'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {Loader} from '#/components/Loader'
import {Text} from '#/components/Typography'
import {IdentityShell} from './IdentityShell'

export function AquaIdentityCallbackScreen() {
  const t = useTheme()
  const navigation = useNavigation<NavigationProp>()
  const navigationRef = useRef(navigation)
  navigationRef.current = navigation
  const [message, setMessage] = useState('Concluindo a entrada…')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    const href = typeof location === 'undefined' ? '' : location.href
    completePublicOAuth(href)
      .then(result => {
        if (cancelled) return
        if (result.ok) {
          navigationRef.current.navigate('AquaIdentityOnboarding')
          return
        }
        setFailed(true)
        setMessage(reasonText(result.reason, result.message))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <IdentityShell
      testID="aquaIdentityCallback"
      leadin="AQUA"
      title="Entrar"
      description="A resposta do PDS é conferida antes de associar o DID.">
      <View style={[a.gap_md, a.align_start]}>
        {!failed ? <Loader size="lg" /> : null}
        <Text style={[a.text_md, t.atoms.text_contrast_high]}>{message}</Text>
        {failed ? (
          <Button
            label="Voltar para entrar"
            color="primary"
            size="large"
            onPress={() => {
              resetPublicOAuthAttempt()
              navigation.navigate('AquaIdentityLogin')
            }}>
            <ButtonText>Voltar para entrar</ButtonText>
          </Button>
        ) : null}
      </View>
    </IdentityShell>
  )
}
