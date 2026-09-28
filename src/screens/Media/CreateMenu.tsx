import {useNavigation} from '@react-navigation/native'

import {useOpenComposer} from '#/lib/hooks/useOpenComposer'
import {type NavigationProp} from '#/lib/routes/types'
import {LiveVideo_Stroke2_Corner0_Rounded as LiveIcon} from '#/components/icons/LiveVideo'
import {VideoClip_Stroke2_Corner0_Rounded as UploadIcon} from '#/components/icons/VideoClip'
import * as Menu from '#/components/Menu'
import {type TriggerProps} from '#/components/Menu/types'

/**
 * "+ Create" dropdown for Aqua Views (Streamplace-style): lets a creator
 * either upload a video (opens the regular post composer with a video
 * attached) or jump to the go-live dashboard.
 */
export function CreateMenu({children}: {children: TriggerProps['children']}) {
  const navigation = useNavigation<NavigationProp>()
  const {openComposer} = useOpenComposer()

  return (
    <Menu.Root>
      <Menu.Trigger label="Criar">{children}</Menu.Trigger>
      <Menu.Outer showCancel>
        <Menu.Group>
          <Menu.Item label="Enviar vídeo" onPress={() => openComposer({})}>
            <Menu.ItemText>Enviar vídeo</Menu.ItemText>
            <Menu.ItemIcon icon={UploadIcon} position="left" />
          </Menu.Item>
          <Menu.Item
            label="Transmitir ao vivo"
            onPress={() => navigation.navigate('VideoGoLive')}>
            <Menu.ItemText>Transmitir ao vivo</Menu.ItemText>
            <Menu.ItemIcon icon={LiveIcon} position="left" />
          </Menu.Item>
        </Menu.Group>
      </Menu.Outer>
    </Menu.Root>
  )
}
