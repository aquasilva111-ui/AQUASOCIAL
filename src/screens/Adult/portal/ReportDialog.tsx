import {useState} from 'react'
import {Pressable, Text, View} from 'react-native'

import {web} from '#/alf'

const REASONS = [
  {id: 'non_consensual', label: 'Sem consentimento'},
  {id: 'illegal_content', label: 'Envolve menores ou conteúdo ilegal'},
  {id: 'spam', label: 'Spam'},
  {id: 'other', label: 'Outro'},
]

export function ReportDialog({
  title,
  onClose,
  onSubmit,
}: {
  title: string
  onClose: () => void
  onSubmit: (reason: string) => void
}) {
  const [reason, setReason] = useState(REASONS[0].id)
  const [sent, setSent] = useState(false)

  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        backgroundColor: 'rgba(43,47,54,0.35)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        zIndex: 20,
      }}>
      <View
        style={{
          width: '100%',
          maxWidth: 420,
          backgroundColor: '#fff',
          borderRadius: 16,
          padding: 22,
        }}>
        <Text style={{fontSize: 18, fontWeight: '700', color: '#2b2f36'}}>
          {title}
        </Text>
        <Text style={{color: '#8a909c', marginTop: 6, marginBottom: 14}}>
          Viu algo sem consentimento ou envolvendo menores? A equipe analisa com
          prioridade.
        </Text>
        {sent ? (
          <Text style={{color: '#2b2f36'}}>
            Denúncia enviada. Nossa equipe analisa com prioridade.
          </Text>
        ) : (
          REASONS.map(item => {
            const on = reason === item.id
            return (
              <Pressable
                key={item.id}
                accessibilityRole="radio"
                accessibilityState={{selected: on}}
                onPress={() => setReason(item.id)}
                style={[
                  {
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: on ? '#FFD3AD' : '#ececef',
                    backgroundColor: on ? '#FFF3E8' : '#fff',
                    marginBottom: 8,
                  },
                  web({cursor: 'pointer'}),
                ]}>
                <Text style={{color: on ? '#E86A00' : '#4b5563'}}>
                  {item.label}
                </Text>
              </Pressable>
            )
          })
        )}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'flex-end',
            gap: 8,
            marginTop: 8,
          }}>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={[
              {paddingHorizontal: 14, paddingVertical: 8},
              web({cursor: 'pointer'}),
            ]}>
            <Text style={{color: '#4b5563', fontWeight: '600'}}>
              {sent ? 'Fechar' : 'Cancelar'}
            </Text>
          </Pressable>
          {!sent && (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onSubmit(reason)
                setSent(true)
              }}
              style={[
                {
                  backgroundColor: '#FF7A00',
                  borderRadius: 10,
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                },
                web({cursor: 'pointer'}),
              ]}>
              <Text style={{color: '#fff', fontWeight: '600'}}>
                Enviar denúncia
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  )
}
