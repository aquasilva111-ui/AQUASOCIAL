import {useState} from 'react'
import {View} from 'react-native'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'

import {adultApi, type AdultBoard} from '#/lib/adult/api'
import {adultQueryKey} from '#/lib/adult/isolation'
import {useAgent} from '#/state/session'
import {atoms as a, useTheme} from '#/alf'
import {AdultAreaEmpty, AdultAreaNote} from '#/components/adult/AdultAreaParts'
import {Button, ButtonText} from '#/components/Button'
import {Text} from '#/components/Typography'
import {AdultShell} from './AdultShell'
import {AdultApiNotice} from './AdultViews'

/**
 * /adult/visionboard — private image boards. Boards live on the +18 backend,
 * are private by default and never reach the social app. Images are served
 * only to age-verified users and always open blurred. Today only approved
 * creators can add images (they are the only ones who can upload media).
 */
export function AdultVisionboardScreen() {
  const agent = useAgent()
  const t = useTheme()
  const qc = useQueryClient()
  const [count, setCount] = useState(0)
  const key = adultQueryKey('visionboard', 'boards', agent.session?.did)
  const boards = useQuery({
    queryKey: key,
    queryFn: () => adultApi<{boards: AdultBoard[]}>(agent, '/me/adult/boards'),
  })
  const create = useMutation({
    mutationFn: () =>
      adultApi(agent, '/me/adult/boards', {
        method: 'POST',
        body: {name: `Board ${count + 1}`},
      }),
    onSuccess: () => {
      setCount(c => c + 1)
      return qc.invalidateQueries({queryKey: key})
    },
  })
  const toggle = useMutation({
    mutationFn: (b: AdultBoard) =>
      adultApi(agent, `/me/adult/boards/${b.id}`, {
        method: 'PATCH',
        body: {visibility: b.visibility === 'private' ? 'public' : 'private'},
      }),
    onSuccess: () => qc.invalidateQueries({queryKey: key}),
  })
  return (
    <AdultShell title="Visionboard +18" testID="adultVisionboardScreen">
      <View style={[a.p_lg, a.gap_lg]}>
        <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
          Meus boards
        </Text>
        {boards.error ? (
          <AdultApiNotice
            error={boards.error}
            onRetry={() => boards.refetch()}
          />
        ) : boards.isLoading ? (
          <Text style={[a.p_lg]}>Carregando…</Text>
        ) : boards.data?.boards.length ? (
          <View style={[a.gap_sm]}>
            {boards.data.boards.map(b => (
              <View
                key={b.id}
                style={[
                  a.flex_row,
                  a.align_center,
                  a.justify_between,
                  a.p_md,
                  a.rounded_md,
                  t.atoms.bg_contrast_25,
                ]}>
                <View>
                  <Text style={[a.text_md, a.font_bold]}>{b.name}</Text>
                  <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
                    {`${b.itemCount ?? 0} imagens · ${
                      b.visibility === 'private' ? 'Privado' : 'Público +18'
                    }`}
                  </Text>
                </View>
                <Button
                  label="Mudar visibilidade"
                  size="small"
                  variant="ghost"
                  color="secondary"
                  onPress={() => toggle.mutate(b)}>
                  <ButtonText>
                    {b.visibility === 'private' ? 'Tornar público' : 'Privar'}
                  </ButtonText>
                </Button>
              </View>
            ))}
          </View>
        ) : (
          <AdultAreaEmpty
            title="Nenhum board +18 ainda"
            description="Crie um board privado. Ele nunca aparece no app social."
          />
        )}
        <Button
          label="Novo board"
          size="large"
          color="primary"
          onPress={() => create.mutate()}>
          <ButtonText>Novo board</ButtonText>
        </Button>
        <AdultAreaNote text="As imagens abrem borradas e só são reveladas com um toque." />
      </View>
    </AdultShell>
  )
}
