import {useId} from 'react'
import {View} from 'react-native'
import {SvgXml} from 'react-native-svg'

import {IU_CHAT_ICON_XML} from '#/components/icons/iu-chat-icon-xml'

/**
 * Lilac hexagon with a Saturn ring. The drawing is the designer file
 * `assets/icons/iu-chat.svg` (transparent; no background shape).
 */
export function IUChatIcon({size}: {size: number}) {
  const scope = `iu${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const ids = [...IU_CHAT_ICON_XML.matchAll(/\bid="([^"]+)"/g)].map(
    match => match[1],
  )
  let xml = IU_CHAT_ICON_XML
  for (const id of ids) {
    xml = xml
      .replaceAll(`id="${id}"`, `id="${scope}${id}"`)
      .replaceAll(`url(#${id})`, `url(#${scope}${id})`)
  }

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{width: size, height: size}}>
      <SvgXml xml={xml} width={size} height={size} />
    </View>
  )
}
