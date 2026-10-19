import {useMemo, useState} from 'react'
import {Pressable, TextInput, View} from 'react-native'
import {useNavigation} from '@react-navigation/native'

import {GENRES, LIMITS, readingMinutes} from '#/lib/books/model'
import {type NavigationProp} from '#/lib/routes/types'
import {
  blankDraft,
  splitDraftParts,
  useWriteSnapshot,
  writeRepository,
} from '#/lib/write/store'
import {
  type ContentOrigin,
  type ContentWarning,
  type RecipeDifficulty,
  type WriteAuthor,
  type WriteDraft,
  type WritePostType,
} from '#/lib/write/types'
import {useSession} from '#/state/session'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Layout from '#/components/Layout'
import {Text} from '#/components/Typography'
import {Chip, OPINION_LIMIT, PlaceholderBanner} from './ui'

const TYPES: {id: WritePostType; label: string}[] = [
  {id: 'book', label: 'Book'},
  {id: 'article', label: 'Article'},
  {id: 'opinion', label: 'Opinion'},
  {id: 'recipe', label: 'Recipe'},
]

const ORIGINS: {id: ContentOrigin['kind']; label: string}[] = [
  {id: 'original', label: 'Original work'},
  {id: 'derivative', label: 'Fanfic / derivative'},
  {id: 'translation', label: 'Translation'},
]

const WARNINGS: {id: ContentWarning; label: string}[] = [
  {id: 'none', label: 'Content warning: none'},
  {id: 'mild', label: 'Content warning: mild'},
  {id: 'explicit', label: 'Content warning: explicit'},
]

export function WriteComposeScreen() {
  const navigation = useNavigation<NavigationProp>()
  const {currentAccount} = useSession()
  const data = useWriteSnapshot()
  const [draft, setDraft] = useState<WriteDraft>(() => blankDraft('book'))
  const [error, setError] = useState<string>()

  const books = useMemo(() => {
    const seen = new Set<string>()
    return data.posts.flatMap(post => {
      if (post.type !== 'book' || seen.has(post.book.id)) return []
      seen.add(post.book.id)
      return [{id: post.book.id, title: post.book.title}]
    })
  }, [data.posts])

  const author: WriteAuthor = currentAccount
    ? {
        id: currentAccount.did,
        handle: currentAccount.handle,
        displayName: currentAccount.handle,
        color: '#002BEF',
        followed: true,
      }
    : {
        id: 'local-you',
        handle: 'you.example',
        displayName: 'You',
        color: '#002BEF',
        followed: true,
      }

  const patch = (partial: Partial<WriteDraft>) => {
    setError(undefined)
    setDraft(current => ({...current, ...partial}))
  }

  const publish = () => {
    const post = writeRepository.publish(draft, author)
    if (!post) {
      setError(missingFields(draft))
      return
    }
    navigation.navigate('Books')
  }

  return (
    <Layout.Screen testID="writeComposeScreen" hideCenterBorders>
      <Layout.KeyboardAwareContent>
        <PlaceholderBanner />
        <View
          style={[
            a.px_lg,
            a.pt_sm,
            a.pb_md,
            a.flex_row,
            a.align_center,
            a.justify_between,
          ]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            accessibilityHint=""
            onPress={() => navigation.navigate('Books')}>
            <Text style={[a.font_bold, {fontSize: 20}]}>✕ New in Write</Text>
          </Pressable>
          <View style={[a.flex_row, a.gap_sm]}>
            <Button
              label="Save draft"
              color="secondary"
              size="small"
              onPress={() => {
                writeRepository.saveDraft({
                  ...draft,
                  updatedAt: new Date().toISOString(),
                })
                setError(undefined)
              }}>
              <ButtonText>Save draft</ButtonText>
            </Button>
            <Button
              label="Publish"
              color="primary"
              size="small"
              onPress={publish}>
              <ButtonText>Publish</ButtonText>
            </Button>
          </View>
        </View>

        <Section title="What are you writing?">
          <View style={[a.flex_row, a.gap_sm]}>
            {TYPES.map(item => (
              <Pressable
                key={item.id}
                testID={`writeComposeType-${item.id}`}
                accessibilityRole="button"
                accessibilityLabel={item.label}
                accessibilityHint=""
                accessibilityState={{selected: draft.type === item.id}}
                onPress={() => patch({type: item.id})}
                style={[a.flex_1]}>
                <TypeCard
                  label={item.label}
                  selected={draft.type === item.id}
                />
              </Pressable>
            ))}
          </View>
        </Section>

        {draft.type === 'book' && (
          <BookFields draft={draft} books={books} onChange={patch} />
        )}
        {draft.type === 'article' && (
          <ArticleFields draft={draft} onChange={patch} />
        )}
        {draft.type === 'opinion' && (
          <OpinionFields draft={draft} onChange={patch} />
        )}
        {draft.type === 'recipe' && (
          <RecipeFields draft={draft} onChange={patch} />
        )}

        <Section title="Origin">
          <View style={[a.flex_row, a.gap_sm, a.flex_wrap]}>
            {ORIGINS.map(item => (
              <Chip
                key={item.id}
                label={item.label}
                selected={draft.originKind === item.id}
                onPress={() => patch({originKind: item.id})}
              />
            ))}
          </View>
          {draft.originKind !== 'original' && (
            <Field
              label="Credit the source"
              value={draft.sourceCredit ?? ''}
              onChangeText={sourceCredit => patch({sourceCredit})}
              placeholder="Original title and author"
            />
          )}
          <Text style={[a.text_xs, a.mt_sm, {lineHeight: 18}]}>
            TODO(royalties): the split is not decided. Publishing records
            attribution only. No percentage is stored.
          </Text>
          <View style={[a.flex_row, a.gap_sm, a.flex_wrap, a.mt_md]}>
            <Chip
              label={
                draft.commentsPerPart ? 'Comments per part' : 'Comments off'
              }
              selected={draft.commentsPerPart}
              onPress={() => patch({commentsPerPart: !draft.commentsPerPart})}
            />
            {WARNINGS.map(item => (
              <Chip
                key={item.id}
                label={item.label}
                selected={draft.contentWarning === item.id}
                onPress={() => patch({contentWarning: item.id})}
              />
            ))}
            <Chip
              label="Schedule"
              selected={draft.scheduledFor !== undefined}
              onPress={() =>
                patch({
                  scheduledFor: draft.scheduledFor ? undefined : '',
                })
              }
            />
          </View>
          {draft.scheduledFor !== undefined && (
            <Field
              label="Publish at"
              value={draft.scheduledFor}
              onChangeText={scheduledFor => patch({scheduledFor})}
              placeholder="2026-10-14T18:00:00Z"
            />
          )}
        </Section>
        {error && (
          <Text style={[a.px_lg, a.pb_lg, {color: '#B91C1C'}]}>{error}</Text>
        )}
      </Layout.KeyboardAwareContent>
    </Layout.Screen>
  )
}

function missingFields(draft: WriteDraft): string {
  if (draft.type === 'book') {
    if (!draft.chapterTitle?.trim()) return 'Add a chapter title.'
    if (!draft.parts.some(part => part.trim())) return 'Add at least one part.'
    if (!draft.bookId && !draft.newBookTitle?.trim())
      return 'Name the new book.'
  }
  if (draft.type === 'article') {
    if (!draft.articleTitle?.trim()) return 'Add an article title.'
    if (!draft.body?.trim()) return 'Add the article body.'
  }
  if (draft.type === 'opinion') {
    if (!draft.opinion?.trim()) return 'Write the opinion.'
    if ((draft.opinion?.length ?? 0) > OPINION_LIMIT) {
      return `Opinions stay within ${OPINION_LIMIT} characters.`
    }
  }
  if (draft.type === 'recipe') {
    if (!draft.recipeTitle?.trim()) return 'Add a recipe title.'
    if (!draft.steps.some(step => step.trim())) return 'Add at least one step.'
  }
  if (
    draft.scheduledFor?.trim() &&
    Number.isNaN(Date.parse(draft.scheduledFor))
  ) {
    return 'Use a date like 2026-10-14T18:00:00Z.'
  }
  return 'This draft is missing a required field.'
}

function BookFields({
  draft,
  books,
  onChange,
}: {
  draft: WriteDraft
  books: {id: string; title: string}[]
  onChange: (partial: Partial<WriteDraft>) => void
}) {
  return (
    <Section title="Book">
      <Text style={[a.text_sm, a.font_bold, a.mb_xs]}>Book</Text>
      <View style={[a.flex_row, a.gap_sm, a.flex_wrap]}>
        {books.map(book => (
          <Chip
            key={book.id}
            label={book.title}
            selected={draft.bookId === book.id}
            onPress={() => onChange({bookId: book.id, newBookTitle: undefined})}
          />
        ))}
        <Chip
          label="+ New book"
          selected={!draft.bookId}
          onPress={() => onChange({bookId: undefined})}
        />
      </View>
      {!draft.bookId && (
        <Field
          label="New book title"
          value={draft.newBookTitle ?? ''}
          onChangeText={newBookTitle => onChange({newBookTitle})}
        />
      )}
      <Field
        label="Chapter title"
        value={draft.chapterTitle ?? ''}
        onChangeText={chapterTitle => onChange({chapterTitle})}
        placeholder="Ch. 8 · Example chapter title"
      />
      <Text style={[a.text_sm, a.font_bold, a.mt_md, a.mb_xs]}>Genre</Text>
      <View style={[a.flex_row, a.gap_sm, a.flex_wrap]}>
        {GENRES.map(genre => {
          const selected = draft.genres.includes(genre.id)
          return (
            <Chip
              key={genre.id}
              label={genre.label}
              selected={selected}
              onPress={() => {
                const genres = selected
                  ? draft.genres.filter(id => id !== genre.id)
                  : draft.genres.length < LIMITS.genres
                    ? [...draft.genres, genre.id]
                    : draft.genres
                onChange({genres})
              }}
            />
          )
        })}
      </View>
      <Text style={[a.text_sm, a.font_bold, a.mt_md]}>
        Parts (each becomes a connected post)
      </Text>
      {draft.parts.map((part, index) => (
        <Field
          key={index}
          label={`Part ${index + 1}`}
          value={part}
          multiline
          onChangeText={value => {
            const parts = draft.parts.slice()
            parts[index] = value
            onChange({parts})
          }}
          placeholder={`Part ${index + 1} — placeholder text…`}
        />
      ))}
      <View style={[a.flex_row, a.gap_sm, a.mt_sm, a.flex_wrap]}>
        <Chip
          label="+ Add part"
          selected={false}
          onPress={() => onChange({parts: [...draft.parts, '']})}
        />
        <Chip
          label="Auto-split by paragraph"
          selected={false}
          onPress={() => onChange({parts: splitDraftParts(draft.parts)})}
        />
      </View>
    </Section>
  )
}

function ArticleFields({
  draft,
  onChange,
}: {
  draft: WriteDraft
  onChange: (partial: Partial<WriteDraft>) => void
}) {
  const minutes = readingMinutes(draft.body ?? '')
  return (
    <Section title="Article">
      <Field
        label="Title"
        value={draft.articleTitle ?? ''}
        onChangeText={articleTitle => onChange({articleTitle})}
      />
      <Field
        label="Subtitle"
        value={draft.subtitle ?? ''}
        onChangeText={subtitle => onChange({subtitle})}
      />
      <Field
        label="Body"
        value={draft.body ?? ''}
        multiline
        onChangeText={body => onChange({body})}
      />
      <Field
        label="Tags"
        value={draft.tags.join(', ')}
        onChangeText={value =>
          onChange({
            tags: value
              .split(',')
              .map(tag => tag.trim())
              .filter(Boolean),
          })
        }
        placeholder="tecnologia, publishing"
      />
      <Text style={[a.text_xs, a.mt_sm]}>
        Auto read time: {minutes === 0 ? '—' : `${minutes} min`}
      </Text>
    </Section>
  )
}

function OpinionFields({
  draft,
  onChange,
}: {
  draft: WriteDraft
  onChange: (partial: Partial<WriteDraft>) => void
}) {
  const length = draft.opinion?.length ?? 0
  return (
    <Section title="Opinion">
      <Field
        label={`Text (${length}/${OPINION_LIMIT})`}
        value={draft.opinion ?? ''}
        multiline
        onChangeText={opinion =>
          onChange({opinion: opinion.slice(0, OPINION_LIMIT)})
        }
        placeholder="A short take, up to 600 characters."
      />
      <Field
        label="Optional quote"
        value={draft.quoteText ?? ''}
        onChangeText={quoteText => onChange({quoteText})}
      />
      <Field
        label="Optional link"
        value={draft.quoteUrl ?? ''}
        onChangeText={quoteUrl => onChange({quoteUrl})}
        placeholder="https://"
      />
    </Section>
  )
}

function RecipeFields({
  draft,
  onChange,
}: {
  draft: WriteDraft
  onChange: (partial: Partial<WriteDraft>) => void
}) {
  const difficulties: RecipeDifficulty[] = ['easy', 'medium', 'hard']
  return (
    <Section title="Recipe">
      <Field
        label="Title"
        value={draft.recipeTitle ?? ''}
        onChangeText={recipeTitle => onChange({recipeTitle})}
      />
      <View style={[a.flex_row, a.gap_sm]}>
        <View style={[a.flex_1]}>
          <Field
            label="Prep min"
            value={String(draft.prepMinutes ?? 0)}
            onChangeText={value => onChange({prepMinutes: Number(value) || 0})}
          />
        </View>
        <View style={[a.flex_1]}>
          <Field
            label="Cook min"
            value={String(draft.cookMinutes ?? 0)}
            onChangeText={value => onChange({cookMinutes: Number(value) || 0})}
          />
        </View>
        <View style={[a.flex_1]}>
          <Field
            label="Servings"
            value={String(draft.servings ?? 1)}
            onChangeText={value => onChange({servings: Number(value) || 1})}
          />
        </View>
      </View>
      <Text style={[a.text_sm, a.font_bold, a.mt_md, a.mb_xs]}>Difficulty</Text>
      <View style={[a.flex_row, a.gap_sm]}>
        {difficulties.map(item => (
          <Chip
            key={item}
            label={item[0].toUpperCase() + item.slice(1)}
            selected={draft.difficulty === item}
            onPress={() => onChange({difficulty: item})}
          />
        ))}
      </View>
      <Field
        label="Ingredients (one per line)"
        value={draft.ingredients.join('\n')}
        multiline
        onChangeText={value => onChange({ingredients: value.split('\n')})}
      />
      <Field
        label="Steps (one per line)"
        value={draft.steps.join('\n')}
        multiline
        onChangeText={value => onChange({steps: value.split('\n')})}
      />
    </Section>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  const t = useTheme()
  return (
    <View
      style={[
        a.mx_lg,
        a.mb_md,
        a.p_md,
        a.rounded_md,
        a.border,
        a.gap_sm,
        t.atoms.border_contrast_low,
      ]}>
      <Text style={[a.font_bold]}>{title}</Text>
      {children}
    </View>
  )
}

function TypeCard({label, selected}: {label: string; selected: boolean}) {
  const t = useTheme()
  return (
    <View
      style={[
        a.rounded_md,
        a.p_md,
        a.align_center,
        a.border,
        {
          borderWidth: 1.5,
          borderColor: selected
            ? t.palette.primary_500
            : t.palette.contrast_100,
          backgroundColor: selected ? t.palette.primary_50 : 'transparent',
        },
      ]}>
      <Text
        style={[
          a.font_bold,
          a.text_sm,
          selected ? {color: t.palette.primary_500} : t.atoms.text,
        ]}>
        {label}
      </Text>
    </View>
  )
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
}: {
  label: string
  value: string
  onChangeText: (value: string) => void
  placeholder?: string
  multiline?: boolean
}) {
  const t = useTheme()
  return (
    <View style={[a.mt_sm]}>
      <Text style={[a.text_sm, a.font_bold, a.mb_xs]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={t.palette.contrast_500}
        accessibilityLabel={label}
        accessibilityHint=""
        multiline={multiline}
        style={[
          a.px_md,
          a.py_sm,
          a.rounded_md,
          a.border,
          a.text_md,
          t.atoms.text,
          t.atoms.border_contrast_low,
          multiline && {minHeight: 90, textAlignVertical: 'top'},
        ]}
      />
    </View>
  )
}
