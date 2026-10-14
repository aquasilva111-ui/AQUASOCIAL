/**
 * Abstracao de Signer.
 * Nunca armazena ou loga private key.
 * Primeira versao: MockSigner (apenas para desenvolvimento).
 */

export interface Signer {
  getAddress(): Promise<string>
  signMessage(message: string): Promise<string>
  signTransaction(prepared: unknown): Promise<string>
}

export class MockSigner implements Signer {
  constructor(private address: string) {}

  async getAddress(): Promise<string> {
    return this.address
  }

  async signMessage(message: string): Promise<string> {
    // Mock: apenas um hash deterministico, sem chave real
    return `mocksig_${Buffer.from(message).toString('base64url').slice(0, 16)}`
  }

  async signTransaction(_prepared: unknown): Promise<string> {
    return `mocktxsig_${this.address.slice(-8)}`
  }
}
