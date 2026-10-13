import {useState} from 'react'
import {Pressable, Text, useWindowDimensions, View} from 'react-native'

import {FORMAT_LABEL, type PortalItem} from '#/lib/adult/portal/model'
import {
  filePortalReport,
  setPortalFormat,
  togglePortalSort,
  toggleRevealed,
  toggleSaved,
  usePortalFeed,
} from '#/state/adult/portal'
import {PortalChrome} from '#/screens/Adult/portal/Chrome'
import {ReportDialog} from '#/screens/Adult/portal/ReportDialog'
import {web} from '#/alf'

const INK = '#2b2f36'
const MUTED = '#8a909c'
const LINE = '#ececef'
const WARN = '#c2410c'

const TABS = [
  {id: 'all' as const, label: 'Tudo', count: '2,4 mil'},
  {id: 'post' as const, label: 'Posts', count: '980'},
  {id: 'video' as const, label: 'Vídeos', count: '412'},
  {id: 'article' as const, label: 'Artigos', count: '156'},
  {id: 'visionboard' as const, label: 'Visionboard', count: '89'},
  {id: 'web' as const, label: 'Web', count: ''},
]

export function HomeView({onOpenWeb}: {onOpenWeb: () => void}) {
  const {state, items} = usePortalFeed()
  const {width} = useWindowDimensions()
  const [reportId, setReportId] = useState<string | null>(null)
  const available = Math.max(280, width - (state.sidebarOpen ? 240 : 0) - 56)
  const cols =
    available >= 1000 ? 4 : available >= 740 ? 3 : available >= 520 ? 2 : 1
  const cardWidth = (available - 18 * (cols - 1)) / cols

  const heading =
    state.lane === 'trending'
      ? 'Em alta'
      : state.lane === 'following'
        ? 'Seguindo'
        : state.lane === 'saved'
          ? 'Salvos'
          : 'Para você'

  return (
    <PortalChrome
      section="explore"
      overlay={
        reportId ? (
          <ReportDialog
            title="Denunciar conteúdo"
            onClose={() => setReportId(null)}
            onSubmit={reason => filePortalReport(reportId, reason)}
          />
        ) : null
      }>
      <View
        style={{
          paddingHorizontal: 28,
          paddingTop: 24,
          maxWidth: 1200,
          width: '100%',
          alignSelf: 'center',
        }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            marginBottom: 16,
            gap: 12,
          }}>
          <View style={{flex: 1}}>
            <Text
              style={{
                fontSize: 24,
                fontWeight: '800',
                color: INK,
                letterSpacing: -0.3,
              }}>
              {heading}
            </Text>
            <Text style={{color: MUTED, marginTop: 4}}>
              Seleção de criadores que você segue e conteúdos em alta hoje.
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={togglePortalSort}
            style={[
              {
                borderWidth: 1,
                borderColor: LINE,
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 6,
              },
              web({cursor: 'pointer'}),
            ]}>
            <Text style={{color: '#4b5563', fontSize: 13}}>
              Ordenar: {state.sort === 'relevance' ? 'Relevância' : 'Recentes'}{' '}
              ▾
            </Text>
          </Pressable>
        </View>
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 6,
            marginBottom: 20,
          }}>
          {TABS.map(tab => {
            const on = state.format === tab.id && state.lane === 'foryou'
            return (
              <Pressable
                key={tab.id}
                accessibilityRole="button"
                accessibilityState={{selected: on}}
                onPress={() => {
                  if (tab.id === 'web') onOpenWeb()
                  else setPortalFormat(tab.id)
                }}
                style={[
                  {
                    paddingHorizontal: 14,
                    paddingVertical: 7,
                    borderRadius: 999,
                    backgroundColor: on ? INK : '#f7f7f8',
                  },
                  web({cursor: 'pointer'}),
                ]}>
                <Text
                  style={{
                    fontWeight: '500',
                    fontSize: 13,
                    color: on ? '#fff' : '#4b5563',
                  }}>
                  {tab.label}
                  {tab.count ? (
                    <Text
                      style={{color: on ? '#ffffffaa' : MUTED, fontSize: 12}}>
                      {' '}
                      {tab.count}
                    </Text>
                  ) : null}
                </Text>
              </Pressable>
            )
          })}
        </View>
        {items.length === 0 ? (
          <Text
            style={{color: MUTED, paddingVertical: 32, textAlign: 'center'}}>
            Nada por aqui com esses filtros.
          </Text>
        ) : (
          <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 18}}>
            {items.map(item => (
              <View key={item.id} style={{width: cardWidth}}>
                <PortalCard
                  item={item}
                  blurred={
                    state.prefs.blurThumbnails && !state.revealed[item.id]
                  }
                  saved={!!state.saved[item.id]}
                  onReveal={() => toggleRevealed(item.id)}
                  onSave={() => toggleSaved(item.id)}
                  onReport={() => setReportId(item.id)}
                />
              </View>
            ))}
          </View>
        )}
      </View>
    </PortalChrome>
  )
}

function PortalCard({
  item,
  blurred,
  saved,
  onReveal,
  onSave,
  onReport,
}: {
  item: PortalItem
  blurred: boolean
  saved: boolean
  onReveal: () => void
  onSave: () => void
  onReport: () => void
}) {
  const initial = item.handle.replace('@', '').charAt(0).toUpperCase()
  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: LINE,
        borderRadius: 16,
        overflow: 'hidden',
      }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          blurred ? 'Toque para revelar' : 'Ocultar pré-visualização'
        }
        accessibilityHint=""
        onPress={onReveal}
        style={{
          height: 148,
          backgroundColor: '#eceef1',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <View
          style={{
            position: 'absolute',
            top: 10,
            left: 10,
            backgroundColor: '#fffffff0',
            borderRadius: 6,
            paddingHorizontal: 8,
            paddingVertical: 3,
            zIndex: 2,
          }}>
          <Text style={{fontSize: 11, fontWeight: '600', color: '#4b5563'}}>
            {FORMAT_LABEL[item.format]}
          </Text>
        </View>
        {item.duration && (
          <View
            style={{
              position: 'absolute',
              bottom: 10,
              right: 10,
              backgroundColor: '#2b2f36cc',
              borderRadius: 5,
              paddingHorizontal: 6,
              paddingVertical: 2,
              zIndex: 2,
            }}>
            <Text style={{color: '#fff', fontSize: 11}}>{item.duration}</Text>
          </View>
        )}
        {blurred && (
          <View
            style={[
              {
                position: 'absolute',
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
                backgroundColor: 'rgba(243,244,246,0.72)',
                zIndex: 1,
              },
              web({backdropFilter: 'blur(8px)'}),
            ]}
          />
        )}
        <View
          style={{
            zIndex: 2,
            backgroundColor: '#fff',
            borderRadius: 999,
            paddingHorizontal: 12,
            paddingVertical: 6,
          }}>
          <Text style={{fontSize: 12, fontWeight: '500', color: '#4b5563'}}>
            {blurred ? '👁  Toque para revelar' : 'Pré-visualização'}
          </Text>
        </View>
      </Pressable>
      <View style={{paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12}}>
        <Text
          style={{
            fontSize: 14,
            fontWeight: '700',
            color: INK,
            lineHeight: 19,
            marginBottom: 8,
          }}>
          {item.title}
        </Text>
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
          <View
            style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              backgroundColor: '#d9dce1',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Text style={{fontSize: 10, fontWeight: '700', color: '#4b5563'}}>
              {initial}
            </Text>
          </View>
          <Text style={{color: MUTED, fontSize: 12}}>
            @{item.handle.replace(/^@/, '')}
          </Text>
        </View>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            marginTop: 10,
            paddingTop: 10,
            borderTopWidth: 1,
            borderTopColor: LINE,
          }}>
          <Text style={{color: MUTED, fontSize: 12}}>♡ {item.likes}</Text>
          <Text style={{color: MUTED, fontSize: 12}}>💬 {item.comments}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={saved ? 'Remover dos salvos' : 'Salvar'}
            accessibilityHint=""
            onPress={onSave}>
            <Text style={{color: saved ? '#E86A00' : MUTED, fontSize: 12}}>
              {saved ? '● salvo' : '🔖'}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Denunciar ${item.title}`}
            accessibilityHint=""
            onPress={onReport}
            style={{marginLeft: 'auto'}}>
            <Text style={{color: WARN, fontWeight: '500', fontSize: 12}}>
              ⚑ Denunciar
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  )
}
