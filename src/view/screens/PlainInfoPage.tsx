import {ScrollView, View} from 'react-native'

import {TextLink} from '#/view/com/util/Link'
import {Text} from '#/view/com/util/text/Text'
import * as Layout from '#/components/Layout'

/**
 * Institutional page: white background and text, no extra chrome.
 */
export function PlainInfoPage({
  title,
  paragraphs,
  links,
}: {
  title: string
  paragraphs: readonly string[]
  links: readonly {href: string; label: string}[]
}) {
  return (
    <Layout.Screen style={{backgroundColor: '#fff'}}>
      <ScrollView
        style={{flex: 1, backgroundColor: '#fff'}}
        contentContainerStyle={{padding: 24, maxWidth: 640}}>
        <Text style={titleStyle}>{title}</Text>
        {paragraphs.map(paragraph => (
          <Text key={paragraph} style={bodyStyle}>
            {paragraph}
          </Text>
        ))}
        <View style={linksStyle}>
          {links.map((link, index) => (
            <Text key={link.href} style={bodyStyle}>
              {index > 0 ? ' · ' : ''}
              <TextLink
                href={link.href}
                text={link.label}
                style={{color: '#002bef'}}
              />
            </Text>
          ))}
        </View>
      </ScrollView>
    </Layout.Screen>
  )
}

const titleStyle = {
  color: '#000',
  fontSize: 28,
  lineHeight: 34,
  fontWeight: '700' as const,
}

const bodyStyle = {
  color: '#000',
  fontSize: 16,
  lineHeight: 24,
  marginTop: 12,
}

const linksStyle = {
  flexDirection: 'row' as const,
  flexWrap: 'wrap' as const,
  marginTop: 8,
}
