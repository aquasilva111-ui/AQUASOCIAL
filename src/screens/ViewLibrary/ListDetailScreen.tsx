import {useMemo, useState} from 'react'
import {View} from 'react-native'
import {useNavigation} from '@react-navigation/native'

import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
  type NavigationProp,
} from '#/lib/routes/types'
import {
  canViewList,
  LIST_LABELS,
  type ViewListKind,
  type ViewListVisibility,
  VISIBILITY_LABELS,
} from '#/lib/view-library/model'
import {logger} from '#/logger'
import {
  useDeleteViewListMutation,
  useListPostsQuery,
  useUpdateViewListMutation,
  useViewListQuery,
} from '#/state/queries/view-lists'
import {useSession} from '#/state/session'
import {addToQueue, removeFromQueue} from '#/state/view-playback'
import * as Toast from '#/view/com/util/Toast'
import {toVideoRef} from '#/screens/ViewWatch/UpNext'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as TextField from '#/components/forms/TextField'
import {Text} from '#/components/Typography'
import {Empty, LibraryPage, VideoRow} from './shared'

const ORDER: ViewListVisibility[] = ['public', 'unlisted', 'private']

export function ViewListScreen({
  route,
}: NativeStackScreenProps<CommonNavigatorParams, 'ViewList'>) {
  const t = useTheme()
  const navigation = useNavigation<NavigationProp>()
  const kind: ViewListKind =
    route.params.kind === 'collection' ? 'collection' : 'playlist'
  const {name: did, rkey} = route.params
  const {currentAccount} = useSession()
  const isOwner = currentAccount?.did === did
  const {data: list, isLoading} = useViewListQuery(did, kind, rkey)
  const uris = useMemo(() => list?.items.map(i => i.uri) ?? [], [list])
  const posts = useListPostsQuery(uris)
  const update = useUpdateViewListMutation()
  const remove = useDeleteViewListMutation()
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const labels = LIST_LABELS[kind]
  const videos = useMemo(() => (posts.data ?? []).map(toVideoRef), [posts.data])

  const fail = (e: unknown, msg: string) => {
    logger.error(msg, {message: String(e)})
    Toast.show(msg, 'error')
  }

  if (isLoading)
    return (
      <LibraryPage testID="viewListScreen" title={labels.singular}>
        <Text style={[t.atoms.text_contrast_medium]}>Carregando…</Text>
      </LibraryPage>
    )
  if (!list || !canViewList(list, isOwner))
    return (
      <LibraryPage testID="viewListScreen" title={labels.singular}>
        <Empty
          title={`${labels.singular} não encontrada`}
          body="Ela não existe ou é privada."
        />
      </LibraryPage>
    )

  const playAll = () => {
    const [first, ...rest] = videos
    if (!first) return
    removeFromQueue(first.uri)
    rest.forEach(addToQueue)
    navigation.navigate('VideoWatch', {name: first.did, rkey: first.rkey})
  }
  const cycleVisibility = () => {
    const next = ORDER[(ORDER.indexOf(list.visibility) + 1) % ORDER.length]
    update.mutate(
      {list, patch: {visibility: next}},
      {onError: e => fail(e, 'Não foi possível alterar a visibilidade')},
    )
  }

  return (
    <LibraryPage
      testID="viewListScreen"
      title={list.title}
      subtitle={`${labels.singular} · ${list.items.length} ${
        list.items.length === 1 ? 'vídeo' : 'vídeos'
      } · ${VISIBILITY_LABELS[list.visibility]}`}
      actions={
        <>
          {videos.length > 0 && (
            <Button
              label="Reproduzir tudo"
              size="small"
              color="primary"
              onPress={playAll}>
              <ButtonText>Reproduzir tudo</ButtonText>
            </Button>
          )}
          {isOwner && (
            <>
              <Button
                label={`Visibilidade: ${VISIBILITY_LABELS[list.visibility]}. Alterar`}
                size="small"
                color="secondary"
                onPress={cycleVisibility}>
                <ButtonText>{VISIBILITY_LABELS[list.visibility]}</ButtonText>
              </Button>
              <Button
                label="Renomear"
                size="small"
                color="secondary"
                onPress={() => {
                  setTitle(list.title)
                  setEditing(v => !v)
                }}>
                <ButtonText>Renomear</ButtonText>
              </Button>
              <Button
                label={confirmDelete ? 'Confirmar exclusão' : 'Excluir'}
                size="small"
                color={confirmDelete ? 'negative' : 'secondary'}
                onPress={async () => {
                  if (!confirmDelete) return setConfirmDelete(true)
                  try {
                    await remove.mutateAsync(list)
                    navigation.navigate(
                      kind === 'playlist' ? 'ViewPlaylists' : 'ViewCollections',
                    )
                  } catch (e) {
                    fail(e, 'Não foi possível excluir')
                  }
                }}>
                <ButtonText>
                  {confirmDelete ? 'Confirmar exclusão' : 'Excluir'}
                </ButtonText>
              </Button>
            </>
          )}
        </>
      }>
      {editing && (
        <View style={[a.gap_sm, {maxWidth: 420}]}>
          <TextField.Root>
            <TextField.Input
              label="Título"
              value={title}
              onChangeText={setTitle}
              maxLength={60}
            />
          </TextField.Root>
          <View style={[a.flex_row, a.gap_sm]}>
            <Button
              label="Salvar título"
              size="small"
              color="primary"
              disabled={!title.trim() || update.isPending}
              onPress={() =>
                update.mutate(
                  {list, patch: {title}},
                  {
                    onSuccess: () => setEditing(false),
                    onError: e => fail(e, 'Não foi possível renomear'),
                  },
                )
              }>
              <ButtonText>Salvar</ButtonText>
            </Button>
            <Button
              label="Cancelar"
              size="small"
              color="secondary"
              onPress={() => setEditing(false)}>
              <ButtonText>Cancelar</ButtonText>
            </Button>
          </View>
        </View>
      )}
      {posts.isLoading ? (
        <Text style={[t.atoms.text_contrast_medium]}>Carregando vídeos…</Text>
      ) : !videos.length ? (
        <Empty
          title="Nenhum vídeo aqui ainda"
          body='Abra um vídeo e use "Salvar em…" para adicioná-lo.'
        />
      ) : (
        <View>
          {videos.map(v => (
            <VideoRow
              key={v.uri}
              video={v}
              actions={
                isOwner && (
                  <Button
                    label={`Tirar da ${labels.singular.toLowerCase()}: ${v.title}`}
                    size="small"
                    variant="ghost"
                    color="secondary"
                    onPress={() =>
                      update.mutate(
                        {
                          list,
                          patch: {
                            items: list.items.filter(i => i.uri !== v.uri),
                          },
                        },
                        {onError: e => fail(e, 'Não foi possível remover')},
                      )
                    }>
                    <ButtonText>Tirar</ButtonText>
                  </Button>
                )
              }
            />
          ))}
        </View>
      )}
    </LibraryPage>
  )
}
