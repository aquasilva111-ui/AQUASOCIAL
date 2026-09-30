import {useState} from 'react'
import {View} from 'react-native'
import {useNavigation} from '@react-navigation/native'

import {type NavigationProp} from '#/lib/routes/types'
import {
  LIST_LABELS,
  type ViewListKind,
  type ViewListVisibility,
  VISIBILITY_LABELS,
} from '#/lib/view-library/model'
import {logger} from '#/logger'
import {
  useCreateViewListMutation,
  useViewListsQuery,
} from '#/state/queries/view-lists'
import {useSession} from '#/state/session'
import * as Toast from '#/view/com/util/Toast'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as TextField from '#/components/forms/TextField'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'
import {Empty, LibraryPage} from './shared'

const VISIBILITIES: ViewListVisibility[] = ['public', 'unlisted', 'private']

export const listPath = (kind: ViewListKind, did: string, rkey: string) =>
  `/videos/list/${kind}/${did}/${rkey}`

export function ViewPlaylistsScreen() {
  return <ViewLists kind="playlist" />
}

export function ViewCollectionsScreen() {
  return <ViewLists kind="collection" />
}

function ViewLists({kind}: {kind: ViewListKind}) {
  const t = useTheme()
  const labels = LIST_LABELS[kind]
  const navigation = useNavigation<NavigationProp>()
  const {currentAccount} = useSession()
  const {data: lists, isLoading} = useViewListsQuery(currentAccount?.did, kind)
  const create = useCreateViewListMutation(kind)
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [visibility, setVisibility] = useState<ViewListVisibility>('private')

  const onCreate = async () => {
    try {
      const uri = await create.mutateAsync({title, visibility})
      const rkey = uri.split('/').pop() ?? ''
      setCreating(false)
      setTitle('')
      if (currentAccount)
        navigation.navigate('ViewList', {kind, name: currentAccount.did, rkey})
    } catch (e: any) {
      logger.error('Failed to create view list', {message: String(e)})
      Toast.show(
        `Não foi possível criar a ${labels.singular.toLowerCase()}`,
        'error',
      )
    }
  }

  return (
    <LibraryPage
      testID={
        kind === 'playlist' ? 'viewPlaylistsScreen' : 'viewCollectionsScreen'
      }
      title={labels.plural}
      subtitle={
        kind === 'playlist'
          ? 'Vídeos em sequência, na ordem que você escolher.'
          : 'Uma prateleira para guardar e compartilhar vídeos, sem ordem.'
      }
      actions={
        <Button
          label={`Nova ${labels.singular.toLowerCase()}`}
          size="small"
          color="primary"
          onPress={() => setCreating(v => !v)}>
          <ButtonText>{`Nova ${labels.singular.toLowerCase()}`}</ButtonText>
        </Button>
      }>
      {creating && (
        <View
          style={[
            a.p_lg,
            a.gap_md,
            a.rounded_lg,
            a.border,
            t.atoms.border_contrast_low,
            {maxWidth: 480},
          ]}>
          <TextField.Root>
            <TextField.Input
              label="Título"
              placeholder="Título"
              value={title}
              onChangeText={setTitle}
              maxLength={60}
            />
          </TextField.Root>
          <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
            {VISIBILITIES.map(v => (
              <Button
                key={v}
                label={VISIBILITY_LABELS[v]}
                size="small"
                color={visibility === v ? 'primary' : 'secondary'}
                accessibilityRole="radio"
                accessibilityState={{selected: visibility === v}}
                onPress={() => setVisibility(v)}>
                <ButtonText>{VISIBILITY_LABELS[v]}</ButtonText>
              </Button>
            ))}
          </View>
          <View style={[a.flex_row, a.gap_sm]}>
            <Button
              label="Criar"
              size="small"
              color="primary"
              disabled={!title.trim() || create.isPending}
              onPress={onCreate}>
              <ButtonText>Criar</ButtonText>
            </Button>
            <Button
              label="Cancelar"
              size="small"
              color="secondary"
              onPress={() => setCreating(false)}>
              <ButtonText>Cancelar</ButtonText>
            </Button>
          </View>
        </View>
      )}

      {isLoading ? (
        <Text style={[t.atoms.text_contrast_medium]}>Carregando…</Text>
      ) : !lists?.length ? (
        <Empty
          title={`Crie sua primeira ${labels.singular.toLowerCase()}`}
          body='Depois, use "Salvar em…" na página de um vídeo para adicioná-lo.'
        />
      ) : (
        <View style={[a.flex_row, a.flex_wrap, a.gap_md]}>
          {lists.map(list => (
            <Link
              key={list.uri}
              to={listPath(kind, currentAccount?.did ?? '', list.rkey)}
              label={`${list.title}, ${list.items.length} vídeos`}
              style={[
                a.p_lg,
                a.gap_xs,
                a.rounded_lg,
                a.border,
                t.atoms.border_contrast_low,
                t.atoms.bg_contrast_25,
                {width: 260, maxWidth: '100%'},
              ]}>
              <Text style={[a.text_lg, a.font_bold]} numberOfLines={2}>
                {list.title}
              </Text>
              <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
                {list.items.length}{' '}
                {list.items.length === 1 ? 'vídeo' : 'vídeos'} ·{' '}
                {VISIBILITY_LABELS[list.visibility]}
              </Text>
            </Link>
          ))}
        </View>
      )}
    </LibraryPage>
  )
}
