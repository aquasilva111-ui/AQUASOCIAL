import {ABOUT_PARAGRAPHS, ABOUT_TITLE, INFO_PAGE_LINKS} from '#/lib/public-site'
import {PlainInfoPage} from '#/view/screens/PlainInfoPage'

export function AboutScreen() {
  return (
    <PlainInfoPage
      title={ABOUT_TITLE}
      paragraphs={ABOUT_PARAGRAPHS}
      links={INFO_PAGE_LINKS}
    />
  )
}
