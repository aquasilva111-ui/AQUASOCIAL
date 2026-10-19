import {useMemo, useState} from 'react'
import {Pressable, ScrollView, View} from 'react-native'
import {useNavigation} from '@react-navigation/native'

import {GENRES} from '#/lib/books/model'
import {type NavigationProp} from '#/lib/routes/types'
import {type RankInput, rankWriteFeed} from '#/lib/write/ranking'
import {useWriteSnapshot} from '#/lib/write/store'
import {type WriteTab, type WriteTypeFilter} from '#/lib/write/types'
import {atoms as a, useTheme, web} from '#/alf'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import {Pencil_Stroke2_Corner0_Rounded as Pencil} from '#/components/icons/Pencil'
import * as Layout from '#/components/Layout'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'
import {Chip, PlaceholderBanner} from './ui'
import {WritePostCard} from './WritePostCard'

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
          <View style={[a.px_lg, a.gap_md, {paddingBottom: 120}]}>
            {posts.map(post => (
              <WritePostCard
                key={post.id}
                post={post}
                liked={data.likedPostIds.includes(post.id)}
                reposted={data.repostedPostIds.includes(post.id)}
                saved={data.savedPostIds.includes(post.id)}
                inLibrary={
                  post.type === 'book' && data.library.includes(post.book.id)
                }
              />
            ))}
          </View>
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
