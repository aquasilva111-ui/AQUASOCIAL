import {useCallback, useEffect, useImperativeHandle} from 'react'
import {findNodeHandle, useWindowDimensions, View} from 'react-native'

import {isIOS, isNative} from '#/platform/detection'
import {EmptyState} from '#/view/com/util/EmptyState'
import {List, type ListRef} from '#/view/com/util/List'
import {atoms as a, ios} from '#/alf'
import {ListFooter} from '#/components/Lists'
import {type SectionRef} from './types'

const EMPTY_ITEM = {_reactKey: 'profile-placeholder-empty'}

interface ProfilePlaceholderSectionProps {
  ref?: React.Ref<SectionRef>
  scrollElRef: ListRef
  headerHeight: number
  isFocused: boolean
  setScrollViewTag: (tag: number | null) => void
  message: string
  icon: React.ComponentType<any> | React.ReactElement
  testID?: string
}

export function ProfilePlaceholderSection({
  ref,
  scrollElRef,
  headerHeight,
  isFocused,
  setScrollViewTag,
  message,
  icon,
  testID,
}: ProfilePlaceholderSectionProps) {
  const {height} = useWindowDimensions()

  const onScrollToTop = useCallback(() => {
    scrollElRef.current?.scrollToOffset({
      animated: isNative,
      offset: -headerHeight,
    })
  }, [scrollElRef, headerHeight])

  useImperativeHandle(ref, () => ({
    scrollToTop: onScrollToTop,
  }))

  useEffect(() => {
    if (isIOS && isFocused && scrollElRef.current) {
      const nativeTag = findNodeHandle(scrollElRef.current)
      setScrollViewTag(nativeTag)
    }
  }, [isFocused, scrollElRef, setScrollViewTag])

  const renderItem = useCallback(
    () => (
      <View
        style={[
          a.flex_1,
          a.justify_center,
          {minHeight: Math.max(240, height - headerHeight)},
        ]}>
        <EmptyState
          testID={testID ? `${testID}-empty` : undefined}
          icon={icon}
          message={message}
          style={{width: '100%'}}
        />
      </View>
    ),
    [height, headerHeight, icon, message, testID],
  )

  return (
    <View testID={testID}>
      <List
        testID={testID ? `${testID}-flatlist` : undefined}
        ref={scrollElRef}
        data={[EMPTY_ITEM]}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        headerOffset={headerHeight}
        progressViewOffset={ios(0)}
        removeClippedSubviews={true}
        desktopFixedHeight
        contentContainerStyle={{minHeight: height + headerHeight}}
        ListFooterComponent={
          <ListFooter
            height={headerHeight + 180}
            style={a.border_transparent}
          />
        }
      />
    </View>
  )
}

function keyExtractor(item: typeof EMPTY_ITEM) {
  return item._reactKey
}
