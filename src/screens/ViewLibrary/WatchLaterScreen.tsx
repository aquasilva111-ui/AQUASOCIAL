import {View} from 'react-native'
import {useNavigation} from '@react-navigation/native'

import {type NavigationProp} from '#/lib/routes/types'
import {useViewLibrary} from '#/state/view-library'
import {addToQueue, removeFromQueue} from '#/state/view-playback'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {Text} from '#/components/Typography'
import {Empty, LibraryPage, VideoRow} from './shared'

export function ViewWatchLaterScreen() {
  const t = useTheme()
  const navigation = useNavigation<NavigationProp>()
  const lib = useViewLibrary()
  const list = lib.watchLater

  const playAll = () => {
    const [first, ...rest] = list
    if (!first) return
    removeFromQueue(first.uri)
    rest.forEach(addToQueue)
    navigation.navigate('VideoWatch', {name: first.did, rkey: first.rkey})
  }

  return (
    <LibraryPage
      testID="viewWatchLaterScreen"
      title="Assistir mais tarde"
      subtitle={
        list.length
          ? `${list.length} ${list.length === 1 ? 'vídeo' : 'vídeos'}`
          : 'Guarde vídeos para ver depois.'
      }
      actions={
        list.length > 0 && (
          <>
            <Button
              label="Reproduzir tudo"
              size="small"
              color="primary"
              onPress={playAll}>
              <ButtonText>Reproduzir tudo</ButtonText>
            </Button>
            <Button
              label="Esvaziar a lista"
              size="small"
              color="secondary"
              onPress={lib.clearWatchLater}>
              <ButtonText>Esvaziar</ButtonText>
            </Button>
          </>
        )
      }>
      {!list.length ? (
        <Empty
          title="Nada para assistir depois"
          body='Na página de um vídeo, use "Mais tarde" para guardá-lo aqui.'
        />
      ) : (
        <View>
          {list.map((v, i) => (
            <VideoRow
              key={v.uri}
              video={v}
              actions={
                <>
                  <Button
                    label={`Mover para cima: ${v.title}`}
                    size="tiny"
                    variant="ghost"
                    color="secondary"
                    disabled={i === 0}
                    onPress={() => lib.moveWatchLater(i, i - 1)}>
                    <ButtonText>↑</ButtonText>
                  </Button>
                  <Button
                    label={`Mover para baixo: ${v.title}`}
                    size="tiny"
                    variant="ghost"
                    color="secondary"
                    disabled={i === list.length - 1}
                    onPress={() => lib.moveWatchLater(i, i + 1)}>
                    <ButtonText>↓</ButtonText>
                  </Button>
                  <Button
                    label={`Remover: ${v.title}`}
                    size="small"
                    variant="ghost"
                    color="secondary"
                    onPress={() => lib.removeWatchLater(v.uri)}>
                    <ButtonText>Remover</ButtonText>
                  </Button>
                </>
              }
            />
          ))}
        </View>
      )}
      <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
        Esta lista fica só neste navegador.
      </Text>
    </LibraryPage>
  )
}
