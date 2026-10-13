import {View} from 'react-native'
import {useNavigation} from '@react-navigation/native'

import {type NavigationProp} from '#/lib/routes/types'
import {isNative} from '#/platform/detection'
import {type AdultContextValue} from '#/state/adult/context'
import {AgeGateView} from '#/screens/Adult/portal/AgeGateView'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {Text} from '#/components/Typography'

/**
 * Hard boundary of the +18 environment. Children never render unless the
 * viewer opted in on the web. Native builds keep the section closed for
 * store compliance, and deep links cannot flash content before the checks.
 */
export function AdultGate({
  ctx,
  children,
}: {
  ctx: AdultContextValue
  children: React.ReactNode
}) {
  if (isNative) return <NativeUnavailable />
  if (ctx.adultAccessEnabled) return <>{children}</>
  return <AdultGateScreen ctx={ctx} />
}

function NativeUnavailable() {
  const t = useTheme()
  const navigation = useNavigation<NavigationProp>()
  return (
    <View
      testID="adultNativeUnavailable"
      style={[
        a.flex_1,
        a.align_center,
        a.justify_center,
        a.px_xl,
        {backgroundColor: '#fff'},
      ]}>
      <View style={[a.align_center, a.gap_md, {maxWidth: 420}]}>
        <Text
          style={[a.text_2xl, a.font_bold, a.text_center, {color: '#2b2f36'}]}>
          Aqua +18
        </Text>
        <Text style={[a.text_md, a.text_center, t.atoms.text_contrast_medium]}>
          Este espaço não está disponível no aplicativo. Conteúdo adulto fica
          desativado por padrão nas lojas. Para optar por entrar, use o Aqua na
          web.
        </Text>
        <Button
          label="Voltar ao Aqua"
          size="large"
          variant="solid"
          color="secondary"
          onPress={() => navigation.navigate('Home')}>
          <ButtonText>Voltar ao Aqua</ButtonText>
        </Button>
      </View>
    </View>
  )
}

function AdultGateScreen({ctx}: {ctx: AdultContextValue}) {
  const navigation = useNavigation<NavigationProp>()
  const leave = () => navigation.navigate('Home')

  if (ctx.ageGateStatus === 'denied' || ctx.ageGateStatus === 'restricted') {
    return (
      <View
        style={[
          a.flex_1,
          a.align_center,
          a.justify_center,
          a.px_xl,
          {backgroundColor: '#fff'},
        ]}>
        <View style={[a.align_center, a.gap_md, {maxWidth: 420}]}>
          <Text
            style={[
              a.text_2xl,
              a.font_bold,
              a.text_center,
              {color: '#2b2f36'},
            ]}>
            {ctx.ageGateStatus === 'denied'
              ? 'Acesso não permitido'
              : 'Acesso restrito'}
          </Text>
          <Text style={[a.text_md, a.text_center, {color: '#4b5563'}]}>
            {ctx.ageGateStatus === 'denied'
              ? 'Esta conta não pode acessar a área +18.'
              : 'A área +18 não está disponível para a sua conta ou região.'}
          </Text>
          <Button
            label="Voltar ao Aqua"
            size="large"
            variant="solid"
            color="secondary"
            onPress={leave}>
            <ButtonText>Voltar ao Aqua</ButtonText>
          </Button>
        </View>
      </View>
    )
  }

  const blockedMessage = ctx.canEnter
    ? undefined
    : ctx.ageGateStatus === 'pending'
      ? 'Sua verificação de idade está sendo processada. Tente novamente em instantes.'
      : 'Confirmação de maioridade necessária para continuar.'

  return (
    <AgeGateView
      canEnter={ctx.canEnter}
      blockedMessage={blockedMessage}
      onEnter={ctx.enter}
      onLeave={leave}
    />
  )
}
