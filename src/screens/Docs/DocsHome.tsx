import {useCallback} from 'react'
import {View} from 'react-native'
import {useNavigation} from '@react-navigation/native'

import {type NavigationProp} from '#/lib/routes/types'
import {useDocs, useDocsApi} from '#/state/docs/store'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import {CirclePlus_Stroke2_Corner0_Rounded as CirclePlusIcon} from '#/components/icons/CirclePlus'
import {Trash_Stroke2_Corner0_Rounded as TrashIcon} from '#/components/icons/Trash'
import * as Layout from '#/components/Layout'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'

/** AQUA DOCS entry point: list of the account's documents on this device. */
export function DocsHomeScreen() {
  const t = useTheme()
  const navigation = useNavigation<NavigationProp>()
  const docs = useDocs()
  const {createDoc, removeDoc} = useDocsApi()

  const onNewDoc = useCallback(() => {
    const doc = createDoc()
    if (doc) navigation.navigate('DocEditor', {id: doc.id})
  }, [createDoc, navigation])

  return (
    <Layout.Screen testID="docsHomeScreen">
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>AQUA DOCS</Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>

      <View style={[a.p_md, a.gap_md, a.flex_1]}>
        <Button
          label="Novo documento"
          size="large"
          variant="solid"
          color="primary"
          onPress={onNewDoc}>
          <ButtonIcon icon={CirclePlusIcon} />
          <ButtonText>Novo documento</ButtonText>
        </Button>

        {docs.length === 0 ? (
          <View style={[a.align_center, a.gap_sm, a.px_xl, {paddingTop: 48}]}>
            <Text style={[a.text_lg, a.font_bold]}>Nenhum documento ainda</Text>
            <Text
              style={[a.text_md, a.text_center, t.atoms.text_contrast_medium]}>
              Crie seu primeiro documento por blocos. A edição completa fica
              disponível na versão web do AQUA.
            </Text>
          </View>
        ) : (
          <View style={[a.gap_sm]}>
            {docs.map(doc => (
              <View
                key={doc.id}
                style={[
                  a.flex_row,
                  a.align_center,
                  a.rounded_sm,
                  a.border,
                  t.atoms.border_contrast_low,
                  t.atoms.bg_contrast_25,
                ]}>
                <Link
                  to={`/docs/${doc.id}`}
                  label={doc.title}
                  style={[a.flex_1, a.p_md, a.gap_xs]}>
                  <Text style={[a.text_md, a.font_bold]} numberOfLines={1}>
                    {doc.title}
                  </Text>
                  <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
                    Atualizado em {new Date(doc.updatedAt).toLocaleString()}
                  </Text>
                </Link>
                <Button
                  label={`Apagar ${doc.title}`}
                  size="small"
                  variant="ghost"
                  color="secondary"
                  onPress={() => removeDoc(doc.id)}>
                  <ButtonIcon icon={TrashIcon} />
                </Button>
              </View>
            ))}
          </View>
        )}
      </View>
    </Layout.Screen>
  )
}
