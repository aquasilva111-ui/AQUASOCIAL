import {Image} from 'react-native'

const readsLogo = require('../../../assets/icons/reads.png')

export function ReadsLogo({width}: {width: number}) {
  return (
    <Image
      accessible={false}
      accessibilityIgnoresInvertColors
      aria-hidden={true}
      source={readsLogo}
      style={{width, height: width}}
    />
  )
}
