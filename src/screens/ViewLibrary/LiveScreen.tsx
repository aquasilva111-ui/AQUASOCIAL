import {View} from 'react-native'

import {liveThumbUrl} from '#/lib/streamplace'
import {useLiveUsersQuery} from '#/state/queries/streamplace'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'
import {Empty, LibraryPage, Thumb} from './shared'

export function ViewLiveScreen() {
  const t = useTheme()
  const {data, isLoading, isError, refetch} = useLiveUsersQuery()
  return (
    <LibraryPage
      testID="viewLiveScreen"
      title="Transmissões ao vivo"
      subtitle="O que está no ar agora."
      actions={
        <Link to="/videos/golive" label="Iniciar transmissão">
          <View
            style={[
              a.rounded_full,
              a.px_lg,
              a.py_sm,
              {backgroundColor: '#D92D20'},
            ]}>
            <Text style={[a.text_sm, a.font_bold, {color: '#FFFFFF'}]}>
              Iniciar transmissão
            </Text>
          </View>
        </Link>
      }>
      {isLoading ? (
        <Text style={[t.atoms.text_contrast_medium]}>Carregando…</Text>
      ) : isError ? (
        <View style={[a.gap_sm, a.align_start]}>
          <Empty
            title="Não foi possível carregar as transmissões"
            body="Verifique sua conexão e tente de novo."
          />
          <Button
            label="Tentar de novo"
            size="small"
            color="secondary"
            onPress={() => refetch()}>
            <ButtonText>Tentar de novo</ButtonText>
          </Button>
        </View>
      ) : !data?.length ? (
        <Empty
          title="Ninguém ao vivo agora"
          body="Quando alguém começar a transmitir, aparece aqui."
        />
      ) : (
        <View style={[a.flex_row, a.flex_wrap, a.gap_lg]}>
          {data.map(s => (
            <Link
              key={s.uri}
              to={`/videos/live/${s.author.handle}`}
              label={`Ao vivo: ${s.record.title || s.author.handle}`}
              style={[a.gap_xs, {width: 260, maxWidth: '100%'}]}>
              <View>
                <Thumb uri={liveThumbUrl(s.author.did)} width={260} />
                <View
                  style={[
                    a.absolute,
                    a.rounded_xs,
                    a.px_xs,
                    {left: 6, top: 6, backgroundColor: '#D92D20'},
                  ]}>
                  <Text style={[a.text_2xs, a.font_bold, {color: '#FFFFFF'}]}>
                    AO VIVO
                  </Text>
                </View>
              </View>
              <Text style={[a.text_md, a.font_bold]} numberOfLines={2}>
                {s.record.title || 'Ao vivo agora'}
              </Text>
              <Text
                style={[a.text_sm, t.atoms.text_contrast_medium]}
                numberOfLines={1}>
                {s.author.displayName || s.author.handle}
                {s.viewerCount?.count
                  ? ` · ${s.viewerCount.count} assistindo`
                  : ''}
              </Text>
            </Link>
          ))}
        </View>
      )}
    </LibraryPage>
  )
}
