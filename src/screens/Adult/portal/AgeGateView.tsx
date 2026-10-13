import {useState} from 'react'
import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native'

import {isAtLeast18} from '#/lib/adult/portal/model'
import {web} from '#/alf'
import {AquaEyeLogo} from '#/components/AquaEyeLogo'
import {Link} from '#/components/Link'

const ORANGE = '#FF7A00'
const ORANGE_DEEP = '#E86A00'
const INK = '#2b2f36'
const TEXT = '#4b5563'
const MUTED = '#8a909c'
const LINE = '#ececef'

/**
 * Self-declared age gate. The date of birth is checked on this device and is
 * not written to the profile. Identity verification stays a placeholder.
 */
export function AgeGateView({
  canEnter,
  blockedMessage,
  onEnter,
  onLeave,
}: {
  canEnter: boolean
  blockedMessage?: string
  onEnter: () => void
  onLeave: () => void
}) {
  const {width} = useWindowDimensions()
  const wide = width >= 960
  const [day, setDay] = useState('')
  const [month, setMonth] = useState('')
  const [year, setYear] = useState('')
  const [checked, setChecked] = useState(true)
  const [attempted, setAttempted] = useState(false)

  const complete = day.length > 0 && month.length > 0 && year.length === 4
  const adult =
    complete && isAtLeast18(Number(day), Number(month), Number(year))
  const ready = canEnter && checked && adult

  const submit = () => {
    setAttempted(true)
    if (ready) onEnter()
  }

  return (
    <ScrollView
      testID="adultAgeGate"
      contentContainerStyle={{flexGrow: 1}}
      keyboardShouldPersistTaps="handled"
      style={{flex: 1, backgroundColor: '#fff'}}>
      <View
        style={{
          flex: 1,
          flexDirection: wide ? 'row' : 'column',
          minHeight: '100%',
        }}>
        <View
          style={[
            {
              flex: 1,
              backgroundColor: '#FFF6EE',
              paddingHorizontal: wide ? 72 : 28,
              paddingVertical: wide ? 64 : 36,
              justifyContent: 'center',
            },
            web({
              backgroundImage: 'linear-gradient(160deg, #FFF6EE, #FFE7D1)',
            }),
          ]}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              marginBottom: 28,
            }}>
            <AquaEyeLogo size={44} />
            <Text style={{fontSize: 24, fontWeight: '800', color: INK}}>
              Aqua
            </Text>
            <View
              style={{
                backgroundColor: ORANGE,
                borderRadius: 6,
                paddingHorizontal: 6,
              }}>
              <Text style={{color: '#fff', fontSize: 11, fontWeight: '700'}}>
                +18
              </Text>
            </View>
          </View>
          <Text
            style={{
              fontSize: wide ? 34 : 28,
              fontWeight: '800',
              color: INK,
              letterSpacing: -0.4,
              marginBottom: 12,
              maxWidth: 520,
            }}>
            Bem-vindo ao seu espaço adulto no Aqua.
          </Text>
          <Text
            style={{
              color: TEXT,
              fontSize: 16,
              maxWidth: 440,
              marginBottom: 28,
              lineHeight: 24,
            }}>
            Posts, vídeos, artigos e visionboards de criadores verificados — com
            você no controle do que vê.
          </Text>
          <Feature
            icon="🔒"
            title="Separado do Aqua principal"
            body="Nada daqui aparece no seu perfil ou feed comum."
          />
          <Feature
            icon="👁"
            title="Desfocado por padrão"
            body="Você decide o que revelar, item por item."
          />
          <Feature
            icon="✓"
            title="Consentimento em primeiro lugar"
            body="Todo conteúdo exige declaração de consentimento."
          />
        </View>
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: 40,
          }}>
          <View style={{width: '100%', maxWidth: 380}}>
            <Text style={{fontSize: 22, fontWeight: '700', color: INK}}>
              Confirme sua idade
            </Text>
            <Text style={{color: MUTED, marginTop: 4}}>
              Este espaço é exclusivo para maiores de 18 anos.
            </Text>
            <Text
              style={{
                fontSize: 12,
                fontWeight: '600',
                color: TEXT,
                marginTop: 14,
                marginBottom: 6,
              }}>
              Data de nascimento
            </Text>
            <View style={{flexDirection: 'row', gap: 8}}>
              <DobInput
                testID="adultDobDay"
                value={day}
                onChange={setDay}
                placeholder="DD"
                maxLength={2}
                flex={0.7}
              />
              <DobInput
                testID="adultDobMonth"
                value={month}
                onChange={setMonth}
                placeholder="MM"
                maxLength={2}
                flex={0.7}
              />
              <DobInput
                testID="adultDobYear"
                value={year}
                onChange={setYear}
                placeholder="AAAA"
                maxLength={4}
                flex={1}
              />
            </View>
            <Text style={{fontSize: 12, color: MUTED, marginTop: 6}}>
              Usamos apenas para confirmar a idade. Não é exibida no seu perfil.
            </Text>
            {attempted && !adult && complete && (
              <Text style={{color: '#c2410c', fontSize: 13, marginTop: 8}}>
                Este espaço é exclusivo para maiores de 18 anos.
              </Text>
            )}
            {attempted && complete && !checked && (
              <Text style={{color: '#c2410c', fontSize: 13, marginTop: 8}}>
                Confirme a declaração para entrar.
              </Text>
            )}
            {blockedMessage ? (
              <Text style={{color: TEXT, marginTop: 12}}>{blockedMessage}</Text>
            ) : null}
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{checked}}
              onPress={() => setChecked(value => !value)}
              style={[
                {
                  flexDirection: 'row',
                  gap: 10,
                  alignItems: 'flex-start',
                  padding: 12,
                  borderWidth: 1,
                  borderColor: LINE,
                  borderRadius: 12,
                  marginTop: 10,
                },
                web({cursor: 'pointer'}),
              ]}>
              <View
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 4,
                  borderWidth: 1,
                  borderColor: checked ? ORANGE : '#d1d5db',
                  backgroundColor: checked ? ORANGE : '#fff',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: 2,
                }}>
                {checked && (
                  <Text
                    style={{color: '#fff', fontSize: 12, fontWeight: '700'}}>
                    ✓
                  </Text>
                )}
              </View>
              <Text
                style={{flex: 1, fontSize: 13, color: TEXT, lineHeight: 18}}>
                Declaro ter 18 anos ou mais e aceito os{' '}
                <Link to="/support/tos" label="Termos do Aqua +18">
                  <Text style={{color: ORANGE_DEEP}}>Termos do Aqua +18</Text>
                </Link>
                .
              </Text>
            </Pressable>
            <Pressable
              testID="adultEnter"
              accessibilityRole="button"
              accessibilityState={{disabled: !ready}}
              onPress={submit}
              style={[
                {
                  backgroundColor: ORANGE,
                  borderRadius: 10,
                  paddingVertical: 12,
                  marginTop: 18,
                  alignItems: 'center',
                  opacity: ready ? 1 : 0.55,
                },
                web({cursor: 'pointer'}),
              ]}>
              <Text style={{color: '#fff', fontWeight: '600'}}>
                Entrar no Aqua +18
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Voltar ao Aqua"
              accessibilityHint=""
              onPress={onLeave}
              style={[
                {
                  borderWidth: 1,
                  borderColor: LINE,
                  borderRadius: 10,
                  paddingVertical: 12,
                  marginTop: 8,
                  alignItems: 'center',
                  backgroundColor: '#fff',
                },
                web({cursor: 'pointer'}),
              ]}>
              <Text style={{color: INK, fontWeight: '600'}}>
                Voltar ao Aqua
              </Text>
            </Pressable>
            <View style={{marginTop: 20, alignItems: 'center'}}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 999,
                  backgroundColor: WASH_BG,
                  borderWidth: 1,
                  borderColor: '#FFD3AD',
                }}>
                <Text
                  style={{color: '#c2410c', fontSize: 12, fontWeight: '500'}}>
                  ⓘ Verificação de identidade em breve
                </Text>
              </View>
            </View>
          </View>
        </View>
      </View>
    </ScrollView>
  )
}

const WASH_BG = '#FFF3E8'

function Feature({
  icon,
  title,
  body,
}: {
  icon: string
  title: string
  body: string
}) {
  return (
    <View
      style={{flexDirection: 'row', gap: 12, marginBottom: 14, maxWidth: 440}}>
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: '#fff',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Text>{icon}</Text>
      </View>
      <View style={{flex: 1}}>
        <Text style={{fontWeight: '700', color: INK}}>{title}</Text>
        <Text style={{color: MUTED, marginTop: 0}}>{body}</Text>
      </View>
    </View>
  )
}

function DobInput({
  testID,
  value,
  onChange,
  placeholder,
  maxLength,
  flex,
}: {
  testID: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  maxLength: number
  flex: number
}) {
  return (
    <TextInput
      testID={testID}
      accessibilityLabel={placeholder}
      accessibilityHint=""
      value={value}
      onChangeText={text =>
        onChange(text.replace(/\D/g, '').slice(0, maxLength))
      }
      placeholder={placeholder}
      placeholderTextColor={MUTED}
      keyboardType="number-pad"
      maxLength={maxLength}
      style={{
        flex,
        borderWidth: 1,
        borderColor: '#dfe1e5',
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        color: INK,
        fontSize: 14,
      }}
    />
  )
}
