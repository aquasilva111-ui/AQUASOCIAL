import {useMemo, useState} from 'react'
import {View} from 'react-native'

import {groupHistory, searchHistory} from '#/lib/view-library/model'
import {useViewLibrary} from '#/state/view-library'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as TextField from '#/components/forms/TextField'
import {Text} from '#/components/Typography'
import {Empty, LibraryPage, VideoRow} from './shared'

function timeOf(at: number) {
  return new Date(at).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function ViewHistoryScreen() {
  const t = useTheme()
  const lib = useViewLibrary()
  const [query, setQuery] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const groups = useMemo(
    () => groupHistory(searchHistory(lib.history, query), Date.now()),
    [lib.history, query],
  )

  return (
    <LibraryPage
      testID="viewHistoryScreen"
      title="Histórico"
      subtitle="Vídeos que você assistiu neste aparelho."
      actions={
        <>
          <Button
            label={lib.historyPaused ? 'Retomar histórico' : 'Pausar histórico'}
            size="small"
            color="secondary"
            onPress={() => lib.setHistoryPaused(!lib.historyPaused)}>
            <ButtonText>
              {lib.historyPaused ? 'Retomar histórico' : 'Pausar histórico'}
            </ButtonText>
          </Button>
          <Button
            label={confirmClear ? 'Confirmar: limpar tudo' : 'Limpar tudo'}
            size="small"
            color={confirmClear ? 'negative' : 'secondary'}
            disabled={!lib.history.length}
            onPress={() => {
              if (!confirmClear) return setConfirmClear(true)
              lib.clearHistory()
              setConfirmClear(false)
            }}>
            <ButtonText>
              {confirmClear ? 'Confirmar: limpar tudo' : 'Limpar tudo'}
            </ButtonText>
          </Button>
        </>
      }>
      {lib.historyPaused && (
        <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
          O histórico está pausado: novos vídeos não são registrados.
        </Text>
      )}
      <View style={{maxWidth: 420}}>
        <TextField.Root>
          <TextField.Input
            label="Buscar no histórico"
            placeholder="Buscar no histórico"
            value={query}
            onChangeText={setQuery}
          />
        </TextField.Root>
      </View>
      {!groups.length ? (
        <Empty
          title={query ? 'Nada encontrado' : 'Seu histórico está vazio'}
          body={
            query
              ? 'Tente outro título ou canal.'
              : 'Os vídeos que você assistir aparecem aqui.'
          }
        />
      ) : (
        groups.map(g => (
          <View key={g.label}>
            <Text style={[a.text_lg, a.font_bold, a.pb_xs]}>{g.label}</Text>
            {g.items.map(e => (
              <VideoRow
                key={e.ref.uri}
                video={e.ref}
                meta={`visto às ${timeOf(e.at)}`}
                actions={
                  <Button
                    label={`Remover do histórico: ${e.ref.title}`}
                    size="small"
                    variant="ghost"
                    color="secondary"
                    onPress={() => lib.removeFromHistory(e.ref.uri)}>
                    <ButtonText>Remover</ButtonText>
                  </Button>
                }
              />
            ))}
          </View>
        ))
      )}
      <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
        O histórico fica só neste navegador e não é enviado à sua conta.
      </Text>
    </LibraryPage>
  )
}
