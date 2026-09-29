import {type LaunchType} from '#/lib/launch-hub/types'

export type LaunchTypeField =
  | 'title'
  | 'description'
  | 'link'
  | 'music.artist'
  | 'music.albumOrSingle'
  | 'music.genre'
  | 'music.credits'
  | 'music.lyrics'
  | 'music.releaseDate'

export type LaunchTypeDefinition = {
  type: LaunchType
  label: string
  /** Fields shown in the content step, in addition to the social text. */
  fields: LaunchTypeField[]
  /** Fields that must be filled before any destination can go out. */
  required: LaunchTypeField[]
}

export const LAUNCH_TYPES: LaunchTypeDefinition[] = [
  {type: 'social_post', label: 'Post social', fields: [], required: []},
  {
    type: 'video_release',
    label: 'Lançamento de vídeo',
    fields: ['title', 'description', 'link'],
    required: ['title'],
  },
  {
    type: 'music_release',
    label: 'Lançamento musical',
    fields: [
      'title',
      'music.artist',
      'music.albumOrSingle',
      'music.genre',
      'description',
      'music.credits',
      'music.lyrics',
      'music.releaseDate',
      'link',
    ],
    required: ['title', 'music.artist'],
  },
  {
    type: 'book_release',
    label: 'Lançamento de livro',
    fields: ['title', 'description', 'link'],
    required: ['title'],
  },
  {
    type: 'article',
    label: 'Artigo',
    fields: ['title', 'description', 'link'],
    required: ['title'],
  },
  {
    type: 'product_launch',
    label: 'Lançamento de produto',
    fields: ['title', 'description', 'link'],
    required: ['title'],
  },
  {
    type: 'app_release',
    label: 'Lançamento de app/jogo',
    fields: ['title', 'description', 'link'],
    required: ['title'],
  },
  {
    type: 'campaign',
    label: 'Campanha',
    fields: ['title', 'description', 'link'],
    required: ['title'],
  },
]

export const FIELD_LABELS: Record<LaunchTypeField, string> = {
  title: 'Título',
  description: 'Descrição',
  link: 'Link',
  'music.artist': 'Artista',
  'music.albumOrSingle': 'Formato (single, EP, álbum)',
  'music.genre': 'Gênero',
  'music.credits': 'Créditos',
  'music.lyrics': 'Letra',
  'music.releaseDate': 'Data de lançamento',
}

export function getLaunchType(type: LaunchType): LaunchTypeDefinition {
  return LAUNCH_TYPES.find(def => def.type === type) ?? LAUNCH_TYPES[0]
}
