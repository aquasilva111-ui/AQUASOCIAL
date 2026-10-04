import React from 'react'
import {useNavigation} from '@react-navigation/native'

import {type NavigationProp} from '#/lib/routes/types'
import {type FeedSourceInfo} from '#/state/queries/feed'
import {useSession} from '#/state/session'
import {type RenderTabBarFnProps} from '#/view/com/pager/Pager'
import {useBreakpoints} from '#/alf'
import {
  FeedsDialog,
  useFeedsDialogControl,
} from '#/components/dialogs/FeedsDialog'
import {FeedViewSwitcher} from '#/components/feeds/FeedViewSwitcher'
import {TabBar} from '../pager/TabBar'
import {HomeFeedTabs} from './HomeFeedTabs'
import {HomeHeaderLayout} from './HomeHeaderLayout'

export function HomeHeader(
  props: RenderTabBarFnProps & {
    testID?: string
    onPressSelected: () => void
    feeds: FeedSourceInfo[]
    onHeightChange?: (height: number) => void
  },
) {
  const {feeds, onSelect: onSelectProp} = props
  const {hasSession} = useSession()
  const {gtMobile} = useBreakpoints()
  const navigation = useNavigation<NavigationProp>()
  const feedsDialog = useFeedsDialogControl()

  const hasPinnedCustom = React.useMemo<boolean>(() => {
    if (!hasSession) return false
    return feeds.some(tab => {
      const isFollowing = tab.uri === 'following'
      return !isFollowing
    })
  }, [feeds, hasSession])

  const items = React.useMemo(() => {
    const pinnedNames = feeds.map(f => f.displayName)
    if (!hasPinnedCustom) {
      return pinnedNames.concat('Feeds ✨')
    }
    return pinnedNames
  }, [hasPinnedCustom, feeds])

  const onPressFeedsLink = React.useCallback(() => {
    navigation.navigate('Feeds')
  }, [navigation])

  const onSelect = React.useCallback(
    (index: number) => {
      if (!hasPinnedCustom && index === items.length - 1) {
        onPressFeedsLink()
      } else if (onSelectProp) {
        onSelectProp(index)
      }
    },
    [items.length, onPressFeedsLink, onSelectProp, hasPinnedCustom],
  )

  return (
    <HomeHeaderLayout
      tabBarAnchor={props.tabBarAnchor}
      onHeightChange={props.onHeightChange}>
      {hasSession ? (
        <>
          <HomeFeedTabs
            testID={props.testID}
            items={feeds.map(f => f.displayName)}
            selectedPage={props.selectedPage}
            onSelect={onSelectProp}
            onPressSelected={props.onPressSelected}
            onPressAdd={feedsDialog.open}
          />
          <FeedsDialog control={feedsDialog} />
        </>
      ) : (
        <TabBar
          key={items.join(',')}
          onPressSelected={props.onPressSelected}
          selectedPage={props.selectedPage}
          onSelect={onSelect}
          testID={props.testID}
          items={items}
          dragProgress={props.dragProgress}
          dragState={props.dragState}
          transparent
        />
      )}
      {/*
        On desktop web with a session the mode switcher is an icon in the top
        header row, next to the hashtag (see HomeHeaderLayout.web.tsx).
      */}
      {(!gtMobile || !hasSession) && <FeedViewSwitcher />}
    </HomeHeaderLayout>
  )
}
