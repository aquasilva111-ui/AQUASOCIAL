import {useMemo, useState} from 'react'
import {Pressable, ScrollView, View} from 'react-native'
import {useNavigation} from '@react-navigation/native'

import {GENRES} from '#/lib/books/model'
import {type NavigationProp} from '#/lib/routes/types'
import {type RankInput, rankWriteFeed} from '#/lib/write/ranking'
import {useWriteSnapshot, writeRepository} from '#/lib/write/store'
import {
  type BookPost,
  type WritePost,
  type WriteTab,
  type WriteTypeFilter,
} from '#/lib/write/types'
import {atoms as a, useTheme, web} from '#/alf'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import {Pencil_Stroke2_Corner0_Rounded as Pencil} from '#/components/icons/Pencil'
import * as Layout from '#/components/Layout'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'
import {
  Avatar,
  bookSubtitle,
  Chip,
  formatAge,
  MetaLine,
  PlaceholderBanner,
  PostActions,
  ProgressBar,
} from './ui'

const TABS: {id: WriteTab; label: string}[] = [
  {id: 'following', label: 'Following'},
  {id: 'discover', label: 'Discover'},
  {id: 'continue', label: 'Continue reading'},
]

const TYPES: {id: WriteTypeFilter; label: string}[] = [
  {id: 'all', label: 'All'},
  {id: 'book', label: 'Books'},
  {id: 'article', label: 'Articles'},
  {id: 'opinion', label: 'Opinions'},
  {id: 'recipe', label: 'Recipes'},
]

export function WriteFeedScreen() {
  const t = useTheme()
  const navigation = useNavigation<NavigationProp>()
  const data = useWriteSnapshot()
  const [tab, setTab] = useState<WriteTab>('discover')
  const [type, setType] = useState<WriteTypeFilter>('all')
  const [genre, setGenre] = useState<string>()

  const posts = useMemo(() => {
    const input: RankInput = {
      tab,
      type,
      genre,
      showBooks: data.controls.showBooks,
      showArticles: data.controls.showArticles,
      hideFanfic: data.controls.hideFanfic,
      chronological: data.controls.chronological,
      query: data.controls.query,
    }
    return rankWriteFeed(data.posts, data.events, input)
  }, [data.controls, data.events, data.posts, genre, tab, type])

  return (
    <Layout.Screen testID="writeFeedScreen" hideCenterBorders>
      <Layout.Content>
        <PlaceholderBanner />
        <View style={[a.px_lg, a.pt_sm, a.pb_md, a.gap_sm]}>
          <View style={[a.flex_row, a.align_center, a.justify_between]}>
            <Text style={[a.font_bold, {fontSize: 20}]}>
              Write{' '}
              <Text
                style={[
                  a.font_bold,
                  t.atoms.text_contrast_medium,
                  {fontSize: 13},
                ]}>
                · Escrever
              </Text>
            </Text>
            <Button
              label="Write"
              color="primary"
              size="small"
              onPress={() => navigation.navigate('WriteCompose')}>
              <ButtonIcon icon={Pencil} />
              <ButtonText>Write</ButtonText>
            </Button>
          </View>
          <View style={[a.flex_row, a.border_b, t.atoms.border_contrast_low]}>
            {TABS.map(item => {
              const on = item.id === tab
              return (
                <Pressable
                  key={item.id}
                  testID={`writeTab-${item.id}`}
                  accessibilityRole="tab"
                  accessibilityLabel={item.label}
                  accessibilityHint=""
                  accessibilityState={{selected: on}}
                  onPress={() => setTab(item.id)}
                  style={[a.flex_1, a.align_center, a.py_sm]}>
                  <Text
                    style={[
                      a.font_bold,
                      a.text_sm,
                      on ? t.atoms.text : t.atoms.text_contrast_medium,
                    ]}>
                    {item.label}
                  </Text>
                  <View
                    style={{
                      marginTop: 8,
                      height: 3,
                      width: '70%',
                      borderRadius: 3,
                      backgroundColor: on
                        ? t.palette.primary_500
                        : 'transparent',
                    }}
                  />
                </Pressable>
              )
            })}
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[a.gap_sm]}>
            {TYPES.map(item => (
              <Chip
                key={item.id}
                testID={`writeType-${item.id}`}
                label={item.label}
                selected={item.id === type}
                onPress={() => setType(item.id)}
              />
            ))}
          </ScrollView>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[a.gap_sm]}>
            <Chip
              testID="writeGenre-all"
              label="Todos"
              selected={!genre}
              onPress={() => setGenre(undefined)}
            />
            {GENRES.map(item => (
              <Chip
                key={item.id}
                testID={`writeGenre-${item.id}`}
                label={item.label}
                selected={genre === item.id}
                onPress={() => setGenre(item.id)}
              />
            ))}
          </ScrollView>
        </View>
        {posts.length === 0 ? (
          <View style={[a.px_lg, a.py_xl]}>
            <Text style={[a.text_md, a.font_bold]}>
              Nothing matches these controls
            </Text>
            <Text style={[a.text_sm, a.mt_xs, t.atoms.text_contrast_medium]}>
              Type, genre, and the switches in Your controls always override
              ranking.
            </Text>
          </View>
        ) : (
          posts.map(post => (
            <FeedPost
              key={post.id}
              post={post}
              liked={data.likedPostIds.includes(post.id)}
              reposted={data.repostedPostIds.includes(post.id)}
              saved={data.savedPostIds.includes(post.id)}
              inLibrary={
                post.type === 'book' && data.library.includes(post.book.id)
              }
            />
          ))
        )}
      </Layout.Content>
      <Link
        to="/books/compose"
        label="Write"
        style={[a.fixed, a.z_10, web({right: 40, bottom: 96})]}>
        <View
          style={[
            a.flex_row,
            a.align_center,
            a.gap_sm,
            a.rounded_full,
            a.px_lg,
            a.py_md,
            {backgroundColor: t.palette.primary_500},
            web({boxShadow: '0 6px 20px rgba(0,41,240,0.35)'}),
          ]}>
          <Pencil width={18} style={{color: 'white'}} />
          <Text style={[a.font_bold, {color: 'white'}]}>Write</Text>
        </View>
      </Link>
    </Layout.Screen>
  )
}

function FeedPost({
  post,
  liked,
  reposted,
  saved,
  inLibrary,
}: {
  post: WritePost
  liked: boolean
  reposted: boolean
  saved: boolean
  inLibrary: boolean
}) {
  const t = useTheme()
  return (
    <View
      testID={`writePost-${post.id}`}
      style={[
        a.flex_row,
        a.gap_md,
        a.px_lg,
        a.py_md,
        a.border_b,
        t.atoms.border_contrast_low,
      ]}>
      <Avatar author={post.author} />
      <View style={[a.flex_1, a.gap_xs, {minWidth: 0}]}>
        <MetaLine
          author={post.author}
          age={formatAge(post.createdAt)}
          type={post.type}
        />
        {post.type === 'book' && <BookBody post={post} inLibrary={inLibrary} />}
        {post.type === 'article' && <ArticleBody post={post} />}
        {post.type === 'opinion' && (
          <Text style={[a.text_md, {lineHeight: 22}]}>{post.text}</Text>
        )}
        {post.type === 'recipe' && <RecipeBody post={post} />}
        <PostActions
          replies={post.engagement.replies}
          reposts={post.engagement.reposts}
          likes={post.engagement.likes}
          liked={liked}
          reposted={reposted}
          saved={saved}
          onLike={() => writeRepository.toggleLike(post.id)}
          onRepost={() => writeRepository.toggleRepost(post.id)}
          onSave={() => writeRepository.toggleSave(post.id)}
        />
      </View>
    </View>
  )
}

function BookBody({post, inLibrary}: {post: BookPost; inLibrary: boolean}) {
  const t = useTheme()
  const fresh = post.chapter.number > post.book.chaptersRead
  const pct =
    post.book.chapterCount === 0
      ? 0
      : (post.book.chaptersRead / post.book.chapterCount) * 100
  return (
    <View style={[a.gap_sm]}>
      <Text style={[a.text_md]}>{post.text}</Text>
      <View
        style={[
          a.flex_row,
          a.gap_md,
          a.p_md,
          a.rounded_md,
          a.border,
          t.atoms.border_contrast_low,
          web({borderRadius: 14}),
        ]}>
        <View
          style={[
            a.justify_end,
            a.p_sm,
            {
              width: 92,
              height: 136,
              borderRadius: 8,
              backgroundColor: t.palette.primary_500,
            },
          ]}>
          <Text style={[a.font_bold, {color: 'white', fontSize: 13}]}>
            {post.book.title}
          </Text>
        </View>
        <View style={[a.flex_1, a.gap_xs, {minWidth: 0}]}>
          <Text style={[a.font_bold, {fontSize: 17}]}>{post.book.title}</Text>
          <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
            {bookSubtitle(post)}
          </Text>
          <ProgressBar value={pct} />
          <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
            You read {post.book.chaptersRead} of {post.book.chapterCount} · Ch.{' '}
            {post.chapter.number} “{post.chapter.title}”{fresh ? ' is new' : ''}
          </Text>
          <View
            style={[
              a.flex_row,
              a.align_center,
              a.gap_sm,
              a.flex_wrap,
              a.mt_xs,
            ]}>
            <Link
              to={`/books/read/${post.chapter.id}`}
              label={`Continue reading ${post.book.title}`}
              onPress={() =>
                writeRepository.recordEvent({
                  kind: 'continue_reading',
                  postId: post.id,
                  authorId: post.author.id,
                  bookId: post.book.id,
                })
              }>
              <View
                style={[
                  a.rounded_full,
                  a.px_md,
                  a.py_sm,
                  {backgroundColor: t.palette.primary_500},
                ]}>
                <Text style={[a.font_bold, a.text_sm, {color: 'white'}]}>
                  Continue reading
                </Text>
              </View>
            </Link>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={inLibrary ? 'In library' : 'Add to library'}
              accessibilityHint=""
              onPress={() => writeRepository.toggleLibrary(post.book.id)}
              style={[
                a.rounded_full,
                a.px_md,
                a.py_sm,
                t.atoms.bg_contrast_50,
              ]}>
              <Text style={[a.font_bold, a.text_sm]}>
                {inLibrary ? 'In library' : '+ Library'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  )
}

function ArticleBody({post}: {post: Extract<WritePost, {type: 'article'}>}) {
  const t = useTheme()
  return (
    <Link to={`/books/read/${post.id}`} label={post.title}>
      <View
        style={[
          a.rounded_md,
          a.border,
          a.overflow_hidden,
          t.atoms.border_contrast_low,
          web({borderRadius: 14}),
        ]}>
        <View style={{height: 150, backgroundColor: t.palette.primary_100}} />
        <View style={[a.p_md, a.gap_xs]}>
          <Text style={[a.font_bold, {fontSize: 17}]}>{post.title}</Text>
          <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
            {post.subtitle}
          </Text>
          <View style={[a.flex_row, a.gap_sm, a.mt_xs]}>
            <Pill label={`${post.readMinutes} min read`} />
            {post.tags.map(tag => (
              <Pill
                key={tag}
                label={tag === 'tecnologia' ? 'Tecnologia' : tag}
              />
            ))}
          </View>
        </View>
      </View>
    </Link>
  )
}

function RecipeBody({post}: {post: Extract<WritePost, {type: 'recipe'}>}) {
  const t = useTheme()
  const minutes = post.prepMinutes + post.cookMinutes
  const difficulty =
    post.difficulty === 'easy'
      ? 'Easy'
      : post.difficulty === 'medium'
        ? 'Medium'
        : 'Hard'
  return (
    <Link to={`/books/read/${post.id}`} label={post.title}>
      <View
        style={[
          a.rounded_md,
          a.border,
          a.overflow_hidden,
          t.atoms.border_contrast_low,
          web({borderRadius: 14}),
        ]}>
        <View style={{height: 150, backgroundColor: '#FFE3C2'}} />
        <View style={[a.p_md, a.gap_sm]}>
          <Text style={[a.font_bold, {fontSize: 17}]}>{post.title}</Text>
          <View style={[a.flex_row, a.gap_sm, a.flex_wrap]}>
            <Pill label={`${minutes} min`} />
            <Pill label={`${post.servings} servings`} />
            <Pill label={difficulty} />
          </View>
        </View>
      </View>
    </Link>
  )
}

function Pill({label}: {label: string}) {
  const t = useTheme()
  return (
    <View style={[a.rounded_full, a.px_sm, a.py_xs, t.atoms.bg_contrast_50]}>
      <Text style={[a.text_xs, a.font_bold]}>{label}</Text>
    </View>
  )
}
