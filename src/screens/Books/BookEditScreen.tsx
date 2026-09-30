import {useEffect, useState} from 'react'
import {View} from 'react-native'
import {Image} from 'expo-image'
import {useNavigation} from '@react-navigation/native'

import {
  type BookMaturity,
  type BookRecord,
  type BookStatus,
  type BookVisibility,
  GENRES,
  LIMITS,
  MATURITY_LABELS,
  newBookRecord,
  STATUS_LABELS,
} from '#/lib/books/model'
import {openPicker} from '#/lib/media/picker.shared'
import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
  type NavigationProp,
} from '#/lib/routes/types'
import {
  coverUrl,
  useAuthorPdsQuery,
  useBookQuery,
  useChaptersQuery,
  useDeleteBookMutation,
  useSaveBookMutation,
  useUploadCoverMutation,
} from '#/state/queries/books'
import {useSession} from '#/state/session'
import {Chip, Field, FieldLabelText} from '#/screens/ViewChannel/editor'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'
import {BooksShell, Notice} from './shared'

const VISIBILITY: Record<BookVisibility, string> = {
  public: 'Público',
  unlisted: 'Não listado',
  private: 'Privado',
}

export function BookEditScreen({
  route,
}: NativeStackScreenProps<CommonNavigatorParams, 'BookEdit'>) {
  const isNew = route.params.book === 'new'
  return (
    <BooksShell
      title={isNew ? 'Novo livro' : 'Editar livro'}
      testID="bookEditScreen"
      keyboardAware>
      <BookForm rkey={isNew ? undefined : route.params.book} />
    </BooksShell>
  )
}

function BookForm({rkey}: {rkey?: string}) {
  const t = useTheme()
  const navigation = useNavigation<NavigationProp>()
  const {currentAccount} = useSession()
  const did = currentAccount?.did
  const existing = useBookQuery(did, rkey)
  const chapters = useChaptersQuery(did, rkey)
  const pds = useAuthorPdsQuery(did)
  const save = useSaveBookMutation()
  const del = useDeleteBookMutation()
  const upload = useUploadCoverMutation()
  const [draft, setDraft] = useState<BookRecord | undefined>(
    rkey ? undefined : newBookRecord({title: ''}),
  )
  const [tags, setTags] = useState('')
  const [localCover, setLocalCover] = useState<string>()
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (rkey && existing.data && !draft) {
      setDraft(existing.data.book)
      setTags(existing.data.book.tags.join(', '))
    }
  }, [rkey, existing.data, draft])

  if (rkey && existing.isLoading)
    return <Text style={[a.p_xl]}>Carregando…</Text>
  if (rkey && !existing.data && !existing.isLoading)
    return <Notice title="Livro não encontrado" />
  if (!draft || !did) return null

  const set = <K extends keyof BookRecord>(k: K, v: BookRecord[K]) =>
    setDraft({...draft, [k]: v})
  const toggleGenre = (id: string) =>
    set(
      'genres',
      draft.genres.includes(id)
        ? draft.genres.filter(g => g !== id)
        : draft.genres.length < LIMITS.genres
          ? [...draft.genres, id]
          : draft.genres,
    )
  const canSave = draft.title.trim().length > 0 && !save.isPending

  const pickCover = async () => {
    try {
      const [image] = await openPicker({selectionLimit: 1})
      if (!image) return
      const r = await upload.mutateAsync(image)
      setDraft({...draft, cover: r.blob})
      setLocalCover(r.localUri)
    } catch {
      Toast.show('Não foi possível enviar a capa.', {type: 'error'})
    }
  }

  const onSave = () =>
    save.mutate(
      {
        rkey,
        draft: {
          ...draft,
          title: draft.title.trim(),
          tags: tags
            .split(',')
            .map(x => x.trim().toLowerCase())
            .filter(Boolean)
            .slice(0, LIMITS.tags),
        },
      },
      {
        onSuccess: () => {
          Toast.show('Livro salvo', {type: 'success'})
          navigation.navigate('BooksStudio')
        },
        onError: () =>
          Toast.show('Não foi possível salvar o livro. Tente novamente.', {
            type: 'error',
          }),
      },
    )

  const cover = localCover ?? coverUrl(pds.data, did, draft.cover)

  return (
    <View style={[a.p_lg, a.gap_lg]}>
      <View style={[a.flex_row, a.gap_md, a.align_center]}>
        <View
          style={[
            a.rounded_sm,
            a.overflow_hidden,
            t.atoms.bg_contrast_50,
            {width: 72, height: 104},
          ]}>
          {cover && (
            <Image
              source={{uri: cover}}
              style={[a.w_full, a.h_full]}
              contentFit="cover"
              accessibilityIgnoresInvertColors
            />
          )}
        </View>
        <Button
          label="Escolher capa"
          size="small"
          color="secondary"
          disabled={upload.isPending}
          onPress={pickCover}>
          <ButtonText>
            {upload.isPending ? 'Enviando…' : 'Escolher capa'}
          </ButtonText>
        </Button>
      </View>

      <Field
        label="Título"
        value={draft.title}
        onChange={v => set('title', v)}
        maxLength={LIMITS.title}
      />
      <Field
        label="Sinopse"
        value={draft.synopsis ?? ''}
        onChange={v => set('synopsis', v)}
        multiline
        maxLength={LIMITS.synopsis}
      />

      <View style={[a.gap_xs]}>
        <FieldLabelText>Gêneros (até {LIMITS.genres})</FieldLabelText>
        <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
          {GENRES.map(g => (
            <Chip
              key={g.id}
              label={g.label}
              selected={draft.genres.includes(g.id)}
              onPress={() => toggleGenre(g.id)}
            />
          ))}
        </View>
      </View>

      <Field
        label="Tags"
        value={tags}
        onChange={setTags}
        placeholder="amor, mar, segredos"
        hint="Separe por vírgula."
      />

      <ChipRow
        label="Classificação"
        options={Object.entries(MATURITY_LABELS) as [BookMaturity, string][]}
        value={draft.maturity}
        onChange={v => set('maturity', v)}
      />
      <ChipRow
        label="Status"
        options={Object.entries(STATUS_LABELS) as [BookStatus, string][]}
        value={draft.status}
        onChange={v => set('status', v)}
      />
      <ChipRow
        label="Visibilidade"
        options={Object.entries(VISIBILITY) as [BookVisibility, string][]}
        value={draft.visibility}
        onChange={v => set('visibility', v)}
      />
      <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
        Privado esconde o livro no AQUA. Como todo dado do seu repositório, o
        registro continua público na rede AT.
      </Text>

      <View style={[a.flex_row, a.gap_sm]}>
        <Button
          label="Salvar livro"
          size="large"
          color="primary"
          disabled={!canSave}
          onPress={onSave}>
          <ButtonText>
            {save.isPending ? 'Salvando…' : 'Salvar livro'}
          </ButtonText>
        </Button>
      </View>

      {rkey && (
        <View
          style={[a.gap_sm, a.pt_lg, a.border_t, t.atoms.border_contrast_low]}>
          {confirmDelete ? (
            <>
              <Text style={[a.text_sm]}>
                Apagar este livro e seus {chapters.data?.length ?? 0} capítulos?
                Posts já publicados no feed continuam lá e precisam ser apagados
                à parte.
              </Text>
              <View style={[a.flex_row, a.gap_sm]}>
                <Button
                  label="Apagar livro"
                  size="small"
                  color="negative"
                  disabled={del.isPending}
                  onPress={() =>
                    del.mutate(
                      {
                        rkey,
                        chapterRkeys: (chapters.data ?? []).map(c => c.rkey),
                      },
                      {
                        onSuccess: () => {
                          Toast.show('Livro apagado', {type: 'success'})
                          navigation.navigate('BooksStudio')
                        },
                        onError: () =>
                          Toast.show('Não foi possível apagar o livro.', {
                            type: 'error',
                          }),
                      },
                    )
                  }>
                  <ButtonText>
                    {del.isPending ? 'Apagando…' : 'Apagar livro'}
                  </ButtonText>
                </Button>
                <Button
                  label="Cancelar"
                  size="small"
                  color="secondary"
                  onPress={() => setConfirmDelete(false)}>
                  <ButtonText>Cancelar</ButtonText>
                </Button>
              </View>
            </>
          ) : (
            <View style={[a.flex_row]}>
              <Button
                label="Apagar livro"
                size="small"
                color="secondary"
                onPress={() => setConfirmDelete(true)}>
                <ButtonText>Apagar livro</ButtonText>
              </Button>
            </View>
          )}
        </View>
      )}
    </View>
  )
}

function ChipRow<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: [T, string][]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <View style={[a.gap_xs]}>
      <FieldLabelText>{label}</FieldLabelText>
      <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
        {options.map(([id, text]) => (
          <Chip
            key={id}
            label={text}
            selected={value === id}
            onPress={() => onChange(id)}
          />
        ))}
      </View>
    </View>
  )
}
