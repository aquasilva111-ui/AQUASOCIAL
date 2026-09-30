import {useMemo} from 'react'
import {ScrollView, View} from 'react-native'

import {compactCount, sumStat} from '#/lib/view-library/model'
import {splitTitle} from '#/lib/view-watch/chapters'
import {useSession} from '#/state/session'
import {useChannelData} from '#/screens/ViewChannel/useChannelData'
import {toVideoRef} from '#/screens/ViewWatch/UpNext'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'
import {Empty, LibraryPage, Thumb, watchPath} from './shared'

const COLS = {date: 110, num: 96}

function Stat({value, label}: {value: string; label: string}) {
  const t = useTheme()
  return (
    <View>
      <Text style={[a.text_2xl, a.font_bold]}>{value}</Text>
      <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>{label}</Text>
    </View>
  )
}

export function ViewMyVideosScreen() {
  const t = useTheme()
  const {currentAccount} = useSession()
  const data = useChannelData(currentAccount?.did)
  const items = useMemo(() => [...data.videos, ...data.drops], [data])
  const rows = useMemo(
    () =>
      items
        .map(i => i.post)
        .sort((x, y) => y.indexedAt.localeCompare(x.indexedAt)),
    [items],
  )
  const likes = sumStat(rows.map(p => ({count: p.likeCount})))
  const replies = sumStat(rows.map(p => ({count: p.replyCount})))
  const reposts = sumStat(rows.map(p => ({count: p.repostCount})))

  const head = [t.atoms.text_contrast_medium, a.text_sm, a.font_bold] as const

  return (
    <LibraryPage
      testID="viewMyVideosScreen"
      title="Meus vídeos"
      subtitle="Os vídeos que você publicou no seu canal."
      actions={
        <>
          <Link to="/views/studio" label="Abrir o View Studio">
            <Text style={[a.text_sm, a.font_bold, t.atoms.text_contrast_high]}>
              View Studio
            </Text>
          </Link>
          {currentAccount && (
            <Link
              to={`/views/channel/${currentAccount.handle}`}
              label="Ver meu canal">
              <Text
                style={[a.text_sm, a.font_bold, t.atoms.text_contrast_high]}>
                Ver meu canal
              </Text>
            </Link>
          )}
        </>
      }>
      <View style={[a.flex_row, a.flex_wrap, a.gap_2xl]}>
        <Stat value={String(rows.length)} label="vídeos carregados" />
        <Stat value={compactCount(likes)} label="curtidas" />
        <Stat value={compactCount(replies)} label="comentários" />
        <Stat value={compactCount(reposts)} label="republicações" />
      </View>

      {data.feed.isLoading ? (
        <Text style={[t.atoms.text_contrast_medium]}>Carregando…</Text>
      ) : !rows.length ? (
        <Empty
          title="Você ainda não publicou vídeos"
          body="Use o botão Criar no menu para enviar seu primeiro vídeo."
        />
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View style={{minWidth: 720}}>
            <View
              style={[
                a.flex_row,
                a.align_center,
                a.gap_md,
                a.pb_sm,
                a.border_b,
                t.atoms.border_contrast_low,
              ]}>
              <Text style={[...head, a.flex_1, {minWidth: 280}]}>Vídeo</Text>
              <Text style={[...head, {width: COLS.date}]}>Data</Text>
              <Text style={[...head, {width: COLS.num}]}>Curtidas</Text>
              <Text style={[...head, {width: COLS.num}]}>Comentários</Text>
              <Text style={[...head, {width: COLS.num}]}>Republic.</Text>
            </View>
            {rows.map(post => {
              const video = toVideoRef(post)
              const title =
                splitTitle((post.record as {text?: string}).text ?? '').title ||
                video.title
              return (
                <View
                  key={post.uri}
                  style={[
                    a.flex_row,
                    a.align_center,
                    a.gap_md,
                    a.py_sm,
                    a.border_b,
                    t.atoms.border_contrast_low,
                  ]}>
                  <Link
                    to={watchPath(video)}
                    label={`Abrir ${title}`}
                    style={[a.flex_row, a.gap_md, a.flex_1, {minWidth: 280}]}>
                    <Thumb uri={video.thumbnail} width={120} />
                    <Text
                      style={[a.text_md, a.font_bold, a.flex_1]}
                      numberOfLines={2}>
                      {title}
                    </Text>
                  </Link>
                  <Text style={[a.text_sm, {width: COLS.date}]}>
                    {new Date(post.indexedAt).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </Text>
                  <Text style={[a.text_sm, {width: COLS.num}]}>
                    {post.likeCount ?? 0}
                  </Text>
                  <Text style={[a.text_sm, {width: COLS.num}]}>
                    {post.replyCount ?? 0}
                  </Text>
                  <Text style={[a.text_sm, {width: COLS.num}]}>
                    {post.repostCount ?? 0}
                  </Text>
                </View>
              )
            })}
          </View>
        </ScrollView>
      )}
      {data.feed.hasNextPage && (
        <View style={[a.flex_row]}>
          <Button
            label="Carregar mais vídeos"
            size="small"
            color="secondary"
            disabled={data.feed.isFetchingNextPage}
            onPress={() => data.feed.fetchNextPage()}>
            <ButtonText>Carregar mais</ButtonText>
          </Button>
        </View>
      )}
      <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
        O AQUA ainda não tem contagem global de visualizações; por isso a tabela
        mostra curtidas, comentários e republicações.
      </Text>
    </LibraryPage>
  )
}
