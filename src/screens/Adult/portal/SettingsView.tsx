import {useState} from 'react'
import {
  Pressable,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native'

import {
  filePortalReport,
  setPortalPrefs,
  toggleCategoryPref,
  toggleFormatPref,
  usePortalState,
} from '#/state/adult/portal'
import {PortalChrome} from '#/screens/Adult/portal/Chrome'
import {ReportDialog} from '#/screens/Adult/portal/ReportDialog'
import {web} from '#/alf'

const INK = '#2b2f36'
const MUTED = '#8a909c'
const LINE = '#ececef'
const ORANGE = '#FF7A00'
const ORANGE_DEEP = '#E86A00'
const WASH = '#FFF3E8'
const WARN = '#c2410c'

const NAV = [
  ['conteudo', 'Conteúdo'],
  ['exibicao', 'Exibição'],
  ['privacidade', 'Privacidade'],
  ['seguranca', 'Segurança e denúncias'],
] as const

export function SettingsView({onLeave}: {onLeave: () => void}) {
  const {width} = useWindowDimensions()
  const wide = width >= 980
  const prefs = usePortalState().prefs
  const [section, setSection] = useState<(typeof NAV)[number][0]>('conteudo')
  const [reporting, setReporting] = useState(false)

  return (
    <PortalChrome
      section="settings"
      overlay={
        reporting ? (
          <ReportDialog
            title="Denunciar conteúdo ou conta"
            onClose={() => setReporting(false)}
            onSubmit={reason => filePortalReport('portal', reason)}
          />
        ) : null
      }>
      <View
        style={{
          paddingHorizontal: 28,
          paddingTop: 24,
          maxWidth: 1100,
          width: '100%',
          alignSelf: 'center',
        }}>
        <Text style={{fontSize: 24, fontWeight: '800', color: INK}}>
          Configurações do Aqua +18
        </Text>
        <Text style={{color: MUTED, marginTop: 4, marginBottom: 16}}>
          Controle o que você vê e como este espaço se relaciona com o Aqua
          principal.
        </Text>
        <View
          style={{
            flexDirection: wide ? 'row' : 'column',
            gap: 16,
            alignItems: 'flex-start',
          }}>
          <View
            style={{
              width: wide ? 200 : '100%',
              borderWidth: 1,
              borderColor: LINE,
              borderRadius: 16,
              padding: 10,
            }}>
            {NAV.map(([id, label]) => {
              const on = section === id
              return (
                <Pressable
                  key={id}
                  accessibilityRole="button"
                  accessibilityState={{selected: on}}
                  onPress={() => setSection(id)}
                  style={[
                    {
                      paddingVertical: 8,
                      paddingHorizontal: 12,
                      borderRadius: 10,
                    },
                    on && {backgroundColor: WASH},
                    web({cursor: 'pointer'}),
                  ]}>
                  <Text
                    style={{
                      fontWeight: '500',
                      color: on ? ORANGE_DEEP : '#4b5563',
                    }}>
                    {label}
                  </Text>
                </Pressable>
              )
            })}
          </View>
          <View
            style={{
              flex: 1,
              gap: 16,
              minWidth: wide ? 280 : undefined,
              width: wide ? undefined : '100%',
            }}>
            <Panel title="Conteúdo" body="Formatos e categorias no seu feed.">
              <Text style={fieldLabel}>Formatos</Text>
              <View style={{flexDirection: 'row', flexWrap: 'wrap'}}>
                <Chip
                  label="Posts"
                  on={prefs.formats.post}
                  onPress={() => toggleFormatPref('post')}
                />
                <Chip
                  label="Vídeos"
                  on={prefs.formats.video}
                  onPress={() => toggleFormatPref('video')}
                />
                <Chip
                  label="Artigos"
                  on={prefs.formats.article}
                  onPress={() => toggleFormatPref('article')}
                />
                <Chip
                  label="Visionboard"
                  on={prefs.formats.visionboard}
                  onPress={() => toggleFormatPref('visionboard')}
                />
                <Chip
                  label="Web"
                  on={prefs.formats.web}
                  onPress={() => toggleFormatPref('web')}
                />
              </View>
              <Text style={fieldLabel}>Categorias</Text>
              <View style={{flexDirection: 'row', flexWrap: 'wrap'}}>
                <Chip
                  label="Artístico"
                  on={prefs.categories.artistico}
                  onPress={() => toggleCategoryPref('artistico')}
                />
                <Chip
                  label="Literatura"
                  on={prefs.categories.literatura}
                  onPress={() => toggleCategoryPref('literatura')}
                />
                <Chip
                  label="Explícito"
                  on={prefs.categories.explicito}
                  onPress={() => toggleCategoryPref('explicito')}
                />
                <Chip
                  label="Fetiche"
                  on={prefs.categories.fetiche}
                  onPress={() => toggleCategoryPref('fetiche')}
                />
              </View>
              <Text style={fieldLabel}>Palavras silenciadas</Text>
              <TextInput
                accessibilityLabel="Palavras silenciadas"
                accessibilityHint=""
                value={prefs.mutedWords}
                onChangeText={mutedWords => setPortalPrefs({mutedWords})}
                placeholder="Ex.: termo1, termo2"
                placeholderTextColor={MUTED}
                style={{
                  borderWidth: 1,
                  borderColor: '#dfe1e5',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  color: INK,
                }}
              />
            </Panel>
            <Panel title="Exibição">
              <ToggleRow
                title="Desfocar miniaturas"
                body="Revele cada item com um toque."
                on={prefs.blurThumbnails}
                onPress={() =>
                  setPortalPrefs({blurThumbnails: !prefs.blurThumbnails})
                }
              />
              <ToggleRow
                title="Reproduzir vídeos automaticamente"
                body="Desativado deixa o feed mais discreto."
                on={prefs.autoplayVideos}
                onPress={() =>
                  setPortalPrefs({autoplayVideos: !prefs.autoplayVideos})
                }
              />
            </Panel>
          </View>
          <View
            style={{
              flex: 1,
              gap: 16,
              minWidth: wide ? 280 : undefined,
              width: wide ? undefined : '100%',
            }}>
            <Panel title="Privacidade">
              <ToggleRow
                title="Ocultar do Aqua principal"
                body="Nada do +18 aparece no seu feed e perfil comuns."
                on={prefs.hideFromMain}
                onPress={() =>
                  setPortalPrefs({hideFromMain: !prefs.hideFromMain})
                }
              />
              <ToggleRow
                title="Confirmar antes de abrir sites externos"
                body="Mostra um aviso ao sair do Aqua."
                on={prefs.confirmExternal}
                onPress={() =>
                  setPortalPrefs({confirmExternal: !prefs.confirmExternal})
                }
              />
            </Panel>
            <Panel title="Segurança e denúncias">
              <Text style={{color: MUTED, marginBottom: 14}}>
                Viu algo sem consentimento ou envolvendo menores? Denuncie —
                nossa equipe analisa com prioridade.
              </Text>
              <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 10}}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setReporting(true)}
                  style={[
                    {
                      borderWidth: 1,
                      borderColor: '#f5c2a8',
                      borderRadius: 10,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                    },
                    web({cursor: 'pointer'}),
                  ]}>
                  <Text style={{color: WARN, fontWeight: '600'}}>
                    ⚑ Denunciar conteúdo ou conta
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Sair do Aqua +18"
                  accessibilityHint=""
                  onPress={onLeave}
                  style={[
                    {
                      borderWidth: 1,
                      borderColor: LINE,
                      borderRadius: 10,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                    },
                    web({cursor: 'pointer'}),
                  ]}>
                  <Text style={{color: INK, fontWeight: '600'}}>
                    Sair do Aqua +18
                  </Text>
                </Pressable>
              </View>
            </Panel>
          </View>
        </View>
      </View>
    </PortalChrome>
  )
}

const fieldLabel = {
  fontSize: 12,
  fontWeight: '600' as const,
  color: '#4b5563',
  marginTop: 12,
  marginBottom: 6,
}

function Panel({
  title,
  body,
  children,
}: {
  title: string
  body?: string
  children: React.ReactNode
}) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: LINE,
        borderRadius: 16,
        padding: 22,
        backgroundColor: '#fff',
      }}>
      <Text
        style={{fontSize: 16, fontWeight: '700', color: INK, marginBottom: 4}}>
        {title}
      </Text>
      {body ? (
        <Text style={{color: MUTED, marginBottom: 10}}>{body}</Text>
      ) : null}
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
      <Text style={{fontSize: 13, color: on ? ORANGE_DEEP : '#4b5563'}}>
        {label}
      </Text>
    </Pressable>
  )
}

function ToggleRow({
  title,
  body,
  on,
  onPress,
}: {
  title: string
  body: string
  on: boolean
  onPress: () => void
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        paddingVertical: 14,
        borderTopWidth: 1,
        borderTopColor: LINE,
      }}>
      <View style={{flex: 1}}>
        <Text style={{fontWeight: '600', color: INK}}>{title}</Text>
        <Text style={{color: MUTED, fontSize: 13}}>{body}</Text>
      </View>
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel={title}
        accessibilityHint=""
        accessibilityState={{checked: on}}
        onPress={onPress}
        style={[
          {
            width: 40,
            height: 22,
            borderRadius: 11,
            backgroundColor: on ? ORANGE : '#d1d5db',
            justifyContent: 'center',
          },
          web({cursor: 'pointer'}),
        ]}>
        <View
          style={{
            width: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor: '#fff',
            marginLeft: on ? 21 : 3,
          }}
        />
      </Pressable>
    </View>
  )
}
