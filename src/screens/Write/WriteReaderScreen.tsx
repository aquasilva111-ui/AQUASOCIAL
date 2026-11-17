import {useEffect, useState} from 'react'
import {Pressable, TextInput, View} from 'react-native'

import {readingMinutes} from '#/lib/books/model'
import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
} from '#/lib/routes/types'
import {useWriteSnapshot, writeRepository} from '#/lib/write/store'
import {type WriteChapter, type WritePost} from '#/lib/write/types'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Layout from '#/components/Layout'
import {Link} from '#/components/Link'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'
import {Avatar, PlaceholderBanner, PostActions, ProgressBar} from './ui'

type Props = NativeStackScreenProps<CommonNavigatorParams, 'WriteRead'>

export function WriteReaderScreen({route}: Props) {
  const data = useWriteSnapshot()
  const chapter = data.chapters.find(item => item.id === route.params.id)
  const post = data.posts.find(
    item =>
      item.id === route.params.id ||
      (item.type === 'book' && item.chapter.id === route.params.id),
  )
  if (chapter) {
    return (
      <ChapterReader
        chapter={chapter}
        posts={data.posts}
        mode={data.readingMode}
      />
    )
  }
  if (post && post.type !== 'book') {
    return <PieceReader post={post} />
  }
  return (
    <Layout.Screen testID="writeReaderScreen" hideCenterBorders>
      <Layout.Content>
        <View style={[a.p_xl]}>
          <Text style={[a.font_bold, a.text_lg]}>
            This piece is not on this device
          </Text>
          <Link to="/books" label="Back to Write">
            <Text style={[a.mt_md, a.font_bold]}>Back to Write</Text>
          </Link>
        </View>
      </Layout.Content>
    </Layout.Screen>
  )
}

function ChapterReader({
  chapter,
  posts,
  mode,
}: {
  chapter: WriteChapter
  posts: WritePost[]
  mode: 'thread' | 'page'
}) {
  const t = useTheme()
  const bookPost = posts.find(
    item => item.type === 'book' && item.book.id === chapter.bookId,
  )
  const book = bookPost?.type === 'book' ? bookPost.book : undefined
  const chapters = useWriteSnapshot()
    .chapters.filter(item => item.bookId === chapter.bookId)
    .slice()
    .sort((left, right) => left.number - right.number)
  const index = chapters.findIndex(item => item.id === chapter.id)
  const prev = index > 0 ? chapters[index - 1] : undefined
  const next =
    index >= 0 && index < chapters.length - 1 ? chapters[index + 1] : undefined
  const total = book?.chapterCount ?? chapters.length
  const pct = total === 0 ? 0 : (chapter.number / total) * 100

  const chapterCount = book?.chapterCount ?? 0
  useEffect(() => {
    writeRepository.setProgress({
      bookId: chapter.bookId,
      chapterNumber: chapter.number,
      partIndex: 0,
    })
    if (chapterCount > 0 && chapter.number >= chapterCount) {
      writeRepository.recordEvent({
        kind: 'read_to_end',
        bookId: chapter.bookId,
        authorId: chapter.author.id,
      })
    }
  }, [
    chapter.author.id,
    chapter.bookId,
    chapter.id,
    chapter.number,
    chapterCount,
  ])

  return (
    <Layout.Screen testID="writeReaderScreen" hideCenterBorders>
      <Layout.Content>
        <PlaceholderBanner />
        <View style={[a.px_lg, a.pt_sm, a.pb_md, a.gap_sm]}>
          <View
            style={[a.flex_row, a.align_center, a.justify_between, a.gap_md]}>
            <Link to="/books" label={`Back to ${book?.title ?? 'Write'}`}>
              <Text style={[a.font_bold, {fontSize: 20}]}>
                ← {book?.title ?? chapter.title}
              </Text>
            </Link>
            <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
              Ch. {chapter.number} / {total}
            </Text>
          </View>
          <ProgressBar value={pct} />
          <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
            Chapter {chapter.number} · “{chapter.title}” ·{' '}
            {chapter.parts.length} parts · ~{chapter.readMinutes} min · by @
            {chapter.author.handle}
          </Text>
        </View>
        {mode === 'thread' ? (
          <View>
            {chapter.parts.map((part, partIndex) => (
              <View key={part.id} style={[a.flex_row, a.gap_md, a.px_lg]}>
                <View style={[a.align_center, {width: 42}]}>
                  <Avatar author={chapter.author} />
                  {partIndex < chapter.parts.length - 1 && (
                    <View
                      style={[
                        a.flex_1,
                        a.mt_xs,
                        {width: 2, backgroundColor: t.palette.primary_100},
                      ]}
                    />
                  )}
                </View>
                <View style={[a.flex_1, a.pb_lg, {minWidth: 0}]}>
                  <Text style={[a.font_bold]}>
                    {chapter.author.displayName}{' '}
                    <Text style={[a.font_normal, t.atoms.text_contrast_medium]}>
                      @{chapter.author.handle}
                    </Text>
                  </Text>
                  <Text
                    style={[
                      a.text_xs,
                      a.font_bold,
                      a.mt_2xs,
                      {color: t.palette.primary_500},
                    ]}>
                    Part {partIndex + 1}/{chapter.parts.length}
                  </Text>
                  <Text style={[a.text_md, a.mt_xs, {lineHeight: 24}]}>
                    {part.text}
                  </Text>
                  {chapter.commentsPerPart && (
                    <PostActions
                      replies={part.replies}
                      likes={part.likes}
                      saved={part.saved}
                      quote
                      onLike={() =>
                        writeRepository.togglePartLike(chapter.id, part.index)
                      }
                      onSave={() =>
                        writeRepository.togglePartSave(chapter.id, part.index)
                      }
                      onReply={() =>
                        Toast.show('Quotes stay attached to this part.')
                      }
                    />
                  )}
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={[a.px_lg, a.gap_md, a.pb_lg]}>
            {chapter.parts.map(part => (
              <Text key={part.id} style={[a.text_md, {lineHeight: 26}]}>
                {part.text}
              </Text>
            ))}
          </View>
        )}
        <Comments chapter={chapter} />
        <View
          style={[
            a.flex_row,
            a.align_center,
            a.justify_between,
            a.mx_lg,
            a.mb_xl,
            a.p_md,
            a.rounded_md,
            a.border,
            t.atoms.border_contrast_low,
          ]}>
          {prev ? (
            <Link
              to={`/books/read/${prev.id}`}
              label={`Chapter ${prev.number}`}>
              <View
                style={[
                  a.rounded_full,
                  a.px_md,
                  a.py_sm,
                  t.atoms.bg_contrast_50,
                ]}>
                <Text style={[a.font_bold]}>← Ch. {prev.number}</Text>
              </View>
            </Link>
          ) : (
            <View />
          )}
          <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
            End of chapter {chapter.number}
          </Text>
          {next ? (
            <Link
              to={`/books/read/${next.id}`}
              label={`Chapter ${next.number}`}>
              <View
                style={[
                  a.rounded_full,
                  a.px_md,
                  a.py_sm,
                  {backgroundColor: t.palette.primary_500},
                ]}>
                <Text style={[a.font_bold, {color: 'white'}]}>
                  Ch. {next.number} →
                </Text>
              </View>
            </Link>
          ) : (
            <View />
          )}
        </View>
      </Layout.Content>
    </Layout.Screen>
  )
}

function Comments({chapter}: {chapter: WriteChapter}) {
  const t = useTheme()
  const [text, setText] = useState('')
  const [partIndex, setPartIndex] = useState(0)
  return (
    <View style={[a.px_lg, a.pb_lg, a.gap_md]}>
      {chapter.comments.map(comment => (
        <View key={comment.id} style={[a.flex_row, a.gap_md]}>
          <View
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              backgroundColor: comment.authorColor,
            }}
          />
          <View style={[a.flex_1]}>
            <Text style={[a.font_bold]}>
              {comment.authorName}{' '}
              <Text style={[a.font_normal, t.atoms.text_contrast_medium]}>
                · reply to Part {comment.partIndex + 1}
              </Text>
            </Text>
            <Text style={[a.text_md, a.mt_2xs]}>{comment.text}</Text>
          </View>
        </View>
      ))}
      <View style={[a.gap_sm]}>
        <Text style={[a.text_sm, a.font_bold]}>
          Reply to part {partIndex + 1}
        </Text>
        <View style={[a.flex_row, a.gap_xs, a.flex_wrap]}>
          {chapter.parts.map((part, index) => (
            <Pressable
              key={part.id}
              accessibilityRole="button"
              accessibilityLabel={`Reply to part ${index + 1}`}
              accessibilityHint=""
              onPress={() => setPartIndex(index)}
              style={[
                a.rounded_full,
                a.px_sm,
                a.py_xs,
                index === partIndex
                  ? t.atoms.bg_contrast_900
                  : t.atoms.bg_contrast_50,
              ]}>
              <Text
                style={[
                  a.text_xs,
                  a.font_bold,
                  index === partIndex
                    ? {color: t.palette.contrast_0}
                    : t.atoms.text,
                ]}>
                Part {index + 1}
              </Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Write a reply"
          placeholderTextColor={t.palette.contrast_500}
          accessibilityLabel="Reply"
          accessibilityHint=""
          multiline
          style={[
            a.p_md,
            a.rounded_md,
            a.border,
            a.text_md,
            t.atoms.border_contrast_low,
            t.atoms.text,
            {minHeight: 72},
          ]}
        />
        <Button
          label="Reply"
          color="primary"
          size="small"
          onPress={() => {
            writeRepository.addComment(chapter.id, partIndex, text, {
              ...chapter.author,
              id: 'local-you',
              handle: 'you.example',
              displayName: 'You',
            })
            setText('')
          }}>
          <ButtonText>Reply</ButtonText>
        </Button>
      </View>
    </View>
  )
}

function PieceReader({post}: {post: Exclude<WritePost, {type: 'book'}>}) {
  const t = useTheme()
  const data = useWriteSnapshot()
  const title =
    post.type === 'opinion'
      ? 'Opinion'
      : post.type === 'article'
        ? post.title
        : post.title
  return (
    <Layout.Screen testID="writeReaderScreen" hideCenterBorders>
      <Layout.Content contentContainerStyle={[a.pb_2xl]}>
        <PlaceholderBanner />
        <View style={[a.px_lg, a.py_md, a.gap_md]}>
          <Link to="/books" label="Back to Write">
            <Text style={[a.font_bold, {fontSize: 20}]}>← Write</Text>
          </Link>
          <View style={[a.flex_row, a.gap_md, a.align_center]}>
            <Avatar author={post.author} />
            <View>
              <Text style={[a.font_bold]}>{post.author.displayName}</Text>
              <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
                @{post.author.handle}
              </Text>
            </View>
          </View>
          {post.type === 'article' && (
            <View style={[a.gap_sm]}>
              <View
                style={{
                  height: 160,
                  borderRadius: 14,
                  backgroundColor: t.palette.primary_100,
                }}
              />
              <Text style={[a.font_bold, {fontSize: 24}]}>{post.title}</Text>
              <Text style={[a.text_md, t.atoms.text_contrast_medium]}>
                {post.subtitle}
              </Text>
              <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
                {readingMinutes(post.body)} min read
              </Text>
              <Text style={[a.text_md, {lineHeight: 26}]}>{post.body}</Text>
            </View>
          )}
          {post.type === 'opinion' && (
            <Text style={[a.text_lg, {lineHeight: 28}]}>{post.text}</Text>
          )}
          {post.type === 'recipe' && (
            <View style={[a.gap_md]}>
              <View
                style={{
                  height: 160,
                  borderRadius: 14,
                  backgroundColor: '#FFE3C2',
                }}
              />
              <Text style={[a.font_bold, {fontSize: 24}]}>{title}</Text>
              <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
                Prep {post.prepMinutes} min · Cook {post.cookMinutes} min ·{' '}
                {post.servings} servings · {post.difficulty}
              </Text>
              <Text style={[a.font_bold]}>Ingredients</Text>
              {post.ingredients.map(item => (
                <Text key={item} style={[a.text_md]}>
                  · {item}
                </Text>
              ))}
              <Text style={[a.font_bold]}>Steps</Text>
              {post.steps.map((step, index) => (
                <Text key={step} style={[a.text_md, {lineHeight: 24}]}>
                  {index + 1}. {step}
                </Text>
              ))}
            </View>
          )}
          <PostActions
            replies={post.engagement.replies}
            reposts={post.engagement.reposts}
            likes={post.engagement.likes}
            liked={data.likedPostIds.includes(post.id)}
            reposted={data.repostedPostIds.includes(post.id)}
            saved={data.savedPostIds.includes(post.id)}
            onLike={() => writeRepository.toggleLike(post.id)}
            onRepost={() => writeRepository.toggleRepost(post.id)}
            onSave={() => writeRepository.toggleSave(post.id)}
          />
          <OriginNote post={post} />
        </View>
      </Layout.Content>
    </Layout.Screen>
  )
}

export function OriginNote({
  post,
}: {
  post: {attribution: WritePost['attribution']; author: {handle: string}}
}) {
  const t = useTheme()
  const origin = post.attribution.origin
  const line =
    origin.kind === 'original'
      ? `Origin: original work by @${post.author.handle} (attribution recorded for royalties).`
      : origin.kind === 'translation'
        ? `Origin: translation of ${origin.sourceCredit}. Attribution is recorded. Royalty split is not decided yet.`
        : `Origin: derivative of ${origin.sourceCredit}. Attribution is recorded. Royalty split is not decided yet.`
  return (
    <Text style={[a.text_xs, t.atoms.text_contrast_medium, {lineHeight: 18}]}>
      {line}
    </Text>
  )
}
