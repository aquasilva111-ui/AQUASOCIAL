import {forwardRef, lazy, Suspense} from 'react'
import {Text, View} from 'react-native'
import type ViewShot from 'react-native-view-shot'

const LazyViewShot = lazy(
  // @ts-expect-error dynamic import, same pattern as PlaceholderCanvas
  () => import('react-native-view-shot/src/index'),
)

/**
 * 1080x1920 card (title, excerpt, author) rendered far off-screen so
 * view-shot can turn a book part into a story image. Invisible to the user.
 */
export const StoryPartCard = forwardRef<
  ViewShot,
  {title: string; author: string; excerpt: string}
>(function StoryPartCard({title, author, excerpt}, ref) {
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{position: 'absolute', top: -5000, left: 0}}>
      <Suspense fallback={null}>
        <LazyViewShot
          ref={ref}
          options={{format: 'jpg', quality: 0.9, width: 1080, height: 1920}}>
          <View
            style={{
              width: 1080,
              height: 1920,
              backgroundColor: '#002BEF',
              padding: 96,
              justifyContent: 'center',
              gap: 56,
            }}>
            <Text style={{color: '#ffffffaa', fontSize: 40, fontWeight: '700'}}>
              {title.toUpperCase()}
            </Text>
            <Text style={{color: '#fff', fontSize: 64, lineHeight: 92}}>
              {excerpt}
            </Text>
            <Text style={{color: '#ffffffcc', fontSize: 40}}>
              {author} · AQUA Reads
            </Text>
          </View>
        </LazyViewShot>
      </Suspense>
    </View>
  )
})
