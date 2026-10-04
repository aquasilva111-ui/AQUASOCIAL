import {formatCount} from '#/lib/visionboard/format'

describe('formatCount', () => {
  it('keeps small numbers and shortens thousands in pt-BR', () => {
    expect(formatCount(0)).toBe('0')
    expect(formatCount(999)).toBe('999')
    expect(formatCount(1000)).toBe('1 mil')
    expect(formatCount(1323)).toBe('1,3 mil')
    expect(formatCount(12500)).toBe('12,5 mil')
  })
})
