import {
  CONTACT_MAILTO,
  CONTACT_PARAGRAPHS,
  CONTACT_TITLE,
  INFO_PAGE_LINKS,
} from '#/lib/public-site'
import {PlainInfoPage} from '#/view/screens/PlainInfoPage'

export function ContactScreen() {
  return (
    <PlainInfoPage
      title={CONTACT_TITLE}
      paragraphs={CONTACT_PARAGRAPHS}
      links={[CONTACT_MAILTO, ...INFO_PAGE_LINKS]}
    />
  )
}
