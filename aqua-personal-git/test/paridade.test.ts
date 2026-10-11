// Paridade Python ↔ TypeScript das regras de identidade da U.I.
// Os vetores (test/vetores/paridade.json) foram gerados executando o
// repositorio.py/pendentes.py reais (scripts/gerar-vetores.py) e incluem
// amostras reais da base-de-sinteses e casos Unicode difíceis.
import {readFileSync} from 'node:fs'

import {describe, expect, it} from 'vitest'

import {
  caminhoDe,
  chavePendente,
  idConvencao,
  idEsperado,
  idSinapse,
  idSintese,
  normalizar,
  type Pasta,
} from '../src/index.ts'

const V = JSON.parse(
  readFileSync(new URL('./vetores/paridade.json', import.meta.url), 'utf8'),
)
const mostra = (s: string) =>
  JSON.stringify(s).replace(
    /[^\x20-\x7e]/g,
    c => `\\u${c.codePointAt(0)!.toString(16).padStart(4, '0')}`,
  )

describe('paridade com o Python da U.I.', () => {
  it('normalizar(): NFKC, minúsculas e os espaços do str.split()', () => {
    expect(V.normalizar.length).toBeGreaterThan(30)
    for (const {entrada, saida} of V.normalizar)
      expect(normalizar(entrada), mostra(entrada)).toBe(saida)
  })

  it('id de Convenção (por nome/tipo e por âncora)', () => {
    for (const v of V.convencoes) {
      const id = v.ancora
        ? idConvencao({ancora: v.ancora})
        : idConvencao({tipo: v.tipo, nome: v.nome})
      expect(id, mostra(v.nome ?? v.ancora.join(':'))).toBe(v.id)
    }
  })

  it('id de Sinapse e de Síntese', () => {
    for (const v of V.sinapses)
      expect(idSinapse(v.origem, v.destino, v.tipo, v.contexto)).toBe(v.id)
    for (const v of V.sinteses) expect(idSintese(v.sinapses)).toBe(v.id)
  })

  it('chave de pendente (json.dumps com sort_keys)', () => {
    for (const v of V.pendentes) expect(chavePendente(v.proposta)).toBe(v.id)
  })

  it('surrogate isolado: o Python não grava, o TypeScript recusa', () => {
    expect(V.sem_id.length).toBe(2)
    for (const s of V.sem_id)
      expect(() => idConvencao({tipo: 'conceito', nome: s})).toThrow(/surrogate/)
  })

  it('amostras reais da base-de-sinteses: id e caminho', () => {
    expect(V.reais.length).toBeGreaterThanOrEqual(20)
    for (const r of V.reais) {
      expect(idEsperado(r.pasta as Pasta, r), r.arquivo).toContain(r.id)
      expect(caminhoDe(r.pasta as Pasta, r)).toBe(r.arquivo)
    }
  })

  it('números: só inteiros (1.0 do Python não tem forma única no JS)', () => {
    expect(() => chavePendente({gravidade: 0.5})).toThrow(/inteiros/)
  })
})
