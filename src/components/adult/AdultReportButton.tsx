import {useState} from 'react'
import {TextInput, View} from 'react-native'
import {useQuery} from '@tanstack/react-query'

import {adultApi, AdultApiError} from '#/lib/adult/api'
import {adultQueryKey} from '#/lib/adult/isolation'
import {useAgent} from '#/state/session'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {Text} from '#/components/Typography'

export type AdultReportTarget =
  | 'content'
  | 'creator'
  | 'user'
  | 'message'
  | 'live'
  | 'studio'
  | 'production'

type Reason = {code: string; label: string; requiresDetails: boolean}

/**
 * Report flow for the +18 context (FASE 14). Reasons are the server's
 * structured categories for this target; free text is optional context.
 * The reported party never learns who reported.
 */
export function AdultReportButton({
  targetType,
  resourceType,
  resourceId,
}: {
  targetType: AdultReportTarget
  resourceType?: string
  resourceId: string
}) {
  const t = useTheme()
  const agent = useAgent()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<string>()
  const [details, setDetails] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string>()

  const reasons = useQuery({
    queryKey: adultQueryKey('reportReasons', targetType),
    queryFn: () =>
      adultApi<{reasons: Reason[]}>(
        agent,
        `/reports/reasons?targetType=${targetType}`,
      ),
    enabled: open,
    staleTime: 10 * 60_000,
  })
  const chosen = reasons.data?.reasons.find(r => r.code === reason)

  const submit = async () => {
    if (!reason) return
    if (chosen?.requiresDetails && !details.trim())
      return setError('Descreva o problema.')
    setState('sending')
    setError(undefined)
    try {
      await adultApi(agent, '/reports', {
        method: 'POST',
        body: {
          targetType,
          resourceType,
          resourceId,
          reasonCode: reason,
          details: details.trim() || undefined,
        },
      })
      setState('sent')
    } catch (e) {
      setState('idle')
      setError(
        e instanceof AdultApiError && e.code === 'already_reported'
          ? 'Você já denunciou isto recentemente.'
          : e instanceof AdultApiError && e.code === 'rate_limited'
            ? 'Muitas denúncias em pouco tempo. Tente mais tarde.'
            : 'Não foi possível enviar a denúncia.',
      )
    }
  }

  if (state === 'sent')
    return (
      <Text
        accessibilityLiveRegion="polite"
        style={[a.text_sm, t.atoms.text_contrast_medium]}>
        Denúncia enviada. Obrigado — a equipe de moderação vai analisar.
      </Text>
    )

  return (
    <View style={[a.gap_sm]}>
      <Button
        label="Denunciar"
        size="small"
        variant="ghost"
        color="secondary"
        accessibilityState={{expanded: open}}
        onPress={() => setOpen(v => !v)}>
        <ButtonText>Denunciar</ButtonText>
      </Button>
      {open && (
        <View
          style={[
            a.p_md,
            a.gap_sm,
            a.rounded_md,
            a.border,
            t.atoms.border_contrast_low,
          ]}>
          <Text style={[a.text_sm, a.font_bold]}>Qual é o problema?</Text>
          {reasons.isLoading && (
            <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
              Carregando…
            </Text>
          )}
          {reasons.error && (
            <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
              O servidor do AQUA +18 está indisponível no momento.
            </Text>
          )}
          <View
            accessibilityRole="radiogroup"
            style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
            {reasons.data?.reasons.map(r => (
              <Button
                key={r.code}
                label={r.label}
                size="small"
                variant="solid"
                color={reason === r.code ? 'primary' : 'secondary'}
                accessibilityRole="radio"
                accessibilityState={{checked: reason === r.code}}
                onPress={() => setReason(r.code)}>
                <ButtonText>{r.label}</ButtonText>
              </Button>
            ))}
          </View>
          {!!reason && (
            <TextInput
              value={details}
              onChangeText={setDetails}
              maxLength={1000}
              multiline
              placeholder={
                chosen?.requiresDetails
                  ? 'Descreva o problema'
                  : 'Contexto adicional (opcional)'
              }
              accessibilityLabel="Detalhes da denúncia"
              accessibilityHint=""
              style={[
                a.border,
                a.rounded_sm,
                a.p_sm,
                t.atoms.text,
                t.atoms.border_contrast_low,
                {minHeight: 72},
              ]}
            />
          )}
          {error && (
            <Text style={[a.text_sm, {color: '#c2570c'}]}>{error}</Text>
          )}
          <Button
            label="Enviar denúncia"
            size="small"
            color="primary"
            disabled={!reason || state === 'sending'}
            onPress={submit}>
            <ButtonText>
              {state === 'sending' ? 'Enviando…' : 'Enviar denúncia'}
            </ButtonText>
          </Button>
        </View>
      )}
    </View>
  )
}
