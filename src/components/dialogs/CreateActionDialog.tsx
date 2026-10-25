import React, {useCallback} from 'react'
import {Pressable, View} from 'react-native'
import {useNavigation} from '@react-navigation/native'

import {useOpenComposer} from '#/lib/hooks/useOpenComposer'
import {type NavigationProp} from '#/lib/routes/types'
import {useDocsApi} from '#/state/docs/store'
import {atoms as a, useTheme} from '#/alf'
import * as Dialog from '#/components/Dialog'
import {Book_Stroke2_Corner2_Rounded as BookIcon} from '#/components/icons/Book'
import {Camera_Stroke2_Corner0_Rounded as CameraIcon} from '#/components/icons/Camera'
import {Drop_Stroke2_Corner0_Rounded as DropIcon} from '#/components/icons/Drop'
import {EditBig_Stroke2_Corner0_Rounded as EditIcon} from '#/components/icons/EditBig'
import {LiveVideo_Stroke2_Corner0_Rounded as LiveIcon} from '#/components/icons/LiveVideo'
import {PlusLarge_Stroke2_Corner0_Rounded as PlusIcon} from '#/components/icons/Plus'
import {Text} from '#/components/Typography'

interface CreateOptionProps {
  icon: React.ReactNode
  title: string
  description: string
  badge?: string
  accentColor: string
  onPress: () => void
}

function CreateOptionItem({
  icon,
  title,
  description,
  badge,
  accentColor,
  onPress,
}: CreateOptionProps) {
  const t = useTheme()
  const [hovered, setHovered] = React.useState(false)

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint=""
      onPress={onPress}
      // @ts-expect-error web hover support
      onMouseEnter={() => setHovered(true)}
      // @ts-expect-error web hover support
      onMouseLeave={() => setHovered(false)}
      style={[
        a.flex_row,
        a.align_center,
        a.gap_md,
        a.p_md,
        a.rounded_md,
        a.border,
        t.atoms.border_contrast_low,
        hovered ? t.atoms.bg_contrast_25 : t.atoms.bg_contrast_10,
        {
          transition: 'all 150ms ease',
        },
      ]}>
      <View
        style={[
          a.align_center,
          a.justify_center,
          a.rounded_full,
          {
            width: 44,
            height: 44,
            backgroundColor: `${accentColor}18`,
            borderWidth: 1,
            borderColor: `${accentColor}35`,
          },
        ]}>
        {icon}
      </View>

      <View style={[a.flex_1, a.gap_2xs]}>
        <View style={[a.flex_row, a.align_center, a.gap_xs]}>
          <Text style={[a.font_bold, a.text_md, t.atoms.text]}>{title}</Text>
          {badge && (
            <View
              style={[
                a.px_xs,
                a.py_2xs,
                a.rounded_xs,
                {backgroundColor: `${accentColor}25`},
              ]}>
              <Text
                style={[
                  a.text_xs,
                  a.font_bold,
                  {color: accentColor, textTransform: 'uppercase'},
                ]}>
                {badge}
              </Text>
            </View>
          )}
        </View>
        <Text style={[a.text_sm, t.atoms.text_contrast_medium, a.leading_snug]}>
          {description}
        </Text>
      </View>
    </Pressable>
  )
}

export function CreateActionDialog({
  control,
}: {
  control: Dialog.DialogControlProps
}) {
  const t = useTheme()
  const navigation = useNavigation<NavigationProp>()
  const {openComposer} = useOpenComposer()
  const {createDoc} = useDocsApi()

  const handleNewPost = useCallback(() => {
    control.close(() => {
      openComposer({})
    })
  }, [control, openComposer])

  const handleNewStory = useCallback(() => {
    control.close(() => {
      navigation.navigate('StoryCreate')
    })
  }, [control, navigation])

  const handleNewDrop = useCallback(() => {
    control.close(() => {
      navigation.navigate('Drops')
    })
  }, [control, navigation])

  const handleNewDoc = useCallback(() => {
    control.close(() => {
      const doc = createDoc()
      if (doc) {
        navigation.navigate('DocEditor', {id: doc.id})
      }
    })
  }, [control, createDoc, navigation])

  const handleCreativeHub = useCallback(() => {
    control.close(() => {
      navigation.navigate('CreativeHub')
    })
  }, [control, navigation])

  const handleGoLive = useCallback(() => {
    control.close(() => {
      navigation.navigate('VideoGoLive')
    })
  }, [control, navigation])

  return (
    <Dialog.Outer control={control} nativeOptions={{preventExpansion: true}}>
      <Dialog.Handle />
      <Dialog.ScrollableInner label="Criar no AQUA">
        <View style={[a.gap_md, a.pb_md]}>
          <View style={[a.gap_2xs]}>
            <Text style={[a.text_2xl, a.font_bold, t.atoms.text]}>
              Criar no AQUA
            </Text>
            <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
              O que você deseja produzir ou compartilhar agora?
            </Text>
          </View>

          <View style={[a.gap_sm, a.pt_xs]}>
            <CreateOptionItem
              icon={<EditIcon size="md" style={{color: '#002bef'}} />}
              title="Novo Post"
              description="Texto, imagens, vídeos ou links na timeline pública"
              accentColor="#002bef"
              onPress={handleNewPost}
            />

            <CreateOptionItem
              icon={<CameraIcon size="md" style={{color: '#f04c24'}} />}
              title="Novo Story"
              description="Momento em tela cheia (9:16) com texto e figurinhas"
              badge="Story"
              accentColor="#f04c24"
              onPress={handleNewStory}
            />

            <CreateOptionItem
              icon={<DropIcon size="md" style={{color: '#009eff'}} />}
              title="Novo Drop"
              description="Vídeo curto vertical para o feed de Drops"
              badge="Drops"
              accentColor="#009eff"
              onPress={handleNewDrop}
            />

            <CreateOptionItem
              icon={<BookIcon size="md" style={{color: '#12a58a'}} />}
              title="Novo Documento (Aqua Docs)"
              description="Editor em blocos colaborativo em tempo real"
              badge="Docs"
              accentColor="#12a58a"
              onPress={handleNewDoc}
            />

            <CreateOptionItem
              icon={<PlusIcon size="md" style={{color: '#ff7a00'}} />}
              title="Creative Hub & Estúdio"
              description="Design gráfico, apresentações, música e planilhas"
              badge="Hub"
              accentColor="#ff7a00"
              onPress={handleCreativeHub}
            />

            <CreateOptionItem
              icon={<LiveIcon size="md" style={{color: '#e02424'}} />}
              title="Iniciar Transmissão (Ao Vivo)"
              description="Faça lives e transmita vídeo para a comunidade"
              badge="Ao Vivo"
              accentColor="#e02424"
              onPress={handleGoLive}
            />
          </View>
        </View>

        <Dialog.Close />
      </Dialog.ScrollableInner>
    </Dialog.Outer>
  )
}
