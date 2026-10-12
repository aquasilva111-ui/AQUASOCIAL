import {useMemo, useState} from 'react'
import {ScrollView, View} from 'react-native'
import {useNavigation} from '@react-navigation/native'

import {type NavigationProp} from '#/lib/routes/types'
import {firstUnseenIndex, orderGroups} from '#/lib/stories/player'
import {useStorySeenPredicate} from '#/lib/stories-seen'
import {sanitizeDisplayName} from '#/lib/strings/display-names'
import {sanitizeHandle} from '#/lib/strings/handles'
import {type StoryGroup, useStoryTray} from '#/state/queries/story-tray'
import {UserAvatar} from '#/view/com/util/UserAvatar'
import {atoms as a, useTheme} from '#/alf'
import {Button} from '#/components/Button'
import {StoryRing} from '#/components/stories/StoryRing'
import {StoryViewer} from '#/components/stories/StoryViewer'
import {Text} from '#/components/Typography'

const SIZE = 74

/**
 * Home tray: you first, then people you follow with an active story
 * (unseen first). Tapping one plays their stories and then carries on
 * into the next person's.
 */
export function StoriesTray() {
  const {groups: all} = useStoryTray()
  const isSeen = useStorySeenPredicate()
  const navigation = useNavigation<NavigationProp>()
  const [open, setOpen] = useState<{group: number; index: number} | null>(null)

  const mine = all.find(g => g.isMe)
  const ordered = useMemo(
    () =>
      orderGroups(
        all.filter(g => !g.isMe),
        isSeen,
      ),
    [all, isSeen],
  )
  // The viewer plays your stories first when you have any, then the rest.
  const playlist = useMemo<StoryGroup[]>(
    () => [...(mine?.stories.length ? [mine] : []), ...ordered],
    [mine, ordered],
  )

  if (!mine && !ordered.length) return null

  const addStory = () => navigation.navigate('StoryCreate')

  const openGroup = (g: StoryGroup) => {
    const group = playlist.indexOf(g)
    if (group === -1) return
    setOpen({group, index: firstUnseenIndex(g.uris, isSeen)})
  }

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[a.gap_md, a.px_lg, a.py_md]}>
        {mine && (
          <TrayItem
            group={mine}
            label="Seu story"
            seen={mine.uris.map(isSeen)}
            onPress={() => (mine.stories.length ? openGroup(mine) : addStory())}
            hint={
              mine.stories.length ? 'Ver seus stories' : 'Publicar um story'
            }
            showAdd={!mine.stories.length}
          />
        )}
        {ordered.map(g => (
          <TrayItem
            key={g.author.did}
            group={g}
            label={sanitizeDisplayName(
              g.author.displayName || sanitizeHandle(g.author.handle),
            )}
            seen={g.uris.map(isSeen)}
            onPress={() => openGroup(g)}
            hint="Ver stories"
          />
        ))}
      </ScrollView>

      {open && playlist[open.group] && (
        <StoryViewer
          groups={playlist.map(g => ({
            author: g.author,
            stories: g.stories,
            isMe: g.isMe,
          }))}
          initial={open}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  )
}

function TrayItem({
  group,
  label,
  seen,
  hint,
  showAdd,
  onPress,
}: {
  group: StoryGroup
  label: string
  seen: boolean[]
  hint: string
  showAdd?: boolean
  onPress: () => void
}) {
  const t = useTheme()
  const allSeen = seen.length > 0 && seen.every(Boolean)
  return (
    <Button
      label={`${label}. ${hint}`}
      onPress={onPress}
      style={[a.align_center, a.gap_xs, {width: SIZE + 8}]}>
      <View>
        {seen.length ? (
          <StoryRing size={SIZE} seen={seen}>
            <UserAvatar
              size={SIZE - 12}
              avatar={group.author.avatar}
              type="user"
            />
          </StoryRing>
        ) : (
          // No active story: plain avatar (no ring), like Instagram's "+".
          <View
            style={[
              a.align_center,
              a.justify_center,
              {width: SIZE, height: SIZE},
            ]}>
            <UserAvatar
              size={SIZE - 8}
              avatar={group.author.avatar}
              type="user"
            />
          </View>
        )}
        {showAdd && (
          <View
            style={[
              a.absolute,
              a.rounded_full,
              a.align_center,
              a.justify_center,
              {
                right: 0,
                bottom: 0,
                width: 24,
                height: 24,
                backgroundColor: '#7C3AED',
                borderWidth: 2.5,
                borderColor: t.atoms.bg.backgroundColor,
              },
            ]}>
            <Text
              style={[
                a.font_bold,
                {color: '#fff', fontSize: 16, lineHeight: 18},
              ]}>
              +
            </Text>
          </View>
        )}
      </View>
      <Text
        numberOfLines={1}
        style={[
          a.text_xs,
          allSeen ? t.atoms.text_contrast_medium : t.atoms.text,
          {maxWidth: SIZE + 8},
        ]}>
        {label}
      </Text>
    </Button>
  )
}
