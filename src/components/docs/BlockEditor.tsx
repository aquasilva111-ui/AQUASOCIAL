import {View} from 'react-native'

import {atoms as a, useTheme} from '#/alf'
import {Text} from '#/components/Typography'

/**
 * Native fallback: the full block editor (BlockNote) is web-only for now.
 * Document metadata still syncs through the same store, so the list stays
 * useful on native.
 */
export function BlockEditor({docId: _docId}: {docId: string}) {
  const t = useTheme()
  return (
    <View
      style={[a.flex_1, a.align_center, a.justify_center, a.px_xl, a.gap_sm]}>
      <Text style={[a.text_lg, a.font_bold]}>Editor disponível na web</Text>
      <Text style={[a.text_md, a.text_center, t.atoms.text_contrast_medium]}>
        A edição de documentos por blocos está disponível na versão web do AQUA.
        Este documento fica salvo e sincronizado quando você abrir por lá.
      </Text>
    </View>
  )
}
