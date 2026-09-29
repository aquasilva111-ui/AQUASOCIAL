import {View} from 'react-native'

import {type AdultContextValue} from '#/state/adult/context'
import {useSession} from '#/state/session'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Layout from '#/components/Layout'
import {Text} from '#/components/Typography'
import {useBeginAgeAssurance} from '#/ageAssurance/useBeginAgeAssurance'

/**
 * Hard boundary of the +18 environment. Children — i.e. any adult content —
 * never render unless the context is verified AND deliberately entered, so
 * deep links can never flash content before the checks complete.
 */
export function AdultGate({
  ctx,
  children,
}: {
  ctx: AdultContextValue
  children: React.ReactNode
}) {
  if (ctx.adultAccessEnabled) return <>{children}</>
  return <AdultGateScreen ctx={ctx} />
}

function AdultGateScreen({ctx}: {ctx: AdultContextValue}) {
  const t = useTheme()
  const {currentAccount} = useSession()
  const beginAgeAssurance = useBeginAgeAssurance()

  let title: string
  let body: string
  switch (ctx.ageGateStatus) {
    case 'pending':
      title = 'Verificação em andamento'
      body =
        'Sua verificação de idade está sendo processada. Tente novamente em instantes.'
      break
    case 'denied':
      title = 'Acesso não permitido'
      body = 'Esta conta não pode acessar a área +18.'
      break
    case 'restricted':
      title = 'Acesso restrito'
      body = 'A área +18 não está disponível para a sua conta ou região.'
      break
    case 'unknown':
    case 'required':
    default:
      title = 'Verificação de idade necessária'
      body =
        'Para entrar na área +18, confirme que você é maior de idade. Sem confirmação, o acesso permanece bloqueado.'
      break
  }

  // Verified gate but no deliberate entry yet: the explicit crossing point.
  const awaitingEntry = ctx.canEnter

  return (
    <Layout.Center style={[a.px_xl, {paddingTop: 96}]}>
      <View style={[a.align_center, a.gap_md, {maxWidth: 420}]}>
        <Text style={[a.text_2xl, a.font_bold, a.text_center]}>
          {awaitingEntry ? 'Você está entrando no AQUA +18' : title}
        </Text>
        <Text style={[a.text_md, a.text_center, t.atoms.text_contrast_medium]}>
          {awaitingEntry
            ? 'Esta é uma área adulta, separada do AQUA Social. Sua atividade aqui não alimenta feeds, buscas ou recomendações públicas.'
            : body}
        </Text>
        {awaitingEntry ? (
          <Button
            label="Entrar no AQUA +18"
            size="large"
            variant="solid"
            color="primary"
            onPress={ctx.enter}>
            <ButtonText>Entrar no +18</ButtonText>
          </Button>
        ) : (
          (ctx.ageGateStatus === 'required' ||
            ctx.ageGateStatus === 'unknown') &&
          !!currentAccount?.email && (
            <Button
              label="Iniciar verificação de idade"
              size="large"
              variant="solid"
              color="primary"
              disabled={beginAgeAssurance.isPending}
              onPress={() =>
                beginAgeAssurance.mutate({
                  email: currentAccount.email!,
                  language: 'pt',
                })
              }>
              <ButtonText>
                {beginAgeAssurance.isPending
                  ? 'Enviando...'
                  : 'Iniciar verificação'}
              </ButtonText>
            </Button>
          )
        )}
      </View>
    </Layout.Center>
  )
}
