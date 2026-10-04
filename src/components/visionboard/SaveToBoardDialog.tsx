import {useMemo, useState} from 'react'
import {View} from 'react-native'
import {type AppBskyFeedDefs} from '@atproto/api'

import {cleanError} from '#/lib/strings/errors'
import {
  type BoardRecord,
  boardsContaining,
  coverOf,
  newBoardRecord,
  type StoredPin,
} from '#/lib/visionboard/boards'
import {extractAesthetic} from '#/lib/visionboard/extract'
import {type Shadow} from '#/state/cache/post-shadow'
import {useBookmarkMutation} from '#/state/queries/bookmarks/useBookmarkMutation'
import {
  type StoredBoard,
  useAddPinMutation,
  useBoardsQuery,
  usePinsByBoardQuery,
  useRemovePinMutation,
  useSaveBoardMutation,
} from '#/state/queries/visionboard-boards'
import {useSession} from '#/state/session'
import {atoms as a, useTheme, web} from '#/alf'
import {Button} from '#/components/Button'
import * as Dialog from '#/components/Dialog'
import {SearchInput} from '#/components/forms/SearchInput'
import {Loader} from '#/components/Loader'
import * as toast from '#/components/Toast'
import {Text} from '#/components/Typography'

/** Cover colour of a board: the palette of its newest pins as a soft gradient. */
export function boardSwatch(
  board: BoardRecord,
  pins: StoredPin[],
): string | undefined {
  const cover = coverOf(board, pins)
  const colors = [cover, ...pins.filter(p => p !== cover).slice(0, 2)]
    .map(p => p?.pin.aesthetic?.palette[0])
    .filter((c): c is string => !!c)
  if (!colors.length) return undefined
  return colors.length === 1
    ? colors[0]
    : `linear-gradient(135deg, ${colors.join(', ')})`
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Image the dialog is saving: one image of one AQUA post. */
export type SaveTarget = {
  post: Shadow<AppBskyFeedDefs.PostView>
  imageIndex: number
  /** Small image URL, used once to read the pin's aesthetic signature. */
  thumbUrl?: string
  tags?: string[]
}

/**
 * "Salvar em…": the user's Visionboards with a search box. Tapping a board
 * saves the image there (tapping again removes it); a name that matches no
 * board offers to create it. Saving also keeps the image in AQUA Saved
 * (bookmarks) so existing saves keep working.
 */
export function SaveToBoardDialog({
  control,
  target,
}: {
  control: Dialog.DialogControlProps
  target: SaveTarget
}) {
  return (
    <Dialog.Outer control={control} nativeOptions={{preventExpansion: true}}>
      <Dialog.Handle />
      <Dialog.ScrollableInner
        label="Salvar em um Visionboard"
        style={web({maxWidth: 420})}>
        <Body control={control} target={target} />
      </Dialog.ScrollableInner>
    </Dialog.Outer>
  )
}

function Body({
  control,
  target,
}: {
  control: Dialog.DialogControlProps
  target: SaveTarget
}) {
  const t = useTheme()
  const {currentAccount} = useSession()
  const [query, setQuery] = useState('')
  const boards = useBoardsQuery(currentAccount?.did)
  const pins = usePinsByBoardQuery(currentAccount?.did)
  const saveBoard = useSaveBoardMutation()
  const addPin = useAddPinMutation()
  const removePin = useRemovePinMutation()
  const {mutateAsync: bookmark} = useBookmarkMutation()
  const [busy, setBusy] = useState<string | undefined>()

  const subject = useMemo(
    () => ({uri: target.post.uri, cid: target.post.cid}),
    [target.post.uri, target.post.cid],
  )
  const heldIn = useMemo(
    () =>
      new Set(
        boardsContaining(pins.data ?? new Map(), subject, target.imageIndex),
      ),
    [pins.data, subject, target.imageIndex],
  )

  const list = boards.data ?? []
  const q = norm(query.trim())
  const filtered = list.filter(b => !q || norm(b.board.title).includes(q))
  const exact = list.some(b => norm(b.board.title) === q)
  const canCreate = !!query.trim() && !exact

  async function ensureBookmark() {
    if (!target.post.viewer?.bookmarked) {
      await bookmark({action: 'create', post: target.post})
    }
  }

  async function toggle(board: StoredBoard) {
    setBusy(board.uri)
    try {
      if (heldIn.has(board.uri)) {
        const stored = (pins.data?.get(board.uri) ?? []).find(
          p =>
            p.pin.subject.uri === subject.uri &&
            p.pin.imageIndex === target.imageIndex,
        )
        if (stored) await removePin.mutateAsync({rkey: stored.rkey})
        toast.show(`Removido de ${board.board.title}`)
      } else {
        const aesthetic = target.thumbUrl
          ? await extractAesthetic(target.thumbUrl)
          : undefined
        await addPin.mutateAsync({
          boardUri: board.uri,
          subject,
          imageIndex: target.imageIndex,
          aesthetic,
          tags: target.tags ?? [],
        })
        await ensureBookmark()
        toast.show(`Salvo em ${board.board.title}`, {type: 'success'})
      }
      control.close()
    } catch (e) {
      toast.show(cleanError(e), {type: 'error'})
    } finally {
      setBusy(undefined)
    }
  }

  async function createAndSave() {
    const title = query.trim()
    if (!title) return
    setBusy('new')
    try {
      const {uri} = await saveBoard.mutateAsync({
        draft: newBoardRecord({title, visibility: 'private'}),
      })
      const aesthetic = target.thumbUrl
        ? await extractAesthetic(target.thumbUrl)
        : undefined
      await addPin.mutateAsync({
        boardUri: uri,
        subject,
        imageIndex: target.imageIndex,
        aesthetic,
        tags: target.tags ?? [],
      })
      await ensureBookmark()
      toast.show(`Salvo em ${title}`, {type: 'success'})
      control.close()
    } catch (e) {
      toast.show(cleanError(e), {type: 'error'})
    } finally {
      setBusy(undefined)
    }
  }

  return (
    <View style={[a.gap_md]}>
      <Text style={[a.text_xl, a.font_semi_bold]}>Salvar em</Text>
      <SearchInput
        value={query}
        onChangeText={setQuery}
        onClearText={() => setQuery('')}
        placeholder="Buscar visionboard"
      />
      {boards.isLoading || pins.isLoading ? (
        <View style={[a.align_center, a.py_xl]}>
          <Loader size="xl" />
        </View>
      ) : (
        <View style={[a.gap_2xs]}>
          {filtered.map(b => (
            <BoardRow
              key={b.uri}
              board={b}
              pins={pins.data?.get(b.uri) ?? []}
              held={heldIn.has(b.uri)}
              loading={busy === b.uri}
              onPress={() => toggle(b)}
            />
          ))}
          {canCreate && (
            <Button
              label={`Criar ${query.trim()}`}
              onPress={createAndSave}
              disabled={busy === 'new'}
              style={[a.justify_start]}>
              {({hovered}) => (
                <View
                  style={[
                    a.flex_row,
                    a.align_center,
                    a.gap_md,
                    a.w_full,
                    a.p_sm,
                    a.rounded_lg,
                    hovered && t.atoms.bg_contrast_25,
                  ]}>
                  <View
                    style={[
                      a.align_center,
                      a.justify_center,
                      t.atoms.bg_contrast_25,
                      {width: 48, height: 48, borderRadius: 14},
                    ]}>
                    <Text style={[a.text_2xl, {fontWeight: '300'}]}>＋</Text>
                  </View>
                  <View style={[a.flex_1]}>
                    <Text style={[a.font_semi_bold]} numberOfLines={1}>
                      Criar “{query.trim()}”
                    </Text>
                    <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
                      novo visionboard privado
                    </Text>
                  </View>
                </View>
              )}
            </Button>
          )}
          {!filtered.length && !canCreate && (
            <Text style={[a.py_lg, t.atoms.text_contrast_medium]}>
              Você ainda não tem visionboards. Digite um nome para criar o
              primeiro.
            </Text>
          )}
        </View>
      )}
    </View>
  )
}

function BoardRow({
  board,
  pins,
  held,
  loading,
  onPress,
}: {
  board: StoredBoard
  pins: StoredPin[]
  held: boolean
  loading: boolean
  onPress: () => void
}) {
  const t = useTheme()
  const swatch = boardSwatch(board.board, pins)
  return (
    <Button label={`Salvar em ${board.board.title}`} onPress={onPress}>
      {({hovered}) => (
        <View
          style={[
            a.flex_row,
            a.align_center,
            a.gap_md,
            a.w_full,
            a.p_sm,
            a.rounded_lg,
            hovered && t.atoms.bg_contrast_25,
          ]}>
          <View
            style={[
              t.atoms.bg_contrast_25,
              a.overflow_hidden,
              {width: 48, height: 48, borderRadius: 14},
              swatch && web({backgroundImage: swatch}),
            ]}
          />
          <View style={[a.flex_1, {minWidth: 0}]}>
            <Text style={[a.font_semi_bold]} numberOfLines={1}>
              {board.board.title}
            </Text>
            <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
              {pins.length} {pins.length === 1 ? 'pin' : 'pins'} ·{' '}
              {board.board.visibility === 'private' ? 'Privado' : 'Público'}
            </Text>
          </View>
          {loading ? (
            <Loader size="md" />
          ) : (
            <View
              style={[
                a.rounded_full,
                a.px_md,
                {paddingVertical: 7},
                held ? {backgroundColor: '#111315'} : t.atoms.bg_contrast_25,
              ]}>
              <Text
                style={[a.text_sm, a.font_semi_bold, held && {color: '#fff'}]}>
                {held ? 'Salvo ✓' : 'Salvar'}
              </Text>
            </View>
          )}
        </View>
      )}
    </Button>
  )
}
