import {useCallback} from 'react'
import {TextInput, View} from 'react-native'

import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
} from '#/lib/routes/types'
import {useDoc, useDocsApi} from '#/state/docs/store'
import {atoms as a, useTheme} from '#/alf'
import {BlockEditor} from '#/components/docs/BlockEditor'
import * as Layout from '#/components/Layout'
import {Text} from '#/components/Typography'

/**
 * /docs/:id — AQUA DOCS editor shell. The block editor itself is web-only for
 * now (see components/docs/BlockEditor); this shell is platform-neutral.
 */
export function DocEditorScreen({
  route,
}: NativeStackScreenProps<CommonNavigatorParams, 'DocEditor'>) {
  return <DocEditorInner id={route.params.id} />
}

function DocEditorInner({id}: {id: string}) {
  const t = useTheme()
  const doc = useDoc(id)
  const {renameDoc} = useDocsApi()

  const onChangeTitle = useCallback(
    (title: string) => {
      renameDoc(id, title)
    },
    [id, renameDoc],
  )

  return (
    <Layout.Screen testID="docEditorScreen">
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>
            {doc?.title || 'AQUA DOCS'}
          </Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>

      {doc ? (
        <View style={[a.flex_1]}>
          <View
            style={[a.px_md, a.py_sm, a.border_b, t.atoms.border_contrast_low]}>
            <TextInput
              accessibilityLabel="Título do documento"
              accessibilityHint="Edite para renomear o documento"
              defaultValue={doc.title}
              onChangeText={onChangeTitle}
              placeholder="Documento sem título"
              placeholderTextColor={t.atoms.text_contrast_low.color}
              style={[a.text_lg, a.font_bold, t.atoms.text]}
            />
          </View>
          <BlockEditor key={id} docId={id} />
        </View>
      ) : (
        <View style={[a.align_center, a.gap_sm, a.px_xl, {paddingTop: 48}]}>
          <Text style={[a.text_md, t.atoms.text_contrast_medium]}>
            Documento não encontrado neste dispositivo.
          </Text>
        </View>
      )}
    </Layout.Screen>
  )
}
