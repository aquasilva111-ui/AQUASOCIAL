import {useMemo, useState} from 'react'
import {View} from 'react-native'

import {
  HIGHLIGHT_ITEMS_MAX,
  HIGHLIGHT_TITLE_MAX,
  type HighlightView,
  storyKey,
  validateHighlightDraft,
} from '#/lib/stories/model'
import {logger} from '#/logger'
import {
  useCreateHighlightMutation,
  useDeleteHighlightMutation,
  useUpdateHighlightMutation,
} from '#/state/queries/highlights'
import {useStoriesQuery} from '#/state/queries/stories'
import * as Toast from '#/view/com/util/Toast'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Dialog from '#/components/Dialog'
import * as TextField from '#/components/forms/TextField'
import {Loader} from '#/components/Loader'
import {StoryPreview} from '#/components/stories/StoryFrame'
import {Text} from '#/components/Typography'

const THUMB = 88

export function HighlightEditorDialog({
  control,
  did,
  highlight,
}: {
  control: Dialog.DialogControlProps
  did: string
  highlight?: HighlightView
}) {
  return (
    <Dialog.Outer control={control}>
      <Dialog.Handle />
      {/* key resets the draft whenever a different highlight is opened */}
      <Inner key={highlight?.uri ?? 'new'} did={did} highlight={highlight} />
    </Dialog.Outer>
  )
}

function Inner({did, highlight}: {did: string; highlight?: HighlightView}) {
  const t = useTheme()
  const control = Dialog.useDialogContext()
  // The archive includes expired stories: that is the point of highlights.
  const {data: archive, isLoading} = useStoriesQuery(did, {
    includeExpired: true,
  })
  const {mutateAsync: create, isPending: creating} =
    useCreateHighlightMutation()
  const {mutateAsync: update, isPending: updating} =
    useUpdateHighlightMutation()
  const {mutateAsync: remove, isPending: removing} =
    useDeleteHighlightMutation()

  const [title, setTitle] = useState(highlight?.title ?? '')
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(highlight?.items.map(i => storyKey(i))),
  )

  // Existing items whose story record is gone still belong to the album.
  const pool = useMemo(() => {
    const byCid = new Map<string, NonNullable<typeof archive>[number]>()
    for (const item of highlight?.items ?? []) byCid.set(storyKey(item), item)
    for (const s of archive ?? []) byCid.set(storyKey(s), s)
    return [...byCid.values()].sort((x, y) =>
      y.createdAt.localeCompare(x.createdAt),
    )
  }, [archive, highlight])

  const busy = creating || updating || removing
  const invalid = validateHighlightDraft(title, selected.size)

  const toggle = (cid: string) =>
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(cid)) next.delete(cid)
      else if (next.size < HIGHLIGHT_ITEMS_MAX) next.add(cid)
      return next
    })

  const onSave = async () => {
    // Keep chronological order regardless of tap order.
    const stories = pool
      .filter(s => selected.has(storyKey(s)))
      .sort((x, y) => x.createdAt.localeCompare(y.createdAt))
    try {
      if (highlight) await update({highlight, title, stories})
      else await create({title, stories})
      Toast.show('Destaque salvo')
      control.close()
    } catch (e: any) {
      logger.error('Failed to save highlight', {message: String(e)})
      Toast.show('Não foi possível salvar o destaque', 'error')
    }
  }

  const onDelete = async () => {
    if (!highlight) return
    try {
      await remove(highlight.rkey)
      Toast.show('Destaque excluído')
      control.close()
    } catch (e: any) {
      logger.error('Failed to delete highlight', {message: String(e)})
      Toast.show('Não foi possível excluir o destaque', 'error')
    }
  }

  return (
    <Dialog.ScrollableInner
      label={highlight ? 'Editar destaque' : 'Novo destaque'}>
      <View style={[a.gap_lg]}>
        <Text style={[a.text_xl, a.font_bold]}>
          {highlight ? 'Editar destaque' : 'Novo destaque'}
        </Text>

        <TextField.Root>
          <Dialog.Input
            label="Título do destaque"
            placeholder="Título"
            defaultValue={title}
            onChangeText={setTitle}
            maxLength={HIGHLIGHT_TITLE_MAX}
          />
        </TextField.Root>

        <View style={[a.gap_sm]}>
          <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
            Escolha os stories ({selected.size}/{HIGHLIGHT_ITEMS_MAX})
          </Text>
          {isLoading ? (
            <Loader size="lg" />
          ) : !pool.length ? (
            <Text style={[t.atoms.text_contrast_medium]}>
              Publique um story primeiro para criar um destaque.
            </Text>
          ) : (
            <View style={[a.flex_row, a.flex_wrap, a.gap_sm]}>
              {pool.map(s => {
                const cid = storyKey(s)
                const on = selected.has(cid)
                return (
                  <Button
                    key={cid}
                    label={on ? 'Remover do destaque' : 'Adicionar ao destaque'}
                    onPress={() => toggle(cid)}
                    style={[
                      a.rounded_md,
                      a.overflow_hidden,
                      {
                        width: THUMB,
                        height: THUMB * 1.5,
                        borderWidth: 3,
                        borderColor: on ? '#7C3AED' : 'transparent',
                        opacity: on ? 1 : 0.6,
                      },
                    ]}>
                    <StoryPreview story={s} />
                  </Button>
                )
              })}
            </View>
          )}
        </View>

        <View style={[a.gap_sm]}>
          <Button
            label="Salvar destaque"
            size="large"
            color="primary"
            variant="solid"
            disabled={!!invalid || busy}
            onPress={onSave}>
            <ButtonText>Salvar</ButtonText>
          </Button>
          {highlight && (
            <Button
              label="Excluir destaque"
              size="large"
              color="negative_subtle"
              variant="solid"
              disabled={busy}
              onPress={onDelete}>
              <ButtonText>Excluir destaque</ButtonText>
            </Button>
          )}
        </View>
      </View>
    </Dialog.ScrollableInner>
  )
}
