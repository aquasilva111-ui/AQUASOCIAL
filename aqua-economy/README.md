# AQUA Economy (Wallet + 616 Network — Fase 1)

Domínio econômico central do AQUA.

A UI **nunca** chama blockchain ou RPC diretamente. Tudo passa por:

```
UI → WalletService → EconomicNetworkAdapter → Mock616 / Real616
```

## O que esta fase entrega

- Modelos: `EconomicIdentity`, `WalletAccount`, `Balance`, `Transaction`
- Contrato `EconomicNetworkAdapter`
- `Mock616Adapter` determinístico (contas, saldos, transferências, pending → confirmed, idempotency, network offline, saldo insuficiente)
- `WalletService` (orquestração de alto nível: overview, prepare/submit send, receive info)
- `MockSigner` (sem private key real)
- Testes cobrindo os critérios de sucesso da Fase 1 + WalletService

## Como rodar

```bash
cd aqua-economy
npm install
npm test
npm run typecheck
```

## Regras importantes

- Nunca armazenar ou logar private key / seed.
- AQUA continua funcionando se a 616 estiver offline.
- Retry com a mesma `idempotencyKey` não duplica transferência.
- 616 é a moeda nativa no mock (sem tokenomics definida ainda).
- A UI deve pedir confirmação explícita antes de chamar `submitSend`.

## Próximas fases

- Wallet Overview UI
- Assets, Credits, Ownership
- Royalties + Settlement
- Integração com Launch Hub / Creative Hub / Music / Reads / View
- Real616Adapter (quando a rede existir)
