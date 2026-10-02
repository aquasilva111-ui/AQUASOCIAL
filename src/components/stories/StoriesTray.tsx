import {useMemo, useState} from 'react'
import {ScrollView, View} from 'react-native'

import {openPicker} from '#/lib/media/picker.shared'
import {firstUnseenIndex, orderGroups} from '#/lib/stories/player'
import {useStorySeenPredicate} from '#/lib/stories-seen'
import {sanitizeDisplayName} from '#/lib/strings/display-names'
import {sanitizeHandle} from '#/lib/strings/handles'
import {logger} from '#/logger'
import {useCreateStoryMutation} from '#/state/queries/stories'
import {type StoryGroup, useStoryTray} from '#/state/queries/story-tray'
import * as Toast from '#/view/com/util/Toast'
import {UserAvatar} from '#/view/com/util/UserAvatar'
import {atoms as a, useTheme} from '#/alf'
import {Button} from '#/components/Button'
import {StoryRing} from '#/components/stories/StoryRing'
import {StoryViewer} from '#/components/stories/StoryViewer'
import {Text} from '#/components/Typography'

const SIZE = 68

/**
 * Home tray: you first, then people you follow with an active story
 * (unseen first). Tapping one plays their stories and then carries on
 * into the next person's.
 */
export function StoriesTray() {
  const {groups: all} = useStoryTray()
  const isSeen = useStorySeenPredicate()
  const {mutateAsync: createStory} = useCreateStoryMutation()
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

  const addStory = async () => {
    try {
      const [image] = await openPicker({selectionLimit: 1})
      if (!image) return
      await createStory(image)
      Toast.show('Story publicado')
    } catch (e: any) {
      logger.error('Failed to create story', {message: String(e)})
      Toast.show('Não foi possível publicar o story', 'error')
    }
  }

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
  return (
    <Button
      label={`${label}. ${hint}`}
      onPress={onPress}
      style={[a.align_center, a.gap_xs, {width: SIZE + 8}]}>
      <View>
        <StoryRing size={SIZE} seen={seen}>
          <UserAvatar
            size={SIZE - 10}
            avatar={group.author.avatar}
            type="user"
          />
        </StoryRing>
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
                width: 22,
                height: 22,
                backgroundColor: '#7C3AED',
              },
            ]}>
            <Text style={[a.text_sm, a.font_bold, {color: '#fff'}]}>+</Text>
          </View>
        )}
      </View>
      <Text
        numberOfLines={1}
        style={[a.text_xs, t.atoms.text_contrast_medium, {maxWidth: SIZE + 8}]}>
        {label}
      </Text>
    </Button>
  )
}
