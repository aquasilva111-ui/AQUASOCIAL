import {ScrollView, View} from 'react-native'
import {useQuery} from '@tanstack/react-query'

import {
  adultApi,
  type AdultNetworkComment,
  type AdultNetworkPost,
} from '#/lib/adult/api'
import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
} from '#/lib/routes/types'
import {useAgent} from '#/state/session'
import {atoms as a, useTheme} from '#/alf'
import {
  AdultComposer,
  AdultNetworkPostCard,
  authorName,
  networkKey,
  timeAgo,
} from '#/components/adult/AdultNetwork'
import {AdultReportButton} from '#/components/adult/AdultReportButton'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'
import {AdultShell} from './AdultShell'
import {AdultApiNotice} from './AdultViews'

/** /adult/post/:postId — a post with its comments. */
export function AdultPostScreen({
  route,
}: NativeStackScreenProps<CommonNavigatorParams, 'AdultPost'>) {
  const {postId} = route.params
  const agent = useAgent()
  const t = useTheme()
  const did = agent.session?.did
  const post = useQuery({
    queryKey: networkKey('post', postId, did),
    queryFn: () =>
      adultApi<{post: AdultNetworkPost}>(
        agent,
        `/adult/posts/${encodeURIComponent(postId)}`,
      ),
  })
  const comments = useQuery({
    queryKey: networkKey('comments', 'post', postId, did),
    queryFn: () =>
      adultApi<{comments: AdultNetworkComment[]}>(
        agent,
        `/adult/engage/post/${encodeURIComponent(postId)}/comments`,
      ),
    enabled: !!post.data,
  })
  return (
    <AdultShell title="Post +18" testID="adultPostScreen">
      <ScrollView contentContainerStyle={{paddingBottom: 120}}>
        {post.error ? (
          <AdultApiNotice error={post.error} onRetry={() => post.refetch()} />
        ) : !post.data ? (
          <Text style={[a.p_lg]}>Carregando…</Text>
        ) : (
          <>
            <AdultNetworkPostCard post={post.data.post} detail />
            <AdultComposer
              placeholder="Escreva um comentário"
              submitLabel="Comentar"
              maxLength={1000}
              path={`/adult/engage/post/${encodeURIComponent(postId)}/comments`}
              field="body"
              invalidate={[networkKey('comments', 'post', postId)]}
            />
            {comments.data?.comments.length ? (
              comments.data.comments.map(c => (
                <View
                  key={c.id}
                  style={[
                    a.p_md,
                    a.gap_2xs,
                    a.border_b,
                    t.atoms.border_contrast_low,
                    {maxWidth: 680, width: '100%', alignSelf: 'center'},
                  ]}>
                  <View style={[a.flex_row, a.gap_sm, a.align_center]}>
                    <Link
                      to={`/adult/user/${encodeURIComponent(c.author.did)}`}
                      label={authorName(c.author)}
                      style={[a.flex_1]}>
                      <Text style={[a.text_sm, a.font_bold]} numberOfLines={1}>
                        {authorName(c.author)}
                      </Text>
                    </Link>
                    <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
                      {timeAgo(c.createdAt)}
                    </Text>
                  </View>
                  <Text style={[a.text_md]}>{c.body}</Text>
                  <AdultReportButton
                    targetType="content"
                    resourceType="social_comment"
                    resourceId={c.id}
                  />
                </View>
              ))
            ) : (
              <Text
                style={[a.p_lg, a.text_center, t.atoms.text_contrast_medium]}>
                Nenhum comentário ainda.
              </Text>
            )}
          </>
        )}
      </ScrollView>
    </AdultShell>
  )
}
