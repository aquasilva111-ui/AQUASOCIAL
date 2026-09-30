import {useEffect, useState} from 'react'
import {TextInput, View} from 'react-native'
import {useNavigation} from '@react-navigation/native'

import {
  type ChapterRecord,
  countWords,
  LIMITS,
  newChapterRecord,
  nextChapterNumber,
  readingMinutes,
  validateChapterForPublish,
} from '#/lib/books/model'
import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
  type NavigationProp,
} from '#/lib/routes/types'
import {
  useBookQuery,
  useChaptersQuery,
  useDeleteChapterMutation,
  usePublishChapterMutation,
  useSaveChapterMutation,
} from '#/state/queries/books'
import {useSession} from '#/state/session'
import {Chip, Field, FieldLabelText} from '#/screens/ViewChannel/editor'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'
import {BooksShell, Notice} from './shared'

export function ChapterEditScreen({
  route,
}: NativeStackScreenProps<CommonNavigatorParams, 'ChapterEdit'>) {
  const isNew = route.params.chapter === 'new'
  return (
    <BooksShell
      title={isNew ? 'Novo capítulo' : 'Editar capítulo'}
      testID="chapterEditScreen"
      keyboardAware>
      <ChapterForm
        bookRkey={route.params.book}
        rkey={isNew ? undefined : route.params.chapter}
      />
    </BooksShell>
  )
}

function ChapterForm({bookRkey, rkey}: {bookRkey: string; rkey?: string}) {
  const t = useTheme()
  const navigation = useNavigation<NavigationProp>()
  const {currentAccount} = useSession()
  const did = currentAccount?.did
  const bookQ = useBookQuery(did, bookRkey)
  const chaptersQ = useChaptersQuery(did, bookRkey)
  const save = useSaveChapterMutation()
  const publish = usePublishChapterMutation()
  const del = useDeleteChapterMutation()
  const [draft, setDraft] = useState<ChapterRecord>()
  const [publishing, setPublishing] = useState(false)
  const [announce, setAnnounce] = useState(true)
  const [note, setNote] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const book = bookQ.data
  // Created once the book and the chapter list are loaded; never overwritten,
  // so a background refetch cannot erase what the author is typing.
  useEffect(() => {
    if (draft || !did || !book || !chaptersQ.data) return
    if (rkey) {
      const found = chaptersQ.data.find(c => c.rkey === rkey)
      if (found) setDraft(found.chapter)
    } else {
      setDraft(
        newChapterRecord({
          book: book.uri,
          number: nextChapterNumber(chaptersQ.data.map(c => c.chapter)),
        }),
      )
    }
  }, [draft, did, book, chaptersQ.data, rkey])

  if (bookQ.isLoading || chaptersQ.isLoading)
    return <Text style={[a.p_xl]}>Carregando…</Text>
  if (!book) return <Notice title="Livro não encontrado" />
  if (!draft) return <Notice title="Capítulo não encontrado" />

  const isPublished = draft.status === 'published'
  const issues = validateChapterForPublish(draft)
  const set = <K extends keyof ChapterRecord>(k: K, v: ChapterRecord[K]) =>
    setDraft({...draft, [k]: v})
  const goBook = () =>
    navigation.navigate('BookDetail', {
      handle: currentAccount?.handle ?? '',
      book: bookRkey,
    })

  const onSave = () =>
    save.mutate(
      {rkey, draft},
      {
        onSuccess: r => {
          Toast.show(isPublished ? 'Alterações salvas' : 'Rascunho salvo', {
            type: 'success',
          })
          // First save of a new chapter: continue on its own route.
          if (!rkey)
            navigation.replace('ChapterEdit', {
              book: bookRkey,
              chapter: r.uri.split('/').pop() ?? '',
            })
        },
        onError: () =>
          Toast.show('Não foi possível salvar. Tente novamente.', {
            type: 'error',
          }),
      },
    )

  const onPublish = async () => {
    try {
      // A new chapter is saved first so the published record has an rkey.
      let key = rkey
      if (!key) {
        const r = await save.mutateAsync({draft})
        key = r.uri.split('/').pop() ?? ''
      }
      await publish.mutateAsync({
        rkey: key,
        book: book.book,
        bookRkey,
        chapter: draft,
        announce: announce && book.book.visibility !== 'private',
        note,
      })
      Toast.show('Capítulo publicado', {type: 'success'})
      navigation.navigate('BookChapter', {
        handle: currentAccount?.handle ?? '',
        book: bookRkey,
        chapter: key,
      })
    } catch {
      Toast.show(
        'Não foi possível publicar. Nada foi perdido, tente de novo.',
        {
          type: 'error',
        },
      )
    }
  }

  return (
    <View style={[a.p_lg, a.gap_lg]}>
      <Text style={[a.text_xs, a.font_bold, t.atoms.text_contrast_medium]}>
        {book.book.title.toUpperCase()} · CAPÍTULO {draft.number}
        {isPublished ? ' · PUBLICADO' : ' · RASCUNHO'}
      </Text>
      <Field
        label="Título do capítulo"
        value={draft.title}
        onChange={v => set('title', v)}
        maxLength={LIMITS.chapterTitle}
      />
      <View style={[a.gap_xs]}>
        <FieldLabelText>Texto</FieldLabelText>
        <TextInput
          value={draft.body}
          onChangeText={v => set('body', v)}
          multiline
          maxLength={LIMITS.chapterBody}
          placeholder={
            'Escreva aqui. Deixe uma linha em branco entre parágrafos.'
          }
          placeholderTextColor={t.atoms.text_contrast_low.color}
          accessibilityLabel="Texto do capítulo"
          accessibilityHint=""
          style={[
            a.border,
            a.rounded_sm,
            a.p_md,
            a.text_lg,
            t.atoms.text,
            t.atoms.border_contrast_low,
            {minHeight: 320, textAlignVertical: 'top', lineHeight: 28},
          ]}
        />
        <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
          {countWords(draft.body).toLocaleString('pt-BR')} palavras ·{' '}
          {readingMinutes(draft.body)} min de leitura ·{' '}
          {draft.body.length.toLocaleString('pt-BR')}/
          {LIMITS.chapterBody.toLocaleString('pt-BR')}
        </Text>
      </View>
      <Field
        label="Nota da autora (opcional)"
        value={draft.authorNote ?? ''}
        onChange={v => set('authorNote', v)}
        multiline
        maxLength={LIMITS.authorNote}
      />

      {publishing ? (
        <View
          style={[
            a.gap_md,
            a.p_md,
            a.border,
            a.rounded_md,
            t.atoms.border_contrast_low,
          ]}>
          <Text style={[a.text_lg, a.font_bold]}>
            Publicar capítulo {draft.number}
          </Text>
          {book.book.visibility === 'private' ? (
            <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
              Este livro é privado: o capítulo será publicado só para você, sem
              anúncio no feed.
            </Text>
          ) : (
            <>
              <View style={[a.flex_row, a.gap_xs, a.align_center]}>
                <Chip
                  label="Anunciar no meu feed"
                  selected={announce}
                  onPress={() => setAnnounce(!announce)}
                />
              </View>
              <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
                Cria um post com o card do capítulo. As respostas a esse post
                são os comentários do capítulo.
              </Text>
              {announce && !draft.threadUri && (
                <Field
                  label="Mensagem do anúncio (opcional)"
                  value={note}
                  onChange={setNote}
                  multiline
                  maxLength={200}
                />
              )}
            </>
          )}
          <View style={[a.flex_row, a.gap_sm]}>
            <Button
              label="Publicar agora"
              size="large"
              color="primary"
              disabled={
                issues.length > 0 || publish.isPending || save.isPending
              }
              onPress={onPublish}>
              <ButtonText>
                {publish.isPending ? 'Publicando…' : 'Publicar agora'}
              </ButtonText>
            </Button>
            <Button
              label="Voltar"
              size="large"
              color="secondary"
              onPress={() => setPublishing(false)}>
              <ButtonText>Voltar</ButtonText>
            </Button>
          </View>
          {issues.length > 0 && (
            <Text style={[a.text_xs, {color: t.palette.negative_500}]}>
              {issues.includes('title_required') ? 'Falta o título. ' : ''}
              {issues.includes('body_required') ? 'Falta o texto.' : ''}
            </Text>
          )}
        </View>
      ) : (
        <View style={[a.flex_row, a.gap_sm, a.flex_wrap]}>
          <Button
            label={isPublished ? 'Salvar alterações' : 'Salvar rascunho'}
            size="large"
            color={isPublished ? 'primary' : 'secondary'}
            disabled={save.isPending || !draft.title.trim()}
            onPress={onSave}>
            <ButtonText>
              {save.isPending
                ? 'Salvando…'
                : isPublished
                  ? 'Salvar alterações'
                  : 'Salvar rascunho'}
            </ButtonText>
          </Button>
          {!isPublished && (
            <Button
              label="Publicar"
              size="large"
              color="primary"
              onPress={() => setPublishing(true)}>
              <ButtonText>Publicar</ButtonText>
            </Button>
          )}
        </View>
      )}

      {rkey && (
        <View
          style={[a.gap_sm, a.pt_lg, a.border_t, t.atoms.border_contrast_low]}>
          {confirmDelete ? (
            <View style={[a.flex_row, a.gap_sm, a.align_center, a.flex_wrap]}>
              <Text style={[a.text_sm]}>Apagar este capítulo?</Text>
              <Button
                label="Apagar capítulo"
                size="small"
                color="negative"
                disabled={del.isPending}
                onPress={() =>
                  del.mutate(
                    {rkey},
                    {
                      onSuccess: () => {
                        Toast.show('Capítulo apagado', {type: 'success'})
                        goBook()
                      },
                      onError: () =>
                        Toast.show('Não foi possível apagar.', {type: 'error'}),
                    },
                  )
                }>
                <ButtonText>Apagar</ButtonText>
              </Button>
              <Button
                label="Cancelar"
                size="small"
                color="secondary"
                onPress={() => setConfirmDelete(false)}>
                <ButtonText>Cancelar</ButtonText>
              </Button>
            </View>
          ) : (
            <View style={[a.flex_row]}>
              <Button
                label="Apagar capítulo"
                size="small"
                color="secondary"
                onPress={() => setConfirmDelete(true)}>
                <ButtonText>Apagar capítulo</ButtonText>
              </Button>
            </View>
          )}
        </View>
      )}
    </View>
  )
}
