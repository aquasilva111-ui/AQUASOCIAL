// Fila de pendentes no formato de I.U-A.I/pendentes.py (uma linha de
// dados/pendentes.jsonl = um ItemPendente). O que a Aqua infere entra aqui com
// fonte "aqua" e status "hipótese"; só vira "confirmado" com o aceite do usuário.
import type {Json} from './canonical.ts'
import {
  caminhoDe,
  chavePendente,
  ESFERA_DE_ENTRADA,
  type Convencao,
  type Pasta,
  type Sinapse,
} from './semantica.ts'

export type EstadoPendente = 'aberta' | 'aceita' | 'recusada'

export interface ItemPendente {
  id: string
  estado: EstadoPendente
  criada_em: string
  visto_em: string
  sessao: string
  fonte: string
  motivo: string
  proposta: Record<string, Json>
  resolvida_em?: string
}

export const GUARDAR_RESOLVIDAS = 200

export function createFila(inicial: ItemPendente[] = []) {
  let itens = inicial.map(i => ({...i}))
  const agoraIso = () => new Date().toISOString()
  const podar = () => {
    const abertas = itens.filter(i => i.estado === 'aberta')
    const resolvidas = itens
      .filter(i => i.estado !== 'aberta')
      .slice(-GUARDAR_RESOLVIDAS)
    const manter = new Set([...abertas, ...resolvidas])
    itens = itens.filter(i => manter.has(i))
  }
  return {
    /** Guarda (ou renova) a proposta aberta; devolve o id (= _chave do Python). */
    adicionar(
      proposta: Record<string, Json>,
      o: {sessao: string; motivo?: string; fonte?: string; agora?: string},
    ): string {
      const id = chavePendente(proposta)
      const agora = o.agora ?? agoraIso()
      const limpa = {...proposta}
      delete limpa.pendente_id
      const aberta = itens.find(i => i.id === id && i.estado === 'aberta')
      if (aberta) Object.assign(aberta, {visto_em: agora, sessao: o.sessao})
      else
        itens.push({
          id,
          estado: 'aberta',
          criada_em: agora,
          visto_em: agora,
          sessao: o.sessao,
          fonte: o.fonte ?? '',
          motivo: o.motivo ?? '',
          proposta: limpa,
        })
      podar()
      return id
    },
    resolver(id: string, estado: 'aceita' | 'recusada', agora = agoraIso()) {
      const item = itens.find(i => i.id === id && i.estado === 'aberta')
      if (!item) return undefined
      item.estado = estado
      item.resolvida_em = agora
      podar()
      return item
    },
    abertas: () => itens.filter(i => i.estado === 'aberta'),
    itens: () => itens.map(i => ({...i})),
    paraJsonl: () => itens.map(i => JSON.stringify(i) + '\n').join(''),
  }
}
export type Fila = ReturnType<typeof createFila>

/** Inferência da Aqua → pendente: hipótese, pela 3ª Esfera, fonte "aqua". */
export function proporInferenciaAqua(
  fila: Fila,
  pasta: Extract<Pasta, 'convencoes' | 'sinapses'>,
  objeto: Convencao | Sinapse,
  o: {sessao?: string; motivo: string; evidencias?: string[]; agora?: string},
): string {
  const hipotese: Record<string, Json> = {
    ...(objeto as unknown as Record<string, Json>),
    status: 'hipótese',
    fonte: 'aqua',
  }
  if (hipotese.esfera === undefined) hipotese.esfera = ESFERA_DE_ENTRADA
  // gravidade/estado são medidas do momento, não parte do significado proposto
  delete hipotese.gravidade
  delete hipotese.estado
  return fila.adicionar(
    {
      forma: 'inferencia-aqua',
      pasta,
      objeto: hipotese,
      // fora da chave (como no pendentes.py): nova evidência não duplica a proposta
      procedencia: {fonte: 'aqua', evidencias: o.evidencias ?? []},
    },
    {
      sessao: o.sessao ?? 'aqua',
      motivo: o.motivo,
      fonte: 'aqua',
      ...(o.agora ? {agora: o.agora} : {}),
    },
  )
}

/** Aceite → mudança pronta para commit ({caminho: objeto}) com status "confirmado". */
export function aceitar(
  fila: Fila,
  id: string,
  agora?: string,
): Record<string, Json> | undefined {
  const item = fila.resolver(id, 'aceita', agora)
  if (!item || item.proposta.forma !== 'inferencia-aqua') return undefined
  const objeto = {
    ...(item.proposta.objeto as Record<string, Json>),
    status: 'confirmado',
  }
  const caminho = caminhoDe(
    item.proposta.pasta as Pasta,
    objeto as unknown as {id: string; esfera?: number},
  )
  return {[caminho]: objeto}
}
