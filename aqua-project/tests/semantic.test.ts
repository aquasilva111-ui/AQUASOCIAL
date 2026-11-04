import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { formatSemanticMessage, suggestSemanticMessage, parseSemanticMessage } from '../src/semantic'

describe('semantic Git', () => {
  it('formats conventional commit with tags', () => {
    const msg = formatSemanticMessage({
      type: 'style',
      scope: 'design',
      description: 'aumentou contraste',
      tags: ['nazar', 'intenso']
    })
    assert.match(msg, /style\(design\): aumentou contraste/)
    assert.match(msg, /Tags: nazar, intenso/)
  })

  it('suggests based on size change', () => {
    const created = suggestSemanticMessage('doc', 0, 120)
    assert.equal(created.type, 'feat')
    assert.match(created.description, /criado doc/)

    const tweak = suggestSemanticMessage('music', 1000, 1020)
    assert.equal(tweak.type, 'style')
  })

  it('parses a semantic message back', () => {
    const msg = formatSemanticMessage({
      type: 'content',
      scope: 'video',
      description: 'adicionou cena',
      tags: ['climax']
    })
    const parsed = parseSemanticMessage(msg)
    assert.equal(parsed?.type, 'content')
    assert.equal(parsed?.scope, 'video')
    assert.deepEqual(parsed?.tags, ['climax'])
  })
})
