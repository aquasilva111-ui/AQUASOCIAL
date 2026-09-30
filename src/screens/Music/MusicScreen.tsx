import {useCallback, useEffect, useState} from 'react'
import {Pressable, View} from 'react-native'
import {Image} from 'expo-image'

import {type MusicProvider, type MusicTrack, PROVIDER_LIST} from '#/lib/music'
import {IS_WEB} from '#/lib/music/config'
import {
  clearMusicError,
  notifyConnectionsChanged,
  playTrack,
  useMusic,
} from '#/state/music'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as TextField from '#/components/forms/TextField'
import * as Layout from '#/components/Layout'
import {Text} from '#/components/Typography'

export function MusicScreen() {
  const t = useTheme()
  const music = useMusic()
  const [active, setActive] = useState<MusicProvider | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MusicTrack[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  // Spotify sends the person back here with ?code=…
  useEffect(() => {
    if (!IS_WEB) return
    let cancelled = false
    ;(async () => {
      for (const p of PROVIDER_LIST) {
        try {
          if (p.completeRedirect && (await p.completeRedirect())) {
            if (!cancelled) notifyConnectionsChanged()
          }
        } catch {
          if (!cancelled) setMessage(`Não foi possível entrar no ${p.label}.`)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const connected = PROVIDER_LIST.filter(p => p.isConnected())
  const current =
    active && connected.includes(active) ? active : (connected[0] ?? null)

  const [top, setTop] = useState<MusicTrack[]>([])
  useEffect(() => {
    let cancelled = false
    setTop([])
    current?.topTracks?.().then(
      tracks => {
        if (!cancelled) setTop(tracks)
      },
      () => {},
    )
    return () => {
      cancelled = true
    }
  }, [current, music.connectionsVersion])

  const connect = useCallback(async (p: MusicProvider) => {
    setMessage(null)
    try {
      await p.connect()
      notifyConnectionsChanged()
    } catch {
      setMessage(`Não foi possível entrar no ${p.label}.`)
    }
  }, [])

  const disconnect = useCallback(async (p: MusicProvider) => {
    await p.disconnect().catch(() => {})
    setResults([])
    notifyConnectionsChanged()
  }, [])

  const search = useCallback(async () => {
    if (!current || !query.trim()) return
    setBusy(true)
    setMessage(null)
    try {
      setResults(await current.search(query.trim()))
    } catch {
      setResults([])
      setMessage('A busca falhou. Tente de novo ou reconecte o serviço.')
    } finally {
      setBusy(false)
    }
  }, [current, query])

  return (
    <Layout.Screen testID="musicScreen">
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>Música</Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>
      <Layout.Content>
        <View style={[a.p_lg, a.gap_lg]}>
          {!IS_WEB && (
            <Text style={[t.atoms.text_contrast_medium]}>
              A música dentro do AQUA está disponível na versão web.
            </Text>
          )}
          <Text style={[a.text_lg, a.font_bold]}>Seus serviços</Text>
          <View style={[a.gap_sm]}>
            {PROVIDER_LIST.map(p => (
              <ProviderRow
                key={p.id}
                provider={p}
                connected={p.isConnected()}
                onConnect={() => connect(p)}
                onDisconnect={() => disconnect(p)}
              />
            ))}
          </View>

          {connected.length > 0 && (
            <>
              {connected.length > 1 && (
                <View style={[a.flex_row, a.gap_sm]}>
                  {connected.map(p => (
                    <Button
                      key={p.id}
                      label={p.label}
                      size="small"
                      color={current === p ? 'primary' : 'secondary'}
                      onPress={() => {
                        setActive(p)
                        setResults([])
                      }}>
                      <ButtonText>{p.label}</ButtonText>
                    </Button>
                  ))}
                </View>
              )}
              <View style={[a.flex_row, a.gap_sm, a.align_center]}>
                <View style={[a.flex_1]}>
                  <TextField.Root>
                    <TextField.Input
                      label="Buscar músicas"
                      placeholder={`Buscar no ${current?.label ?? ''}`}
                      value={query}
                      onChangeText={setQuery}
                      onSubmitEditing={search}
                      returnKeyType="search"
                    />
                  </TextField.Root>
                </View>
                <Button
                  label="Buscar"
                  size="large"
                  color="primary"
                  onPress={search}>
                  <ButtonText>Buscar</ButtonText>
                </Button>
              </View>
            </>
          )}

          {(message || music.error) && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dispensar aviso"
              accessibilityHint="Fecha a mensagem de erro"
              onPress={() => {
                setMessage(null)
                clearMusicError()
              }}>
              <Text style={[{color: t.palette.negative_500}]}>
                {message ?? music.error}
              </Text>
            </Pressable>
          )}

          {top.length > 0 && results.length === 0 && (
            <>
              <Text style={[a.text_lg, a.font_bold]}>Suas mais ouvidas</Text>
              <View style={[a.gap_xs]}>
                {top.map(track => (
                  <TrackRow
                    key={track.uri}
                    track={track}
                    playing={music.track?.uri === track.uri && music.playing}
                  />
                ))}
              </View>
            </>
          )}
          {busy && (
            <Text style={[t.atoms.text_contrast_medium]}>Buscando…</Text>
          )}
          <View style={[a.gap_xs]}>
            {results.map(track => (
              <TrackRow
                key={track.uri}
                track={track}
                playing={music.track?.uri === track.uri && music.playing}
              />
            ))}
          </View>
        </View>
      </Layout.Content>
    </Layout.Screen>
  )
}

function ProviderRow({
  provider,
  connected,
  onConnect,
  onDisconnect,
}: {
  provider: MusicProvider
  connected: boolean
  onConnect: () => void
  onDisconnect: () => void
}) {
  const t = useTheme()
  const configured = provider.isConfigured()
  return (
    <View
      style={[
        a.flex_row,
        a.align_center,
        a.gap_md,
        a.p_md,
        a.rounded_md,
        t.atoms.bg_contrast_25,
      ]}>
      <View style={[a.flex_1]}>
        <Text style={[a.font_bold]}>{provider.label}</Text>
        <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
          {connected
            ? 'Conectado'
            : configured
              ? 'Entre para ouvir enquanto navega'
              : 'Ainda não configurado neste app'}
        </Text>
      </View>
      {connected ? (
        <Button
          label={`Desconectar ${provider.label}`}
          size="small"
          color="secondary"
          onPress={onDisconnect}>
          <ButtonText>Desconectar</ButtonText>
        </Button>
      ) : (
        configured && (
          <Button
            label={`Conectar ${provider.label}`}
            size="small"
            color="primary"
            onPress={onConnect}>
            <ButtonText>Conectar</ButtonText>
          </Button>
        )
      )}
    </View>
  )
}

function TrackRow({track, playing}: {track: MusicTrack; playing: boolean}) {
  const t = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Tocar ${track.title}, ${track.artist}`}
      accessibilityHint="Toca a música no mini player"
      onPress={() => playTrack(track)}
      style={[a.flex_row, a.align_center, a.gap_md, a.py_sm]}>
      <Image
        accessibilityIgnoresInvertColors
        source={track.artwork ? {uri: track.artwork} : undefined}
        style={[a.rounded_sm, t.atoms.bg_contrast_50, {width: 44, height: 44}]}
      />
      <View style={[a.flex_1]}>
        <Text numberOfLines={1} style={[a.font_bold]}>
          {track.title}
        </Text>
        <Text
          numberOfLines={1}
          style={[a.text_sm, t.atoms.text_contrast_medium]}>
          {track.artist}
        </Text>
      </View>
      {playing && (
        <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>Tocando</Text>
      )}
    </Pressable>
  )
}
