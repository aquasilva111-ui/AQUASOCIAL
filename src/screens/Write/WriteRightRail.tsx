import {Pressable, TextInput, View} from 'react-native'
import {useNavigation, useNavigationState} from '@react-navigation/native'

import {type NavigationProp} from '#/lib/routes/types'
import {useWriteSnapshot, writeRepository} from '#/lib/write/store'
import {atoms as a, useTheme} from '#/alf'
import {Text} from '#/components/Typography'
import {Chip, RailCard} from './ui'
import {OriginNote} from './WriteReaderScreen'

const WRITE_ROUTES = new Set(['Books', 'WriteRead', 'WriteCompose'])

export function isWriteRoute(name: string | undefined) {
  return !!name && WRITE_ROUTES.has(name)
}

/**
 * Replaces the generic right column on Write. The column itself stays put;
 * only its contents change.
 */
export function WriteRightRail({
  routeName,
  chapterId,
}: {
  routeName: string
  chapterId?: string
}) {
  const t = useTheme()
  const data = useWriteSnapshot()
  const navigation = useNavigation<NavigationProp>()
  const idFromState = useNavigationState(state => {
    const route = state.routes[state.index]
    const params = route?.params as {id?: string} | undefined
    return route?.name === 'WriteRead' ? params?.id : undefined
  })
  const resolvedId = chapterId ?? idFromState
  const chapter = data.chapters.find(item => item.id === resolvedId)
  const bookPost = data.posts.find(
    item => item.type === 'book' && chapter && item.book.id === chapter.bookId,
  )
  const bookChapters = chapter
    ? data.chapters
        .filter(item => item.bookId === chapter.bookId)
        .slice()
        .sort((left, right) => left.number - right.number)
    : []

  return (
    <View style={[a.gap_lg, {width: '100%'}]}>
      {routeName !== 'WriteRead' && (
        <TextInput
          value={data.controls.query}
          onChangeText={query => writeRepository.setControls({query})}
          placeholder="Search Write"
          placeholderTextColor={t.palette.contrast_500}
          accessibilityLabel="Search Write"
          accessibilityHint=""
          style={[
            a.rounded_full,
            a.px_lg,
            a.py_md,
            a.text_md,
            t.atoms.bg_contrast_50,
            t.atoms.text,
          ]}
        />
      )}

      {chapter && bookPost?.type === 'book' ? (
        <>
          <RailCard title="Chapters">
            {bookChapters.map(item => {
              const on = item.id === chapter.id
              const read = item.number <= bookPost.book.chaptersRead
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Chapter ${item.number} ${item.title}`}
                  accessibilityHint=""
                  onPress={() =>
                    navigation.navigate('WriteRead', {id: item.id})
                  }
                  style={[a.py_xs]}>
                  <Text style={[a.text_sm, on && a.font_bold]}>
                    {on ? '▶ ' : ''}Ch. {item.number} · {item.title}
                  </Text>
                  <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
                    {read ? 'read' : 'unread'}
                  </Text>
                </Pressable>
              )
            })}
          </RailCard>
          <RailCard title="Reading mode">
            <View style={[a.flex_row, a.gap_sm]}>
              <Chip
                testID="readingModeThread"
                label="Thread"
                selected={data.readingMode === 'thread'}
                onPress={() => writeRepository.setReadingMode('thread')}
              />
              <Chip
                testID="readingModePage"
                label="Page"
                selected={data.readingMode === 'page'}
                onPress={() => writeRepository.setReadingMode('page')}
              />
            </View>
            <OriginNote post={bookPost} />
          </RailCard>
        </>
      ) : (
        <>
          <RailCard title="Trending in Write">
            {data.trends.map(trend => (
              <View key={trend.tag} style={[a.py_xs]}>
                <Text style={[a.text_sm, a.font_bold]}>{trend.tag}</Text>
                <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
                  {trend.detail}
                </Text>
              </View>
            ))}
          </RailCard>
          <RailCard title="Your controls">
            <CheckRow
              label="Show Books"
              checked={data.controls.showBooks}
              onPress={() =>
                writeRepository.setControls({
                  showBooks: !data.controls.showBooks,
                })
              }
            />
            <CheckRow
              label="Show Articles"
              checked={data.controls.showArticles}
              onPress={() =>
                writeRepository.setControls({
                  showArticles: !data.controls.showArticles,
                })
              }
            />
            <CheckRow
              label="Hide Fanfic"
              checked={data.controls.hideFanfic}
              onPress={() =>
                writeRepository.setControls({
                  hideFanfic: !data.controls.hideFanfic,
                })
              }
            />
            <CheckRow
              label="Chronological option"
              checked={data.controls.chronological}
              onPress={() =>
                writeRepository.setControls({
                  chronological: !data.controls.chronological,
                })
              }
            />
            <Text style={[a.text_xs, t.atoms.text_contrast_medium, a.mt_xs]}>
              Explicit controls always override ranking.
            </Text>
          </RailCard>
        </>
      )}
    </View>
  )
}

function CheckRow({
  label,
  checked,
  onPress,
}: {
  label: string
  checked: boolean
  onPress: () => void
}) {
  const t = useTheme()
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityHint=""
      accessibilityState={{checked}}
      onPress={onPress}
      style={[a.flex_row, a.align_center, a.gap_sm, a.py_xs]}>
      <View
        style={[
          a.align_center,
          a.justify_center,
          a.rounded_xs,
          {
            width: 18,
            height: 18,
            borderWidth: 1.5,
            borderColor: checked
              ? t.palette.primary_500
              : t.palette.contrast_400,
            backgroundColor: checked ? t.palette.primary_500 : 'transparent',
          },
        ]}>
        {checked && (
          <Text style={[{color: 'white', fontSize: 12, lineHeight: 14}]}>
            ✓
          </Text>
        )}
      </View>
      <Text style={[a.text_sm]}>{label}</Text>
    </Pressable>
  )
}
