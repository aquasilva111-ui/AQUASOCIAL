const origin = 'https://aquaapp.systems'
const name = 'AQUA Social'
const description =
  'AQUA Social é uma rede social baseada no AT Protocol para descobrir, criar e publicar texto, imagens e vídeos.'
const repository = 'https://github.com/aquasilva111-ui/AQUASOCIAL'
const email = 'team@aquaapp.online'
const tiktok = 'https://www.tiktok.com/@aquasocial'
const support = `${repository}/issues`
const upstreamTerms = 'https://bsky.social/about/support/tos'
const upstreamPrivacy = 'https://bsky.social/about/support/privacy-policy'

const pages = {
  '/': {title: name, description},
  '/about': {
    title: 'Sobre o AQUA Social',
    description:
      'Conheça o AQUA Social, uma rede social com ferramentas de criação construída sobre o AT Protocol.',
    body: [
      description,
      'O projeto começou como um fork do aplicativo Bluesky. O AQUA reúne feeds, publicações e ferramentas criativas em torno de um perfil social.',
    ],
    links: [
      ['AQUA no TikTok', tiktok],
      ['Código-fonte do AQUA', repository],
    ],
  },
  '/contact': {
    title: 'Contato',
    description: 'Canal público para dúvidas técnicas e problemas com o AQUA.',
    body: [
      'Entre em contato com a equipe do AQUA por e-mail. Use o GitHub Issues para relatar problemas técnicos ou sugerir melhorias publicamente.',
    ],
    links: [
      [email, `mailto:${email}`],
      ['GitHub Issues do AQUA', support],
    ],
  },
  '/terms': {
    title: 'Termos e privacidade',
    description:
      'Encontre os links de termos e privacidade exibidos pelo AQUA.',
    body: [
      'O aplicativo AQUA aponta para os termos de serviço e a política de privacidade do Bluesky. Consulte esses documentos para informações sobre o uso dos serviços do Bluesky.',
    ],
    links: [
      ['Termos de serviço do Bluesky', upstreamTerms],
      ['Política de privacidade do Bluesky', upstreamPrivacy],
    ],
  },
  '/search': {
    title: 'Busca',
    description: 'Busque perfis e publicações no AQUA Social.',
  },
  '/views': {
    title: 'AQUA Views',
    description: 'Explore vídeos e canais no AQUA Social.',
  },
  '/visionboard': {
    title: 'Visionboard',
    description: 'Explore publicações com imagens no AQUA Social.',
  },
  '/books': {
    title: 'AQUA Write',
    description: 'Explore publicações e histórias no AQUA Write.',
  },
}

const navigation = [
  ['Sobre', '/about'],
  ['Contato', '/contact'],
  ['Termos e privacidade', '/terms'],
]

const organization = {
  '@type': 'Organization',
  '@id': `${origin}/#organization`,
  name,
  url: `${origin}/`,
  description,
  email,
  sameAs: [tiktok],
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'technical support',
    email,
    url: support,
  },
}

function structuredData(pathname, page) {
  const url = origin + pathname
  const website = {
    '@type': 'WebSite',
    '@id': `${origin}/#website`,
    url: `${origin}/`,
    name,
    description,
    inLanguage: 'pt-BR',
    publisher: {'@id': organization['@id']},
  }
  const type = {'/about': 'AboutPage', '/contact': 'ContactPage'}[pathname]
  return {
    '@context': 'https://schema.org',
    '@graph': [
      organization,
      website,
      {
        '@type': 'SoftwareApplication',
        '@id': `${origin}/#app`,
        name,
        url: `${origin}/`,
        description,
        applicationCategory: 'SocialNetworkingApplication',
        operatingSystem: 'Web, iOS, Android',
        publisher: {'@id': organization['@id']},
        sameAs: [repository],
      },
      {
        '@type': type || 'WebPage',
        '@id': `${url}#webpage`,
        url,
        name: page.title,
        description: page.description,
        inLanguage: 'pt-BR',
        isPartOf: {'@id': website['@id']},
        about: {'@id': organization['@id']},
      },
    ],
  }
}

module.exports = {
  origin,
  name,
  description,
  email,
  pages,
  navigation,
  structuredData,
}
