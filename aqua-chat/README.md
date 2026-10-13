# IU Chat

Serviço de chat embutido no Aqua (primeiro item da barra lateral). Em desenvolvimento ele escuta em `http://localhost:3080`. A URL que o Aqua abre é `EXPO_PUBLIC_IU_CHAT_URL` (o mesmo padrão).

O compose deste serviço não está neste branch. A política para ele aparecer **dentro** do Aqua, com login, está em `embed.env.example`. Copie essas variáveis para o ambiente do container e reinicie. Não commite `.env` nem segredo.

## Por que essas variáveis

O navegador recusa o iframe quando a resposta manda `X-Frame-Options: SAMEORIGIN` e o Aqua está em outra porta. A troca segura é desligar esse cabeçalho **só** com CSP `frame-ancestors` aplicado de verdade, listando as origens do Aqua. Outros cabeçalhos de segurança ficam ligados.

A sessão usa cookie `SameSite=Strict`. No mesmo site (Aqua em `http://localhost:19006` e chat em `http://localhost:3080`) o Chrome envia o cookie dentro do iframe. `localhost` e `127.0.0.1` são sites diferentes: o login não gruda. Em produção, publique o chat num subdomínio do mesmo site do Aqua (`https://chat.aquaapp.systems` dentro de `https://aquaapp.systems`) e acrescente essa origem em `CSP_FRAME_ANCESTORS`.

`SameSite=None; Secure` não é o caminho padrão. No HTTP local o navegador joga o cookie fora. Entre sites diferentes, o Chrome atual também pode bloquear. Se o endereço não puder ser o mesmo site, o Aqua oferece abrir o chat em página inteira (navegação do próprio documento, não uma aba nova).

## Provar localmente

1. Suba o IU Chat na porta 3080 com as variáveis de `embed.env.example` (e a origem real do Aqua na lista).
2. No Aqua, `yarn web` e abra `http://localhost:<porta>` — o mesmo nome `localhost`, não misture com `127.0.0.1`.
3. O primeiro item da barra é **IU Chat**. O chat ocupa o resto da altura.
4. Com o serviço desligado, a tela mostra um aviso em português e tenta de novo sozinha.
