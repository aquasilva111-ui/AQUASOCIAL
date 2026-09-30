import {useEffect, useMemo, useState} from 'react'
import {View} from 'react-native'
import {type AppBskyFeedDefs} from '@atproto/api'

import {getPostMedia} from '#/lib/media/experiences'
import {LIST_LABELS, type ViewListKind} from '#/lib/view-library/model'
import {logger} from '#/logger'
import {
  useCreateViewListMutation,
  useToggleListItemMutation,
  useViewListsQuery,
} from '#/state/queries/view-lists'
import {useSession} from '#/state/session'
import {recordWatch, useViewLibrary} from '#/state/view-library'
import * as Toast from '#/view/com/util/Toast'
import {toVideoRef} from '#/screens/ViewWatch/UpNext'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Dialog from '#/components/Dialog'
import * as TextField from '#/components/forms/TextField'
import {Text} from '#/components/Typography'

/** Adds the video being watched to this device's history. */
export function useRecordWatch(post: AppBskyFeedDefs.PostView) {
  const {currentAccount} = useSession()
  const did = currentAccount?.did
  const ref = useMemo(
    () => (getPostMedia(post).type === 'video' ? toVideoRef(post) : undefined),
    [post],
  )
  useEffect(() => {
    if (did && ref) recordWatch(did, ref)
  }, [did, ref])
}

/** "Salvar em…": watch later, playlists and collections. */
export function SaveMenu({post}: {post: AppBskyFeedDefs.PostView}) {
  const control = Dialog.useDialogControl()
  return (
    <>
      <Button
        label="Salvar em…"
        size="small"
        color="secondary"
        onPress={() => control.open()}>
        <ButtonText>Salvar em…</ButtonText>
      </Button>
      <Dialog.Outer control={control}>
        <Dialog.Handle />
        <SaveDialog post={post} />
      </Dialog.Outer>
    </>
  )
}

function SaveDialog({post}: {post: AppBskyFeedDefs.PostView}) {
  const lib = useViewLibrary()
  const ref = toVideoRef(post)
  const later = lib.watchLater.some(v => v.uri === post.uri)
  return (
    <Dialog.ScrollableInner label="Salvar vídeo">
      <View style={[a.gap_lg]}>
        <Text style={[a.text_xl, a.font_bold]}>Salvar em…</Text>
        <Button
          label={later ? 'Tirar de Assistir mais tarde' : 'Assistir mais tarde'}
          size="large"
          color={later ? 'primary' : 'secondary'}
          accessibilityRole="checkbox"
          accessibilityState={{checked: later}}
          onPress={() =>
            later ? lib.removeWatchLater(post.uri) : lib.addWatchLater(ref)
          }>
          <ButtonText>{later ? '✓ ' : ''}Assistir mais tarde</ButtonText>
        </Button>
        <ListPicker kind="playlist" postUri={post.uri} />
        <ListPicker kind="collection" postUri={post.uri} />
      </View>
    </Dialog.ScrollableInner>
  )
}

function ListPicker({kind, postUri}: {kind: ViewListKind; postUri: string}) {
  const t = useTheme()
  const labels = LIST_LABELS[kind]
  const {currentAccount} = useSession()
  const {data: lists} = useViewListsQuery(currentAccount?.did, kind)
  const toggle = useToggleListItemMutation()
  const create = useCreateViewListMutation(kind)
  const [title, setTitle] = useState('')

  const onCreate = async () => {
    try {
      await create.mutateAsync({
        title,
        visibility: 'private',
        firstItemUri: postUri,
      })
      setTitle('')
      Toast.show(`${labels.singular} criada`)
    } catch (e: any) {
      logger.error('Failed to create view list', {message: String(e)})
      Toast.show(
        `Não foi possível criar a ${labels.singular.toLowerCase()}`,
        'error',
      )
    }
  }

  return (
    <View style={[a.gap_sm]}>
      <Text style={[a.text_md, a.font_bold]}>{labels.plural}</Text>
      {lists?.map(list => {
        const has = list.items.some(i => i.uri === postUri)
        return (
          <Button
            key={list.uri}
            label={`${has ? 'Tirar de' : 'Adicionar a'} ${list.title}`}
            size="small"
            color={has ? 'primary' : 'secondary'}
            accessibilityRole="checkbox"
            accessibilityState={{checked: has}}
            disabled={toggle.isPending}
            onPress={() =>
              toggle.mutate(
                {list, uri: postUri},
                {onError: () => Toast.show('Não foi possível salvar', 'error')},
              )
            }>
            <ButtonText>
              {has ? '✓ ' : ''}
              {list.title}
            </ButtonText>
          </Button>
        )
      })}
      {lists && !lists.length && (
        <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
          Você ainda não tem {labels.plural.toLowerCase()}.
        </Text>
      )}
      <View style={[a.flex_row, a.gap_sm, a.align_center]}>
        <View style={[a.flex_1]}>
          <TextField.Root>
            <Dialog.Input
              label={`Nome da nova ${labels.singular.toLowerCase()}`}
              placeholder={`Nova ${labels.singular.toLowerCase()}`}
              value={title}
              onChangeText={setTitle}
              maxLength={60}
            />
          </TextField.Root>
        </View>
        <Button
          label={`Criar ${labels.singular.toLowerCase()}`}
          size="small"
          color="primary"
          disabled={!title.trim() || create.isPending}
          onPress={onCreate}>
          <ButtonText>Criar</ButtonText>
        </Button>
      </View>
    </View>
  )
}
