import {
  MAX_FILES_PER_DROP,
  MAX_SOURCE_BYTES,
  newUploadRecord,
  normalizeUpload,
  selectDroppedFiles,
  UPLOAD_COLLECTION,
  uploadBlobUrl,
} from '#/lib/visionboard/uploads'

const OWNER = 'did:plc:owner000000000000000000'
const OTHER = 'did:plc:other000000000000000000'
const BOARD = `at://${OWNER}/place.aqua.visionboard.board/3kboard`
const CID = 'bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku'
const blob = (over = {}) => ({
  $type: 'blob',
  ref: {$link: CID},
  mimeType: 'image/jpeg',
  size: 123456,
  ...over,
})

describe('normalizeUpload', () => {
  it('accepts a well-formed upload and trims the alt text', () => {
    const u = normalizeUpload(
      {
        board: BOARD,
        image: blob(),
        alt: '  sunset  ',
        aspectRatio: {width: 400, height: 300},
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      OWNER,
    )
    expect(u).toMatchObject({
      $type: UPLOAD_COLLECTION,
      board: BOARD,
      alt: 'sunset',
      aspectRatio: {width: 400, height: 300},
    })
    expect(u?.image.ref.$link).toBe(CID)
  })

  it('rejects boards of another repo and non-board URIs', () => {
    expect(
      normalizeUpload({board: BOARD, image: blob()}, OTHER),
    ).toBeUndefined()
    expect(
      normalizeUpload({board: 'at://x/y/z', image: blob()}, OWNER),
    ).toBeUndefined()
  })

  it('rejects malformed blobs, odd mime types and junk', () => {
    const bad = [
      blob({mimeType: 'text/html'}),
      blob({mimeType: 'image/svg+xml'}),
      blob({$type: 'x'}),
      blob({ref: {$link: '../../etc/passwd'}}),
      blob({size: 'big'}),
      null,
    ]
    for (const image of bad) {
      expect(normalizeUpload({board: BOARD, image}, OWNER)).toBeUndefined()
    }
    expect(normalizeUpload('x', OWNER)).toBeUndefined()
    expect(normalizeUpload(undefined, OWNER)).toBeUndefined()
  })

  it('drops invalid aspect ratios instead of the whole upload', () => {
    const u = normalizeUpload(
      {board: BOARD, image: blob(), aspectRatio: {width: 0, height: -2}},
      OWNER,
    )
    expect(u?.aspectRatio).toBeUndefined()
  })
})

describe('selectDroppedFiles', () => {
  const f = (type: string, size = 1000, name = 'a') => ({name, type, size})

  it('keeps images and explains each rejection', () => {
    const {accepted, rejected} = selectDroppedFiles([
      f('image/png'),
      f('application/pdf'),
      f('image/jpeg', MAX_SOURCE_BYTES + 1),
      f('image/webp'),
    ])
    expect(accepted).toHaveLength(2)
    expect(rejected.map(r => r.reason)).toEqual([
      'Só imagens JPG, PNG, WebP ou GIF.',
      'Arquivo grande demais (máx. 25 MB).',
    ])
  })

  it('caps how many files go up per drop', () => {
    const many = Array.from({length: MAX_FILES_PER_DROP + 3}, () =>
      f('image/png'),
    )
    const {accepted, rejected} = selectDroppedFiles(many)
    expect(accepted).toHaveLength(MAX_FILES_PER_DROP)
    expect(rejected).toHaveLength(3)
  })
})

describe('upload helpers', () => {
  it('builds the blob URL and a fresh record', () => {
    expect(uploadBlobUrl('https://pds.example/', OWNER, CID)).toBe(
      `https://pds.example/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(OWNER)}&cid=${CID}`,
    )
    const rec = newUploadRecord(
      {board: BOARD, image: blob() as never},
      new Date('2026-02-03T04:05:06.000Z'),
    )
    expect(rec.createdAt).toBe('2026-02-03T04:05:06.000Z')
    expect(rec.$type).toBe(UPLOAD_COLLECTION)
  })
})
