# Ambientes: teste, prévia e produção

O site público e o site de testes saem do mesmo repositório, em deploys
separados. Este arquivo é o passo a passo para o Samu configurar os painéis.
O código desta mudança não cria a branch `producao`, não altera a Hostinger
nem a Cloudflare, e não faz merge.

Enquanto o site oficial ainda publicar a branch `1.111.0-ota-5`, um merge
nessa branch continua indo para `https://aquaapp.systems`. A separação só
passa a valer depois dos passos do hPanel abaixo. O comportamento novo é
seguro nesse meio-tempo: sem `AQUA_DEPLOY_ENV`, o build segue indexável, e o
host `aquaapp.systems` (e `www`) não recebe `noindex`.

## Fluxo

1. Abre um pull request contra `1.111.0-ota-5`.
2. O Cloudflare Pages publica uma prévia em `*.pages.dev`.
3. O merge na `1.111.0-ota-5` publica `https://teste.aquaapp.systems`.
4. Quando o Samu aprovar, abre um pull request da `1.111.0-ota-5` para `producao`.
5. O merge em `producao` publica `https://aquaapp.systems` e `https://www.aquaapp.systems`.

```text
pull request
    -> prévia Cloudflare Pages (*.pages.dev)
    -> merge em 1.111.0-ota-5
    -> teste.aquaapp.systems
    -> pull request para producao
    -> aquaapp.systems
```

## O que conta como produção

Produção é só o host `aquaapp.systems` e `www.aquaapp.systems`. Qualquer outro
host é não-produção: `teste.aquaapp.systems`, `*.pages.dev`, hostname de
prévia da Hostinger, `localhost`.

A variável de build `AQUA_DEPLOY_ENV` aceita `production`, `staging` ou
`preview`. Ausente, o build preserva o comportamento atual de produção,
porque o deploy da Hostinger no ar pode não ter variável nenhuma. Na
Cloudflare Pages a variável `CF_PAGES=1` já vem preenchida; se
`AQUA_DEPLOY_ENV` estiver vazia, esse build vira `preview`. Um valor
explícito ganha dos dois.

| Sinal | Produção (`aquaapp.systems` / `www`) | Fora de produção |
| --- | --- | --- |
| `robots.txt` | O arquivo atual, com `Allow: /`, os `Disallow` privados e o `Sitemap` | `User-agent: *` e `Disallow: /`, sem `Sitemap` |
| `X-Robots-Tag` | não envia | `noindex, nofollow` |
| `<meta name="robots">` | não inclui | `noindex, nofollow` |
| `sitemap.xml` | igual ao que está no repositório | o arquivo continua no build, mas o `robots.txt` não aponta para ele |

O header e o `robots.txt` seguem o host do pedido no Apache (`.htaccess`) e
no `server.js`. O meta entra no HTML na hora do build quando o ambiente não
é produção. O `server.js` também insere o meta se o host do pedido não for o
site oficial, mesmo num build feito sem a variável. No preset estático da
Hostinger o Apache não reescreve o HTML: no site de testes a variável
`AQUA_DEPLOY_ENV=staging` precisa estar definida para o meta já sair no
arquivo. O header e o `robots.txt` desse host ficam bloqueados mesmo se a
variável for esquecida.

No host oficial nada disso dispara. `web/robots.txt`, `web/sitemap.xml` e
`web/sitemaps/` continuam iguais.

## Variáveis

| Variável | Onde | Valor |
| --- | --- | --- |
| `AQUA_DEPLOY_ENV` | site oficial na Hostinger | ausente, ou `production` |
| `AQUA_DEPLOY_ENV` | `teste.aquaapp.systems` | `staging` |
| `AQUA_DEPLOY_ENV` | Cloudflare Pages, nos dois ambientes (Production e Preview) | `preview` |
| `NODE_VERSION` | Cloudflare Pages | `22` |
| `CF_PAGES` | definida pela Cloudflare | `1` (não é preciso criar) |

Build igual nos dois painéis: comando `npm run build`, diretório de saída
`web-build`, Node 22, raiz do repositório. O `npm run build` compila as
traduções, exporta o site e gera `.htaccess`, `_headers` e `_redirects`.

## hPanel (Hostinger)

Os nomes dos menus mudam. O que não pode mudar são o branch, o comando, a
pasta de saída e a variável.

### Subdomínio de testes

1. Em **Domínios → Subdomínios**, crie `teste` em `aquaapp.systems`. O DNS do
   subdomínio fica na própria Hostinger. Não aponte `aquaapp.systems` nem
   `www` para outro lugar.
2. Em **Websites → Adicionar website**, crie um aplicativo Node.js (ou o
   mesmo preset React do site oficial) cujo domínio seja
   `teste.aquaapp.systems`.
3. Conecte o Git do repositório `aquasilva111-ui/AQUASOCIAL`.
4. Branch: `1.111.0-ota-5`.
5. Raiz: `./`. Gerenciador: npm. Comando de build: `npm run build`. Pasta de
   saída: `web-build`. Node: 22.x.
6. Se o preset pedir o arquivo de entrada, use `server.js`. O comando de
   start, quando existir, é `npm start`. O `.htaccess` gerado cobre o preset
   estático; o `server.js` cobre o preset Node. Os dois respeitam o host.
7. Em variáveis de ambiente desse site, e só desse site, defina
   `AQUA_DEPLOY_ENV=staging`.
8. Faça um deploy e confira os comandos da seção "Conferir" abaixo.

### Site oficial

1. Crie a branch `producao` no GitHub a partir do commit que está no ar
   hoje, quando quiser congelar a produção. Este repositório não cria essa
   branch sozinho.
2. No website que já publica `aquaapp.systems`, abra o deploy Git e troque o
   branch de `1.111.0-ota-5` para `producao`.
3. Mantenha o resto: raiz `./`, npm, `npm run build`, saída `web-build`,
   Node 22.x, entrada `server.js` se o preset for Node.
4. Não defina `AQUA_DEPLOY_ENV`. Se o painel exigir um valor, use
   `production`.
5. Não coloque `AQUA_DEPLOY_ENV=staging` nem `preview` neste site. O meta de
   `noindex` ficaria gravado no HTML do domínio oficial.

Os dois deploys passam a ser independentes. Merge na `1.111.0-ota-5` atualiza
só o subdomínio. Merge em `producao` atualiza só o site oficial.

## Cloudflare Pages

A Pages existe para cada pull request ganhar uma URL. Ela não substitui a
Hostinger e não deve receber o domínio `aquaapp.systems`.

1. Em [dash.cloudflare.com](https://dash.cloudflare.com), abra **Workers & Pages → Create → Pages → Connect to Git**.
2. Autorize o GitHub e escolha `aquasilva111-ui/AQUASOCIAL`.
3. Nome do projeto: o que quiser. O `wrangler.toml` usa `aquaapp-systems`; se
   o nome no painel for outro e você for publicar com Wrangler, altere
   `name` nesse arquivo.
4. Branch de produção da Pages: `1.111.0-ota-5`. Essa URL estável
   (`<projeto>.pages.dev`) acompanha o branch de teste. Continua sendo
   não-produção, porque o host não é `aquaapp.systems`.
5. Preset de framework: **None**.
6. Comando de build: `npm run build`.
7. Diretório de saída: `web-build`.
8. Variáveis de ambiente, em **Production** e em **Preview**:
   - `NODE_VERSION` = `22`
   - `AQUA_DEPLOY_ENV` = `preview`
9. Deixe as prévias de pull request ligadas. Cada PR ganha uma URL
   `<hash>.<projeto>.pages.dev`.
10. Não adicione `aquaapp.systems` nem `www.aquaapp.systems` como domínio
    customizado. O `_headers` gerado manda `X-Robots-Tag: noindex, nofollow`
    em toda resposta da Pages. O Apache da Hostinger ignora esse arquivo.

O build também grava `web-build/_redirects`. Arquivo que existe
(`robots.txt`, sitemap, `/static`) é servido direto. `/videos/*` redireciona
para `/views/*`. O restante cai no shell do aplicativo
(`/_aqua-pages/app.html`) com status 200, para as rotas do cliente abrirem na
prévia. Na Hostinger, caminho desconhecido continua respondendo 404 pelo
`.htaccess`; a prévia da Pages não replica esse 404.

## Como promover para produção

1. Confira a prévia do pull request e, depois do merge, o
   `https://teste.aquaapp.systems`.
2. Abra um pull request cuja base é `producao` e cuja compare é
   `1.111.0-ota-5`.
3. O Samu revisa e faz o merge. O deploy Git do site oficial publica
   `aquaapp.systems`.
4. Não faça merge de `producao` de volta na `1.111.0-ota-5` no dia a dia. Um
   ajuste que precise ir aos dois lugares entra primeiro na
   `1.111.0-ota-5`, passa pelo subdomínio, e sobe no pull request seguinte
   para `producao`.

## Conferir

No site oficial, o `robots.txt` segue com `Sitemap:` e a resposta não traz
`X-Robots-Tag`. No teste e na prévia, o `robots.txt` é só o bloqueio e o
header está presente.

```bash
curl -sS https://aquaapp.systems/robots.txt
curl -sSI https://aquaapp.systems/ | grep -i x-robots-tag
curl -sS https://teste.aquaapp.systems/robots.txt
curl -sSI https://teste.aquaapp.systems/ | grep -i x-robots-tag
curl -sS https://<projeto>.pages.dev/robots.txt
```

O resultado esperado fora de produção:

```text
User-agent: *
Disallow: /
```

```text
x-robots-tag: noindex, nofollow
```

No HTML desses hosts, o `<head>` inclui
`<meta name="robots" content="noindex, nofollow">`.
