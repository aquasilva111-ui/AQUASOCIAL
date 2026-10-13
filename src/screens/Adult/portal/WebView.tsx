import {useState} from 'react'
import {Linking, Pressable, Text, TextInput, View} from 'react-native'

import {
  selectWebResults,
  WEB_INDEX_SIZE,
  WEB_SEED,
} from '#/lib/adult/portal/model'
import {filePortalReport, usePortalState} from '#/state/adult/portal'
import {PortalChrome} from '#/screens/Adult/portal/Chrome'
import {ReportDialog} from '#/screens/Adult/portal/ReportDialog'
import {web} from '#/alf'

const INK = '#2b2f36'
const MUTED = '#8a909c'
const LINE = '#ececef'
const ORANGE = '#FF7A00'
const ORANGE_DEEP = '#E86A00'
const WARN = '#c2410c'

const CATEGORIES = ['Todos', 'Fotografia', 'Literatura', 'Portfólios', 'Saúde']

export function WebView() {
  const prefs = usePortalState().prefs
  const [draft, setDraft] = useState('fotografia artística')
  const [query, setQuery] = useState('fotografia artística')
  const [category, setCategory] = useState('Todos')
  const [reportId, setReportId] = useState<string | null>(null)
  const [leaving, setLeaving] = useState<{url: string; title: string} | null>(
    null,
  )
  const results = selectWebResults(WEB_SEED, query, category)
  const showingSample = query === 'fotografia artística' && category === 'Todos'
  const countLabel = showingSample
    ? '1.284 resultados'
    : `${results.length.toLocaleString('pt-BR')} resultados`

  const open = (url: string, title: string) => {
    if (prefs.confirmExternal) setLeaving({url, title})
    else Linking.openURL(url).catch(() => {})
  }

  return (
    <PortalChrome
      section="web"
      overlay={
        <>
          {reportId && (
            <ReportDialog
              title="Denunciar página"
              onClose={() => setReportId(null)}
              onSubmit={reason => filePortalReport(reportId, reason)}
            />
          )}
          {leaving && (
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
                <Text style={{fontSize: 18, fontWeight: '700', color: INK}}>
                  Abrir site externo?
                </Text>
                <Text style={{color: MUTED, marginTop: 8}}>
                  {leaving.title} abre fora do Aqua. O Aqua não hospeda esse
                  conteúdo.
                </Text>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'flex-end',
                    gap: 8,
                    marginTop: 16,
                  }}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setLeaving(null)}
                    style={{padding: 8}}>
                    <Text style={{fontWeight: '600', color: '#4b5563'}}>
                      Cancelar
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      const url = leaving.url
                      setLeaving(null)
                      Linking.openURL(url).catch(() => {})
                    }}
                    style={{
                      backgroundColor: ORANGE,
                      borderRadius: 10,
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                    }}>
                    <Text style={{color: '#fff', fontWeight: '600'}}>
                      Continuar
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}
        </>
      }>
      <View
        style={{
          paddingHorizontal: 28,
          paddingTop: 16,
          maxWidth: 1100,
          width: '100%',
          alignSelf: 'center',
        }}>
        <Text style={{fontSize: 24, fontWeight: '800', color: INK}}>Web</Text>
        <Text style={{color: MUTED, marginTop: 4, marginBottom: 10}}>
          Páginas externas indexadas. O Aqua não hospeda esses conteúdos.
        </Text>
        <View style={{flexDirection: 'row', gap: 10, marginBottom: 10}}>
          <View
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              height: 44,
              borderWidth: 1,
              borderColor: '#dfe1e5',
              borderRadius: 12,
              paddingHorizontal: 14,
              backgroundColor: '#fff',
            }}>
            <Text style={{color: MUTED}}>⌕</Text>
            <TextInput
              accessibilityLabel="Buscar na web indexada"
              accessibilityHint=""
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={() => setQuery(draft)}
              placeholder="Buscar páginas indexadas"
              placeholderTextColor={MUTED}
              style={{flex: 1, color: INK, fontSize: 14, padding: 0}}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => setQuery(draft)}
            style={[
              {
                backgroundColor: ORANGE,
                borderRadius: 10,
                paddingHorizontal: 18,
                alignItems: 'center',
                justifyContent: 'center',
              },
              web({cursor: 'pointer'}),
            ]}>
            <Text style={{color: '#fff', fontWeight: '600'}}>Buscar</Text>
          </Pressable>
        </View>
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            marginBottom: 6,
          }}>
          {CATEGORIES.map(item => {
            const on = category === item
            return (
              <Pressable
                key={item}
                accessibilityRole="button"
                accessibilityState={{selected: on}}
                onPress={() => setCategory(item)}
                style={[
                  {
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: on ? '#FFD3AD' : LINE,
                    backgroundColor: on ? '#FFF3E8' : '#fff',
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
                  {item}
                </Text>
              </Pressable>
            )
          })}
          <Text style={{marginLeft: 'auto', color: MUTED, marginBottom: 8}}>
            {countLabel}
            {showingSample ? '' : ''}
          </Text>
        </View>
        {showingSample && (
          <Text style={{color: MUTED, fontSize: 12, marginBottom: 8}}>
            Amostra curada de {WEB_INDEX_SIZE.toLocaleString('pt-BR')} páginas.
            O Aqua não rastreia a web.
          </Text>
        )}
        <View style={{gap: 10}}>
          {results.map(result => (
            <View
              key={result.id}
              style={{
                flexDirection: 'row',
                borderWidth: 1,
                borderColor: LINE,
                borderRadius: 16,
                overflow: 'hidden',
                backgroundColor: '#fff',
              }}>
              <View
                style={{
                  width: 150,
                  minHeight: 96,
                  backgroundColor: '#eceef1',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <View
                  style={{
                    backgroundColor: '#fff',
                    borderRadius: 999,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                  }}>
                  <Text style={{fontSize: 11, color: '#4b5563'}}>
                    Miniatura
                  </Text>
                </View>
              </View>
              <View
                style={{flex: 1, paddingHorizontal: 16, paddingVertical: 12}}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    marginBottom: 4,
                    gap: 8,
                  }}>
                  <Text style={{color: MUTED, fontSize: 12, flex: 1}}>
                    🌐 {result.domain}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Abre em site externo: ${result.title}`}
                    accessibilityHint=""
                    onPress={() => open(result.url, result.title)}
                    style={[
                      {
                        borderWidth: 1,
                        borderColor: '#FFD3AD',
                        backgroundColor: '#FFF3E8',
                        borderRadius: 999,
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                      },
                      web({cursor: 'pointer'}),
                    ]}>
                    <Text
                      style={{
                        color: '#c2410c',
                        fontSize: 12,
                        fontWeight: '500',
                      }}>
                      ↗ Abre em site externo
                    </Text>
                  </Pressable>
                </View>
                <Text style={{fontWeight: '700', color: INK, marginBottom: 2}}>
                  {result.title}
                </Text>
                <Text style={{color: MUTED, fontSize: 13}}>
                  {result.snippet}
                </Text>
                <View
                  style={{
                    flexDirection: 'row',
                    marginTop: 6,
                    alignItems: 'center',
                  }}>
                  <Text style={{color: MUTED, fontSize: 12}}>
                    {result.indexedLabel}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Denunciar ${result.title}`}
                    accessibilityHint=""
                    onPress={() => setReportId(result.id)}
                    style={{marginLeft: 'auto'}}>
                    <Text
                      style={{color: WARN, fontWeight: '500', fontSize: 12}}>
                      ⚑ Denunciar
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ))}
          {results.length === 0 && (
            <Text
              style={{color: MUTED, textAlign: 'center', paddingVertical: 24}}>
              Nenhuma página indexada com esse filtro.
            </Text>
          )}
        </View>
      </View>
    </PortalChrome>
  )
}
