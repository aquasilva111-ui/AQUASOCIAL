import {Pressable, View} from 'react-native'
import {useNavigation} from '@react-navigation/native'

import {type NavigationProp} from '#/lib/routes/types'
import {atoms as a, useTheme} from '#/alf'
import {ArrowLeft_Stroke2_Corner0_Rounded as ArrowLeft} from '#/components/icons/Arrow'
import {Text} from '#/components/Typography'

const BARRA = 48

/**
 * IU & AI (web) — a Consola da Unidade de Inteligência em página inteira.
 *
 * É uma rota de página inteira (sem o menu, a coluna da direita e a barra de
 * baixo do Aqua): só uma barra fina para voltar ao Aqua e a página /ui-ai/
 * (web/ui-ai, repositório I.U-A.I), que decide sozinha o que mostrar.
 */
export function UIAIScreen() {
  const t = useTheme()
  const navigation = useNavigation<NavigationProp>()
  const voltar = () => {
    if (navigation.canGoBack()) navigation.goBack()
    else navigation.navigate('Home')
  }

  return (
    <View testID="uiAiScreen" style={[a.flex_1, t.atoms.bg]}>
      <View
        style={[
          a.flex_row,
          a.align_center,
          a.gap_sm,
          a.px_md,
          t.atoms.border_contrast_low,
          a.border_b,
          {height: BARRA},
        ]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Voltar para o Aqua"
          accessibilityHint=""
          onPress={voltar}
          style={[
            a.flex_row,
            a.align_center,
            a.gap_sm,
            a.py_xs,
            a.px_sm,
            a.rounded_full,
          ]}>
          <ArrowLeft size="md" style={t.atoms.text} />
          <Text style={[a.text_md, a.font_bold]}>IU & AI</Text>
        </Pressable>
      </View>
      <iframe
        src="/ui-ai/"
        title="Unidade de Inteligência"
        style={{
          width: '100%',
          height: `calc(100vh - ${BARRA}px)`,
          border: 'none',
          display: 'block',
        }}
      />
    </View>
  )
}
