# AQUA +18 — Entry Gate (autodeclaração de maioridade)

Status: **solução temporária de produto**. A autodeclaração **não é** verificação de idade. A integração futura com Age Assurance / Age Verification ficou intacta, atrás de uma feature flag.

## Fluxo

```
AQUA → /adult/* → AdultShell → AdultGate
   ├─ "Tenho 18 anos ou mais — Entrar"   → ctx.enter()
   │     1. markAdultEntered(did, 'self_declared')     (memória, só esta sessão)
   │     2. account.adultAgeDeclaration                (registro mínimo local)
   │     3. POST /me/adult/self-declaration            (servidor, melhor esforço)
   │     4. AdultGate renderiza o conteúdo da rota pedida (/adult, deep link…)
   └─ "Tenho menos de 18 anos — Sair"    → navigate('Home'), nada é criado
```

- Nenhuma das duas escolhas vem pré-selecionada.
- Antes da escolha, os filhos do `AdultGate` não são montados. Isso impede qualquer query, prefetch, thumbnail ou player +18.
- A prévia do feed em `AdultHome` também usa `enabled: ctx.adultAccessEnabled`.

## Representação da autodeclaração

| Camada | `self_declared` | `verified` |
|---|---|---|
| App — `AdultEntryMethod` (`src/state/adult/gate.ts`) | `'self_declared'` | `'verified'` |
| App — `AdultContextValue.entryMethod` | `'self_declared'` | `'verified'` |
| App — storage da conta | `adultAgeDeclaration {status, at, policyVersion}` | — |
| API — `adult_accounts` | `self_declared_at`, `self_declaration_policy_version` | `age_verified_at` (**nunca** escrito pela declaração) |
| API — `GET /me/adult/access` | `basis: 'self_declared'` | `basis: 'verified'` |
| API — negação sem base | `adult_declaration_required` | `age_verification_required` |

Dados guardados:

- **App:** status, data/hora e versão do texto aceito (`ADULT_SELF_DECLARATION_POLICY_VERSION`).
- **Servidor:** DID, data/hora e versão do texto, além de um evento em `audit_events` (`adult.self_declaration`).
- Nenhum outro dado.

## Feature flag

- **App:** gate Statsig `adult_age_verification`, padrão desligado. É o sistema de flags que o AQUA já usa (`src/lib/statsig/gates.ts`).
  - Desligado: a autodeclaração abre o +18.
  - Ligado: só `verified` abre, que é o contrato original, fail-closed.
- **API:** variável `AQUA_ADULT_AGE_VERIFICATION_ENABLED`.
  - `1`: só verificação real dá acesso. A declaração é registrada, mas não libera nada.
  - Em dev/test o padrão é desligado.
  - **Em produção o padrão é ligado (fail closed).** Para aceitar a autodeclaração no servidor de produção é preciso definir `AQUA_ADULT_AGE_VERIFICATION_ENABLED=0` explicitamente.
- Estados bloqueantes (`denied`, `restricted`) continuam fechados com a flag ligada ou desligada.

## Verificação de idade (preservada, desconectada da UI)

"Reserved for future Age Assurance / Age Verification integration."

| Peça | Onde |
|---|---|
| Componente/gatilho | `src/screens/Adult/AdultGate.tsx`: botão "Iniciar verificação", renderizado só com `ctx.ageVerificationEnabled` |
| Handler | `beginAgeAssurance.mutate({email, language: 'pt'})` |
| Service/hook | `src/ageAssurance/useBeginAgeAssurance.ts` |
| API | `app.bsky.ageassurance.begin` no AppView (service auth `aud: BLUESKY_PROXY_DID`) |
| Provider/estado | `src/ageAssurance/index.tsx` (`useAgeAssurance`), `state.ts`, `data.tsx`, `types.ts` |
| Estados | `AgeAssuranceStatus`/`AgeAssuranceAccess` → `resolveAdultAgeGate()` → `unknown`, `required`, `pending`, `verified`, `denied`, `restricted` |
| Servidor +18 | `adult_accounts.age_verified_at` (`/dev/age-verification` simula em dev) |

Nada disso foi apagado. Só o gatilho de UI depende da flag.

## Sessão, refresh e logout

- **Refresh:** a entrada fica só em memória (`src/state/adult/entered.ts`). Recarregar sempre mostra o gate de novo.
- **Logout, sessão expirada ou troca de conta:** `SessionStore.dispatch` (`src/state/session/index.tsx`) chama `clearAdultEntered()` e `clearAdultApiToken()` sempre que o DID atual muda. Voltar com a mesma conta passa pelo gate outra vez.
- **Sair do +18:** `ctx.exit()` limpa a entrada, o histórico de ações, os relacionamentos, o token da API e todas as queries `adult`.

## Links do rodapé

Todos apontam para rotas AQUA que já existem:

- **Controles Parentais:** `/settings/privacy-and-security`.
- **Termos de Uso:** `/support/tos`.
- **Privacidade:** `/support/privacy`.
- **Segurança** e **Central de Ajuda:** `/support`.
- **Política +18:** `/support/community-guidelines`. **TODO:** página própria de política de conteúdo +18 quando existir.

## Testes

- **App:** `__tests__/lib/adult-gate.test.ts` e `__tests__/lib/adult-entry.test.ts`.
  - Gate, autodeclaração ≠ verificação e flag ligada ou desligada.
  - Entrada presa à conta e limpeza, sem sobreviver a um refresh.
- **API:** `aqua-adult-api/test/entry-gate.test.ts`.
  - Declaração registrada fora de `age_verified_at`.
  - Conteúdo liberado só depois da declaração.
  - Validação do corpo e 401 sem autenticação.
  - Flag ligada: a declaração não libera nada.
  - Produção fail closed.
