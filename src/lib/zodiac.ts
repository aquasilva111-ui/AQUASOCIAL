export type ZodiacSign =
  | 'aries'
  | 'taurus'
  | 'gemini'
  | 'cancer'
  | 'leo'
  | 'virgo'
  | 'libra'
  | 'scorpio'
  | 'sagittarius'
  | 'capricorn'
  | 'aquarius'
  | 'pisces'

export const ZODIAC_SIGNS: {id: ZodiacSign; label: string; symbol: string}[] = [
  {id: 'aries', label: 'Áries', symbol: '♈'},
  {id: 'taurus', label: 'Touro', symbol: '♉'},
  {id: 'gemini', label: 'Gêmeos', symbol: '♊'},
  {id: 'cancer', label: 'Câncer', symbol: '♋'},
  {id: 'leo', label: 'Leão', symbol: '♌'},
  {id: 'virgo', label: 'Virgem', symbol: '♍'},
  {id: 'libra', label: 'Libra', symbol: '♎'},
  {id: 'scorpio', label: 'Escorpião', symbol: '♏'},
  {id: 'sagittarius', label: 'Sagitário', symbol: '♐'},
  {id: 'capricorn', label: 'Capricórnio', symbol: '♑'},
  {id: 'aquarius', label: 'Aquário', symbol: '♒'},
  {id: 'pisces', label: 'Peixes', symbol: '♓'},
]

export function isZodiacSign(value: unknown): value is ZodiacSign {
  return (
    typeof value === 'string' && ZODIAC_SIGNS.some(sign => sign.id === value)
  )
}

export function getZodiacSign(id: ZodiacSign) {
  return ZODIAC_SIGNS.find(sign => sign.id === id)
}

/** Custom record NSID, stored at rkey "self" in the user's own repo. */
export const ZODIAC_COLLECTION = 'place.aqua.actor.zodiac'
