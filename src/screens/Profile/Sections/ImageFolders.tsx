import {useCallback, useImperativeHandle} from 'react'
import {Pressable, StyleSheet, View} from 'react-native'
import {msg, Trans} from '@lingui/macro'
import {useLingui} from '@lingui/react'

import {isNative} from '#/platform/detection'
import {type ListRef} from '#/view/com/util/List'
import {atoms as a, useTheme} from '#/alf'
import {Image_Stroke1_Corner0_Rounded as ImageIcon} from '#/components/icons/Image'
import {PlusLarge_Stroke2_Corner0_Rounded as PlusIcon} from '#/components/icons/Plus'
import {Text} from '#/components/Typography'
import {type SectionRef} from './types'

type ImageFolder = {
  title: string
  count: string
  tone: string
}

const folders: ImageFolder[] = [
  {title: 'All saved', count: '0 pics', tone: '#dbeafe'},
  {title: 'Favorites', count: '0 pics', tone: '#fde68a'},
  {title: 'Inspiration', count: '0 pics', tone: '#bbf7d0'},
  {title: 'Private', count: '0 pics', tone: '#e9d5ff'},
]

export function ProfileImageFoldersSection({
  ref,
  headerHeight,
  scrollElRef,
}: {
  ref?: React.Ref<SectionRef>
  headerHeight: number
  scrollElRef: ListRef
}) {
  const t = useTheme()
  const {_} = useLingui()
  const onScrollToTop = useCallback(() => {
    scrollElRef.current?.scrollToOffset?.({
      animated: isNative,
      offset: -headerHeight,
    })
    if (!isNative) window.scrollTo({top: 0, behavior: 'smooth'})
  }, [headerHeight, scrollElRef])

  useImperativeHandle(ref, () => ({
    scrollToTop: onScrollToTop,
  }))

  return (
    <View
      style={[styles.container, {paddingTop: headerHeight + 16}, t.atoms.bg]}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={[a.text_lg, a.font_bold]}>
            <Trans>Image folders</Trans>
          </Text>
          <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
            <Trans>Organize saved pics into folders.</Trans>
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={_(msg`Create image folder`)}
          accessibilityHint={_(msg`Creates a new folder for saved pics`)}
          style={[styles.createButton, {borderColor: t.palette.contrast_200}]}>
          <PlusIcon width={18} fill={t.palette.primary_500} />
        </Pressable>
      </View>
      <View style={styles.grid}>
        {folders.map(folder => (
          <Pressable
            key={folder.title}
            accessibilityRole="button"
            accessibilityLabel={folder.title}
            accessibilityHint={_(msg`Opens this saved pics folder`)}
            style={[
              styles.folder,
              t.atoms.bg_contrast_25,
              {borderColor: t.palette.contrast_100},
            ]}>
            <View
              style={[styles.folderPreview, {backgroundColor: folder.tone}]}>
              <ImageIcon width={30} fill={t.palette.contrast_700} />
            </View>
            <Text numberOfLines={1} style={[a.text_md, a.font_bold]}>
              {folder.title}
            </Text>
            <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
              {folder.count}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    minHeight: 520,
    paddingHorizontal: 16,
    paddingBottom: 120,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  createButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  folder: {
    width: '48%',
    minWidth: 140,
    borderWidth: 1,
    borderRadius: 15,
    padding: 10,
    gap: 8,
  },
  folderPreview: {
    aspectRatio: 1.2,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
