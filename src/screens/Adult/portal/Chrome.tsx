import {Pressable, ScrollView, Text, TextInput, View} from 'react-native'
import {useNavigation} from '@react-navigation/native'

import {type NavigationProp} from '#/lib/routes/types'
import {useAdultContext} from '#/state/adult/context'
import {
  setPortalFormat,
  setPortalLane,
  setPortalQuery,
  togglePortalSidebar,
  usePortalState,
} from '#/state/adult/portal'
import {useSession} from '#/state/session'
import {web} from '#/alf'
import {AquaEyeLogo} from '#/components/AquaEyeLogo'

const ORANGE = '#FF7A00'
const ORANGE_DEEP = '#E86A00'
const WASH = '#FFF3E8'
const INK = '#2b2f36'
const MUTED = '#8a909c'
const LINE = '#ececef'
const WASH_TEXT = '#4b5563'

function initials(handle?: string) {
  const clean = (handle ?? 'sd').replace(/^@/, '').replace(/[^a-z0-9]/gi, '')
  return (clean.slice(0, 2) || 'sd').toUpperCase()
}

export function PortalChrome({
  section,
  children,
  overlay,
}: {
  section: 'explore' | 'web' | 'settings' | 'publish'
  children: React.ReactNode
  overlay?: React.ReactNode
}) {
  const navigation = useNavigation<NavigationProp>()
  const ctx = useAdultContext()
  const state = usePortalState()
  const {currentAccount} = useSession()

  const leave = () => {
    ctx.exit()
    navigation.navigate('Home')
  }

  const goHome = () => navigation.navigate('AdultHome')

  return (
    <View style={{flex: 1, backgroundColor: '#fff', minHeight: '100%'}}>
      <View
        style={[
          {
            height: 64,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 16,
            paddingHorizontal: 28,
            borderBottomWidth: 1,
            borderBottomColor: LINE,
            backgroundColor: '#fff',
          },
          web({position: 'sticky' as 'relative', top: 0, zIndex: 10}),
        ]}>
        <Pressable
          testID="portalLogo"
          accessibilityRole="button"
          accessibilityLabel={
            state.sidebarOpen
              ? 'Esconder o menu do Aqua +18'
              : 'Mostrar o menu do Aqua +18'
          }
          accessibilityHint=""
          accessibilityState={{expanded: state.sidebarOpen}}
          onPress={togglePortalSidebar}
          style={[
            {flexDirection: 'row', alignItems: 'center', gap: 8},
            web({cursor: 'pointer'}),
          ]}>
          <AquaEyeLogo size={32} active={state.sidebarOpen} />
          <Text style={{fontSize: 18, fontWeight: '800', color: INK}}>
            Aqua
          </Text>
          <View
            style={{
              backgroundColor: ORANGE,
              borderRadius: 6,
              paddingHorizontal: 6,
              paddingVertical: 1,
            }}>
            <Text style={{color: '#fff', fontSize: 11, fontWeight: '700'}}>
              +18
            </Text>
          </View>
        </Pressable>
        <View
          style={{
            flex: 1,
            maxWidth: 460,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            backgroundColor: '#f7f7f8',
            borderRadius: 12,
            paddingHorizontal: 14,
            height: 40,
          }}>
          <Text style={{color: MUTED}}>⌕</Text>
          <TextInput
            accessibilityLabel="Buscar no Aqua +18"
            accessibilityHint=""
            value={state.query}
            onChangeText={setPortalQuery}
            placeholder="Buscar criadores, tags, vídeos, artigos..."
            placeholderTextColor={MUTED}
            style={{flex: 1, color: INK, fontSize: 14, padding: 0}}
          />
        </View>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            marginLeft: 'auto',
          }}>
          {(
            [
              ['explore', 'Explorar', 'AdultHome'],
              ['web', 'Web', 'AdultWeb'],
              ['settings', 'Configurações', 'AdultSettings'],
            ] as const
          ).map(([id, label, route]) => {
            const on = section === id
            return (
              <Pressable
                key={id}
                accessibilityRole="button"
                accessibilityState={{selected: on}}
                onPress={() => navigation.navigate(route)}
                style={[
                  {paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10},
                  on && {backgroundColor: WASH},
                  web({cursor: 'pointer'}),
                ]}>
                <Text
                  style={{
                    fontWeight: '500',
                    color: on ? ORANGE_DEEP : WASH_TEXT,
                  }}>
                  {label}
                </Text>
              </Pressable>
            )
          })}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Publicar"
            accessibilityHint=""
            onPress={() => navigation.navigate('AdultPublish')}
            style={[
              {
                backgroundColor: ORANGE,
                borderRadius: 10,
                paddingHorizontal: 14,
                paddingVertical: 7,
                marginLeft: 8,
              },
              web({cursor: 'pointer'}),
            ]}>
            <Text style={{color: '#fff', fontWeight: '600', fontSize: 13}}>
              + Publicar
            </Text>
          </Pressable>
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: ORANGE,
              alignItems: 'center',
              justifyContent: 'center',
              marginLeft: 8,
            }}>
            <Text style={{color: '#fff', fontWeight: '700', fontSize: 13}}>
              {initials(currentAccount?.handle)}
            </Text>
          </View>
        </View>
      </View>
      <View style={{flex: 1, flexDirection: 'row'}}>
        {state.sidebarOpen && (
          <View
            style={{
              width: 240,
              borderRightWidth: 1,
              borderRightColor: LINE,
              backgroundColor: '#fff',
              padding: 12,
            }}>
            <SideLink
              label="Para você"
              icon="⌂"
              on={state.lane === 'foryou' && section === 'explore'}
              onPress={() => {
                setPortalLane('foryou')
                goHome()
              }}
            />
            <SideLink
              label="Em alta"
              icon="↑"
              on={state.lane === 'trending' && section === 'explore'}
              onPress={() => {
                setPortalLane('trending')
                goHome()
              }}
            />
            <SideLink
              label="Seguindo"
              icon="☺"
              on={state.lane === 'following' && section === 'explore'}
              onPress={() => {
                setPortalLane('following')
                goHome()
              }}
            />
            <SideLink
              label="Salvos"
              icon="⚑"
              on={state.lane === 'saved' && section === 'explore'}
              onPress={() => {
                setPortalLane('saved')
                goHome()
              }}
            />
            <Text style={sideHeading}>Formatos</Text>
            <SideLink
              label="Posts"
              onPress={() => {
                setPortalFormat('post')
                goHome()
              }}
            />
            <SideLink
              label="Vídeos"
              onPress={() => {
                setPortalFormat('video')
                goHome()
              }}
            />
            <SideLink
              label="Artigos e Livros"
              onPress={() => {
                setPortalFormat('article')
                goHome()
              }}
            />
            <SideLink
              label="Visionboard"
              onPress={() => {
                setPortalFormat('visionboard')
                goHome()
              }}
            />
            <SideLink
              label="Web"
              onPress={() => navigation.navigate('AdultWeb')}
            />
            <Text style={sideHeading}>Conta</Text>
            <SideLink
              label="Publicar"
              onPress={() => navigation.navigate('AdultPublish')}
            />
            <SideLink
              label="Configurações"
              onPress={() => navigation.navigate('AdultSettings')}
            />
            <SideLink label="Sair do Aqua +18" onPress={leave} />
          </View>
        )}
        <ScrollView
          style={{flex: 1}}
          contentContainerStyle={{paddingBottom: 48}}
          keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </View>
      {overlay}
    </View>
  )
}

const sideHeading = {
  fontSize: 11,
  color: MUTED,
  textTransform: 'uppercase' as const,
  letterSpacing: 0.8,
  marginTop: 16,
  marginBottom: 6,
  marginHorizontal: 12,
}

function SideLink({
  label,
  icon,
  on,
  onPress,
}: {
  label: string
  icon?: string
  on?: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{selected: !!on}}
      onPress={onPress}
      style={[
        {paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10},
        on && {backgroundColor: WASH},
        web({cursor: 'pointer'}),
      ]}>
      <Text style={{fontWeight: '500', color: on ? ORANGE_DEEP : WASH_TEXT}}>
        {icon ? `${icon}  ${label}` : label}
      </Text>
    </Pressable>
  )
}
