import {Image, Linking, View} from 'react-native'

import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Layout from '#/components/Layout'
import {Text} from '#/components/Typography'

const uiAiIcon = require('../../../assets/icons/ui-ai.png')
const PAGINA = 'https://aquaapp.systems/ui-ai/'

/**
 * IU & AI (app) — a Unidade de Inteligência roda no computador da pessoa, então
 * no celular esta tela apresenta a U.I. e leva para a página no navegador.
 */
export function UIAIScreen() {
  const t = useTheme()
  return (
    <Layout.Screen testID="uiAiScreen">
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>IU & AI</Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>
      <Layout.Content>
        <View style={[a.align_center, a.gap_lg, a.px_xl, {paddingTop: 64}]}>
          <Image
            accessibilityIgnoresInvertColors
            source={uiAiIcon}
            style={{width: 96, height: 96, tintColor: t.atoms.text.color}}
          />
          <Text style={[a.text_3xl, a.font_bold, a.text_center]}>
            Unidade de Inteligência
          </Text>
          <Text
            style={[
              a.text_md,
              a.text_center,
              a.leading_snug,
              t.atoms.text_contrast_medium,
            ]}>
            Uma inteligência que aprende com você, conecta seus chats de IA e
            age pelos Autômatos. Ela roda no seu computador: abra a página lá
            para instalar e conversar.
          </Text>
          <Button
            label="Abrir a página da U.I."
            size="large"
            color="primary"
            onPress={() => Linking.openURL(PAGINA)}>
            <ButtonText>Abrir a página da U.I.</ButtonText>
          </Button>
        </View>
      </Layout.Content>
    </Layout.Screen>
  )
}
