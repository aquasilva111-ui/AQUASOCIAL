// Gravidade de uma Convenção para um usuário: quanto ela "puxa" o feed.
// Massa (intensidade, frequência, persistência, diversidade, conectividade)
// × decaimento com meia-vida. O estado diz em que fase ela está.
import type {GravityState} from './model.ts'

export interface GravityDims {
  /** soma dos pesos dos sinais (curtir 1, repostar 2, salvar 3, seguir 4…) */
  intensity: number
  /** quantos sinais */
  frequency: number
  /** em quantos dias diferentes */
  persistence: number
  /** quantos tipos de sinal diferentes (curtir, salvar, tempo…) */
  diversity: number
  /** com quantas outras Convenções ela forma Sinapses */
  connectivity: number
  /** dias desde o último sinal */
  recencyDays: number
}

export const GRAVITY = {
  halfLifeDays: 14,
  weights: {
    intensity: 1,
    frequency: 0.5,
    persistence: 0.8,
    diversity: 0.3,
    connectivity: 0.4,
  },
  /** massa mínima e dias mínimos para ser "ativa" */
  activeMass: 4,
  activePersistence: 2,
  /** abaixo deste decaimento: enfraquecendo (= passou uma meia-vida) */
  weakeningBelow: 0.5,
  /** abaixo deste: dormente (≈ 3,3 meias-vidas) */
  dormantBelow: 0.1,
} as const

/** 1 agora, 0,5 depois de uma meia-vida, 0,25 depois de duas… */
export function decayFactor(days: number, halfLifeDays: number = GRAVITY.halfLifeDays) {
  return Math.pow(0.5, Math.max(0, days) / halfLifeDays)
}

/** Massa sem decaimento (o "tamanho" do interesse). */
export function mass(d: GravityDims): number {
  const w = GRAVITY.weights
  return (
    w.intensity * Math.log1p(Math.max(0, d.intensity)) +
    w.frequency * Math.log1p(Math.max(0, d.frequency)) +
    w.persistence * Math.log1p(Math.max(0, d.persistence)) +
    w.diversity * Math.max(0, d.diversity) +
    w.connectivity * Math.log1p(Math.max(0, d.connectivity))
  )
}

export function gravity(d: GravityDims, halfLifeDays?: number): number {
  return mass(d) * decayFactor(d.recencyDays, halfLifeDays)
}

export function stateOf(d: GravityDims, halfLifeDays?: number): GravityState {
  const decay = decayFactor(d.recencyDays, halfLifeDays)
  if (decay < GRAVITY.dormantBelow) return 'dormant'
  if (decay < GRAVITY.weakeningBelow) return 'weakening'
  if (mass(d) >= GRAVITY.activeMass && d.persistence >= GRAVITY.activePersistence)
    return 'active'
  return 'emerging'
}
