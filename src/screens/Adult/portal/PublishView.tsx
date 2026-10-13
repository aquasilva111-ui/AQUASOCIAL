import {useState} from 'react'
import {Pressable, Text, TextInput, View} from 'react-native'

import {hashForDraft, scanBeforePublish} from '#/lib/adult/portal/model'
import {publishPortalDraft, usePortalState} from '#/state/adult/portal'
import {PortalChrome} from '#/screens/Adult/portal/Chrome'
import {web} from '#/alf'

const INK = '#2b2f36'
const MUTED = '#8a909c'
const LINE = '#ececef'
const ORANGE = '#FF7A00'
const ORANGE_DEEP = '#E86A00'
const WASH = '#FFF3E8'

const FORMATS = [
  {id: 'post' as const, label: 'Post'},
  {id: 'video' as const, label: 'Vídeo'},
  {id: 'article' as const, label: 'Artigo/Livro'},
  {id: 'visionboard' as const, label: 'Visionboard'},
]

const STEPS = ['Arquivos', 'Detalhes', 'Consentimento', 'Revisão']

export function PublishView({onDone}: {onDone: () => void}) {
  const verification = usePortalState().prefs.identityVerificationStatus
  const [step, setStep] = useState(1)
  const [files, setFiles] = useState(2)
  const [format, setFormat] = useState<(typeof FORMATS)[number]['id']>('post')
  const [title, setTitle] = useState('Ensaio noturno — parte 2')
  const [tags, setTags] = useState(['artistico', 'ensaio'])
  const [tagDraft, setTagDraft] = useState('')
  const [visibility, setVisibility] = useState<'aqua18' | 'subscribers'>(
    'aqua18',
  )
  const [consent, setConsent] = useState(false)
  const [draftNote, setDraftNote] = useState('')
  const [error, setError] = useState('')

  const verificationLabel =
    verification === 'verified'
      ? 'Verificação de criador: verificada'
      : verification === 'failed'
        ? 'Verificação de criador: falhou'
        : 'Verificação de criador: pendente'

  const addTag = () => {
    const next = tagDraft.trim().toLowerCase()
    if (!next || tags.includes(next) || tags.length >= 10) return
    setTags([...tags, next])
    setTagDraft('')
  }

  const goNext = () => {
    setError('')
    if (step === 0 && files < 1) {
      setError('Envie pelo menos um arquivo.')
      return
    }
    if (step === 2 && !consent) {
      setError('Confirme o consentimento para continuar.')
      return
    }
    setStep(value => Math.min(3, value + 1))
  }

  const publish = () => {
    const scan = scanBeforePublish(hashForDraft(title))
    if (scan === 'quarantine') {
      setError(
        'A checagem de hash reteve esta publicação para moderação. Ela não entrou no feed.',
      )
      return
    }
    const result = publishPortalDraft({
      format,
      title,
      tags,
      visibility,
      consent,
    })
    if (!result.ok) {
      setError(result.reason)
      return
    }
    onDone()
  }

  return (
    <PortalChrome section="publish">
      <View
        style={{
          paddingHorizontal: 28,
          paddingTop: 24,
          maxWidth: 1100,
          width: '100%',
          alignSelf: 'center',
        }}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            gap: 12,
            marginBottom: 16,
          }}>
          <View style={{flex: 1}}>
            <Text style={{fontSize: 24, fontWeight: '800', color: INK}}>
              Nova publicação
            </Text>
            <Text style={{color: MUTED, marginTop: 4}}>
              Leva cerca de 2 minutos. Você pode salvar e continuar depois.
            </Text>
          </View>
          <View
            style={{
              borderWidth: 1,
              borderColor: '#FFD3AD',
              backgroundColor: WASH,
              borderRadius: 999,
              paddingHorizontal: 10,
              paddingVertical: 5,
            }}>
            <Text style={{color: '#c2410c', fontSize: 12, fontWeight: '500'}}>
              ● {verificationLabel}
            </Text>
          </View>
        </View>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            borderWidth: 1,
            borderColor: LINE,
            borderRadius: 16,
            paddingHorizontal: 20,
            paddingVertical: 14,
            marginBottom: 16,
          }}>
          {STEPS.map((label, index) => {
            const state = index < step ? 'done' : index === step ? 'on' : 'idle'
            return (
              <View
                key={label}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  flex: index === STEPS.length - 1 ? 0 : 1,
                  gap: 8,
                }}>
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    backgroundColor:
                      state === 'on'
                        ? ORANGE
                        : state === 'done'
                          ? INK
                          : '#d9dce1',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <Text
                    style={{color: '#fff', fontSize: 10, fontWeight: '700'}}>
                    {state === 'done' ? '✓' : index + 1}
                  </Text>
                </View>
                <Text
                  style={{
                    fontWeight: state === 'on' ? '600' : '500',
                    color: state === 'idle' ? MUTED : INK,
                  }}>
                  {label}
                </Text>
                {index < STEPS.length - 1 && (
                  <View
                    style={{
                      flex: 1,
                      height: 1,
                      backgroundColor: LINE,
                      marginHorizontal: 8,
                    }}
                  />
                )}
              </View>
            )
          })}
        </View>

        {step === 0 && (
          <Panel>
            <Text style={panelTitle}>1 · Arquivos</Text>
            <Text style={{color: MUTED, marginBottom: 12}}>
              As miniaturas ficam desfocadas até a publicação.
            </Text>
            <FileRow
              count={files}
              onAdd={() => setFiles(value => Math.min(4, value + 1))}
            />
          </Panel>
        )}

        {step === 1 && (
          <View style={{flexDirection: 'row', gap: 16, flexWrap: 'wrap'}}>
            <View style={{flex: 1.4, minWidth: 280}}>
              <Panel>
                <Text style={panelTitle}>2 · Detalhes</Text>
                <Text style={{color: MUTED}}>
                  Ajude as pessoas certas a encontrar seu conteúdo.
                </Text>
                <Field label="Formato">
                  <View style={{flexDirection: 'row', flexWrap: 'wrap'}}>
                    {FORMATS.map(item => (
                      <Chip
                        key={item.id}
                        label={item.label}
                        on={format === item.id}
                        onPress={() => setFormat(item.id)}
                      />
                    ))}
                  </View>
                </Field>
                <Field label="Título">
                  <TextInput
                    accessibilityLabel="Título"
                    accessibilityHint=""
                    value={title}
                    onChangeText={setTitle}
                    style={inputStyle}
                  />
                </Field>
                <Field label="Tags">
                  <View
                    style={[
                      inputStyle,
                      {
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: 6,
                      },
                    ]}>
                    {tags.map(tag => (
                      <Pressable
                        key={tag}
                        accessibilityRole="button"
                        accessibilityLabel={`Remover tag ${tag}`}
                        accessibilityHint=""
                        onPress={() =>
                          setTags(tags.filter(item => item !== tag))
                        }>
                        <Text
                          style={{
                            backgroundColor: WASH,
                            color: ORANGE_DEEP,
                            borderRadius: 999,
                            paddingHorizontal: 10,
                            paddingVertical: 4,
                            overflow: 'hidden',
                          }}>
                          {tag} ×
                        </Text>
                      </Pressable>
                    ))}
                    <TextInput
                      accessibilityLabel="Adicionar tag"
                      accessibilityHint=""
                      value={tagDraft}
                      onChangeText={setTagDraft}
                      onSubmitEditing={addTag}
                      placeholder="Adicionar tag..."
                      placeholderTextColor={MUTED}
                      style={{flex: 1, minWidth: 100, color: INK, padding: 0}}
                    />
                  </View>
                  <Text style={{color: MUTED, fontSize: 12, marginTop: 6}}>
                    Até 10 tags. Tags precisas melhoram os filtros de quem vê.
                  </Text>
                </Field>
                <Field label="Visibilidade">
                  <View style={{flexDirection: 'row', flexWrap: 'wrap'}}>
                    <Chip
                      label="Somente Aqua +18"
                      on={visibility === 'aqua18'}
                      onPress={() => setVisibility('aqua18')}
                    />
                    <Chip
                      label="Assinantes"
                      on={visibility === 'subscribers'}
                      onPress={() => setVisibility('subscribers')}
                    />
                  </View>
                </Field>
              </Panel>
            </View>
            <View style={{flex: 1, minWidth: 240, gap: 16}}>
              <Panel>
                <Text style={panelTitle}>Arquivos enviados</Text>
                <FileRow
                  count={files}
                  onAdd={() => setFiles(value => Math.min(4, value + 1))}
                />
              </Panel>
              <View
                style={{
                  backgroundColor: '#f7f7f8',
                  borderRadius: 16,
                  padding: 22,
                }}>
                <Text style={panelTitle}>Próximo: consentimento</Text>
                <Text style={{color: MUTED, marginBottom: 6}}>
                  Na etapa 3 você confirmará:
                </Text>
                <View
                  style={{
                    flexDirection: 'row',
                    gap: 10,
                    backgroundColor: '#fff',
                    borderWidth: 1,
                    borderColor: LINE,
                    borderRadius: 12,
                    padding: 12,
                  }}>
                  <View
                    style={{
                      width: 16,
                      height: 16,
                      borderWidth: 1,
                      borderColor: '#d1d5db',
                      borderRadius: 3,
                      marginTop: 2,
                    }}
                  />
                  <Text style={{flex: 1, color: '#4b5563', fontSize: 13}}>
                    Todas as pessoas mostradas têm 18+ e consentiram com a
                    gravação e a publicação.
                  </Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {step === 2 && (
          <Panel>
            <Text style={panelTitle}>3 · Consentimento</Text>
            <Text style={{color: MUTED, marginBottom: 12}}>
              Sem esta declaração a publicação não segue. A verificação de
              identidade do criador continua pendente.
            </Text>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{checked: consent}}
              onPress={() => setConsent(value => !value)}
              style={[
                {
                  flexDirection: 'row',
                  gap: 10,
                  borderWidth: 1,
                  borderColor: LINE,
                  borderRadius: 12,
                  padding: 12,
                },
                web({cursor: 'pointer'}),
              ]}>
              <View
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 4,
                  borderWidth: 1,
                  borderColor: consent ? ORANGE : '#d1d5db',
                  backgroundColor: consent ? ORANGE : '#fff',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: 2,
                }}>
                {consent && (
                  <Text style={{color: '#fff', fontSize: 12}}>✓</Text>
                )}
              </View>
              <Text
                style={{
                  flex: 1,
                  color: '#4b5563',
                  fontSize: 13,
                  lineHeight: 18,
                }}>
                Todas as pessoas mostradas têm 18+ e consentiram com a gravação
                e a publicação.
              </Text>
            </Pressable>
          </Panel>
        )}

        {step === 3 && (
          <Panel>
            <Text style={panelTitle}>4 · Revisão</Text>
            <Text style={{color: INK, fontWeight: '700', marginTop: 8}}>
              {title}
            </Text>
            <Text style={{color: MUTED, marginTop: 4}}>
              {FORMATS.find(item => item.id === format)?.label} ·{' '}
              {visibility === 'aqua18' ? 'Somente Aqua +18' : 'Assinantes'} ·{' '}
              {files} arquivo(s)
            </Text>
            <Text style={{color: MUTED, marginTop: 4}}>
              Tags: {tags.join(', ') || '—'}
            </Text>
            <Text style={{color: MUTED, marginTop: 8}}>
              Checagem de hash antes de publicar:{' '}
              {scanBeforePublish(hashForDraft(title)) === 'ok'
                ? 'nenhuma correspondência (provedor externo ainda não conectado).'
                : 'correspondência — a publicação será retida.'}
            </Text>
            <Text style={{color: MUTED, marginTop: 4}}>
              Consentimento registrado nesta etapa.
            </Text>
          </Panel>
        )}

        {error ? (
          <Text style={{color: '#c2410c', marginTop: 12}}>{error}</Text>
        ) : null}
        {draftNote ? (
          <Text style={{color: MUTED, marginTop: 8}}>{draftNote}</Text>
        ) : null}

        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'flex-end',
            gap: 10,
            marginTop: 16,
          }}>
          {step > 0 && (
            <Pressable
              accessibilityRole="button"
              onPress={() => setStep(value => value - 1)}
              style={[ghostBtn, web({cursor: 'pointer'})]}>
              <Text style={{fontWeight: '600', color: INK}}>Voltar</Text>
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              setDraftNote('Rascunho salvo neste aparelho. Nada foi publicado.')
            }
            style={[ghostBtn, web({cursor: 'pointer'})]}>
            <Text style={{fontWeight: '600', color: INK}}>Salvar rascunho</Text>
          </Pressable>
          {step < 3 ? (
            <Pressable
              accessibilityRole="button"
              onPress={goNext}
              style={[primaryBtn, web({cursor: 'pointer'})]}>
              <Text style={{color: '#fff', fontWeight: '600'}}>
                Continuar →
              </Text>
            </Pressable>
          ) : (
            <Pressable
              testID="adultPublish"
              accessibilityRole="button"
              onPress={publish}
              style={[primaryBtn, web({cursor: 'pointer'})]}>
              <Text style={{color: '#fff', fontWeight: '600'}}>Publicar</Text>
            </Pressable>
          )}
        </View>
      </View>
    </PortalChrome>
  )
}

const panelTitle = {
  fontSize: 16,
  fontWeight: '700' as const,
  color: INK,
  marginBottom: 4,
}
const inputStyle = {
  borderWidth: 1,
  borderColor: '#dfe1e5',
  borderRadius: 10,
  paddingHorizontal: 12,
  paddingVertical: 10,
  color: INK,
  fontSize: 14,
}
const ghostBtn = {
  borderWidth: 1,
  borderColor: LINE,
  borderRadius: 10,
  paddingHorizontal: 14,
  paddingVertical: 10,
  backgroundColor: '#fff',
}
const primaryBtn = {
  backgroundColor: ORANGE,
  borderRadius: 10,
  paddingHorizontal: 16,
  paddingVertical: 10,
}

function Panel({children}: {children: React.ReactNode}) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: LINE,
        borderRadius: 16,
        padding: 22,
        backgroundColor: '#fff',
      }}>
      {children}
    </View>
  )
}

function Field({label, children}: {label: string; children: React.ReactNode}) {
  return (
    <View style={{marginTop: 14}}>
      <Text
        style={{
          fontSize: 12,
          fontWeight: '600',
          color: '#4b5563',
          marginBottom: 6,
        }}>
        {label}
      </Text>
      {children}
    </View>
  )
}

function Chip({
  label,
  on,
  onPress,
}: {
  label: string
  on: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{selected: on}}
      onPress={onPress}
      style={[
        {
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: on ? '#FFD3AD' : LINE,
          backgroundColor: on ? WASH : '#fff',
          marginRight: 6,
          marginBottom: 8,
        },
        web({cursor: 'pointer'}),
      ]}>
      <Text
        style={{
          fontSize: 13,
          color: on ? ORANGE_DEEP : '#4b5563',
          fontWeight: on ? '500' : '400',
        }}>
        {label}
      </Text>
    </Pressable>
  )
}

function FileRow({count, onAdd}: {count: number; onAdd: () => void}) {
  return (
    <View style={{flexDirection: 'row', gap: 8, marginTop: 10}}>
      {Array.from({length: count}, (_, index) => (
        <View
          key={index}
          style={{
            flex: 1,
            height: 72,
            borderRadius: 10,
            backgroundColor: '#eceef1',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Text style={{fontSize: 12, color: '#4b5563'}}>{index + 1}</Text>
        </View>
      ))}
      {count < 4 && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Adicionar arquivo"
          accessibilityHint=""
          onPress={onAdd}
          style={[
            {
              flex: 1,
              height: 72,
              borderRadius: 10,
              borderWidth: 2,
              borderStyle: 'dashed',
              borderColor: '#dfe1e5',
              alignItems: 'center',
              justifyContent: 'center',
            },
            web({cursor: 'pointer'}),
          ]}>
          <Text style={{color: MUTED, fontSize: 18}}>＋</Text>
        </Pressable>
      )}
    </View>
  )
}
