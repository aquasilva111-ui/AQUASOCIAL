# Moderação e regras no AQUA

O AQUA tem o módulo `aqua-adult-api` e pretende ter regras claras desde o começo.

## Princípios

- Regras visíveis e escritas em português claro.
- Moderação alinhada com a visão do projeto (não só “copiar o Bluesky”).
- Ferramentas de moderação acessíveis para quem administra.

## O que já existe

- `aqua-adult-api/` — backend com módulos de safety, moderation, verification, etc.
- Referências de Ozone e labeling no `app-aqua-finale/bsky-reference/`.

## Recomendações práticas

1. **Regras públicas**  
   Crie uma página simples (ou seção no app) com as regras em pt-BR.

2. **Ferramentas visíveis**  
   No app, tenha um caminho claro para reportar e para moderadores agirem.

3. **Labels e filtros**  
   Use o sistema de labels do AT Protocol para conteúdo sensível, em vez de esconder tudo.

4. **PDS próprio**  
   Com o PDS que você configura (ver `docs/BACKEND-COMPLETO.md`), a moderação fica sob seu controle.

## Próximos passos sugeridos

- Escrever as regras em um arquivo `REGRAS.md` ou página no app.
- Expor no app um botão de “Reportar” que já existe no social-app, mas com texto AQUA.
- Conectar o `aqua-adult-api` às ações de moderação quando o backend próprio estiver no ar.

Moderação boa é a que as pessoas entendem. Deixe as regras à vista.
