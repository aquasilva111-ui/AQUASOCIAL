# PDS da AQUA

Servidor de dados pessoal (PDS) oficial do Bluesky, para a AQUA hospedar contas AT Protocol. A instalação no VPS já foi feita. Este documento não guarda senha, não muda DNS e não publica nada sozinho.

## Estado atual

| | |
| --- | --- |
| PDS | `https://pds.aquaapp.online` |
| DID do serviço | `did:web:pds.aquaapp.online` |
| Handles | `nome.aquaapp.online` (`PDS_SERVICE_HANDLE_DOMAINS=.aquaapp.online`) |
| Saúde | `https://pds.aquaapp.online/xrpc/_health` devolve a versão (`0.4.5051` na conferência) |
| Convite | `inviteCodeRequired=false` |
| SMTP | configurado, remetente `confirmation@aquaapp.online` |
| Captcha | o PDS não tem o gate do Bluesky (`/gate/signup`) |
| Site | `aquaapp.systems` continua sendo o site, não o PDS |

O build de produção (`EXPO_PUBLIC_ENV=production`, os perfis `production` e `production-apk` do EAS, o update OTA no canal `production` e `yarn build-web`) aponta o cadastro nativo para esse PDS e liga `EXPO_PUBLIC_AQUA_PDS_SIGNUP_ENABLED`. O Bluesky (`https://bsky.social`) continua como opção no seletor de provedor. Fora de produção, sem essas variáveis, o cadastro nativo fica desligado e o provedor padrão continua o Bluesky.

Depois de subir ou mudar de host, peça ao relay para ler o PDS. O `PDS_CRAWLERS=https://bsky.network` só anuncia o crawler. O pedido é outro comando, no VPS:

```bash
sudo pdsadmin request-crawl bsky.network
```

Sem isso o relay pode não consumir os repositórios novos. Confira em seguida o WebSocket `wss://pds.aquaapp.online/xrpc/com.atproto.sync.subscribeRepos?cursor=0`.

A 616 Network não entra neste servidor. A identidade AT Protocol continua isolada em `src/lib/aqua-identity/boundary-616.ts`.

## O que foi conferido

Fonte: [github.com/bluesky-social/pds](https://github.com/bluesky-social/pds), branch `main`.

| Peça | Valor conferido |
| --- | --- |
| Instalador | `https://raw.githubusercontent.com/bluesky-social/pds/main/installer.sh` |
| Compose que o instalador baixa | `https://raw.githubusercontent.com/bluesky-social/pds/main/compose.yaml` |
| Imagem no compose | `ghcr.io/bluesky-social/pds:0.4` |
| Tag mais recente do repositório | `v0.4.5051` |
| Porta dentro do container | `3000` (`PDS_PORT`) |
| Sistemas do instalador | Ubuntu 22.04, 24.04 e 26.04; Debian 11, 12 e 13 |
| Arquitetura | amd64 e arm64 |

A tag `:0.4` é a que o compose oficial usa. O Watchtower, incluído nesse compose, puxa imagem nova à meia-noite. A tag git `v0.4.5051` é o snapshot do código de distribuição no momento desta conferência, não um pin da imagem. `infra/pds/compose.yaml` repete o compose oficial, inclusive `GODEBUG=multipathtcp=0` no Caddy (CVE-2026-98432 em kernel sem patch). Não tire essa linha.

O instalador gera sozinho, dentro de `/pds/pds.env`:

- `PDS_JWT_SECRET` com `openssl rand --hex 16`
- `PDS_ADMIN_PASSWORD` com o mesmo comando
- `PDS_PLC_ROTATION_KEY_K256_PRIVATE_KEY_HEX` com `openssl ecparam --name secp256k1 --genkey --noout --outform DER | tail --bytes=+8 | head --bytes=32 | xxd --plain --cols 32`

Nada disso vai para o git. `infra/pds/pds.env.example` deixa os três vazios.

## Variáveis

Há dois nomes. Podem ser o mesmo host ou hosts diferentes. Os dois continuam por decidir.

| Nome | Onde | Exemplo (placeholder) | Função |
| --- | --- | --- | --- |
| `PDS_HOSTNAME` | `/pds/pds.env` | `pds.aquaapp.online` | Host HTTPS do PDS. Saúde em `https://pds.aquaapp.online/xrpc/_health`. |
| `PDS_SERVICE_HANDLE_DOMAINS` | `/pds/pds.env` | `.aquaapp.online` | Zona de handle. O ponto na frente é obrigatório. Sem o ponto, o processo recusa subir. |
| `EXPO_PUBLIC_AQUA_PDS_URL` | build do app | `https://pds.aquaapp.online` | Mesmo host, com `https://`, sem barra no fim. |
| `EXPO_PUBLIC_AQUA_HANDLE_DOMAIN` | build do app | `aquaapp.online` | A mesma zona, sem o ponto. |

Handle nativo: `<nome>.aquaapp.online`, um rótulo só. O nome continua limitado a 18 caracteres, no Bluesky e no PDS da AQUA, e o handle inteiro não passa de 253. O formulário recusa o que passa disso e volta para o passo do nome, sem abrir o captcha.

Dois jeitos válidos:

- Um nome só, que é o que o instalador oficial faz. Não é o arranjo deste PDS.
- Host do PDS separado da zona dos handles, que é o arranjo no ar: `PDS_HOSTNAME=pds.aquaapp.online` e `PDS_SERVICE_HANDLE_DOMAINS=.aquaapp.online`. O Caddy precisa listar os dois, senão `alice.aquaapp.online` não ganha certificado. O modelo está em `infra/pds/Caddyfile.example`.

`deploy/pds/` e os guias `docs/BACKEND-QUICKSTART.md` e `docs/BACKEND-COMPLETO.md` são um esboço anterior (o env deles chama `.env`, o oficial chama `pds.env`). O caminho deste documento é `infra/pds/`.

## Requisitos do VPS

Números da documentação oficial, para 1 a 20 contas:

| | |
| --- | --- |
| Sistema | Ubuntu 24.04 (o instalador também aceita 22.04, 26.04 e Debian 11/12/13) |
| RAM | 1 GB |
| CPU | 1 núcleo |
| Disco | 20 GB SSD |
| Arquitetura | amd64 ou arm64 |
| Rede | IPv4 público, nome DNS público, entrada nas portas 80/tcp e 443/tcp |

O disco cresce com os blobs. O limite de upload no exemplo é 300 MB (`PDS_BLOB_UPLOAD_LIMIT=314572800`). Com cadastro aberto, 20 GB acaba. Comece no mínimo oficial e olhe o disco antes de abrir o cadastro. 2 GB de RAM aguentam melhor quando já existem contas e blobs. A recomendação oficial para 1–20 pessoas continua 1 GB.

O instalador assume uma máquina nova, sem outro servidor web na 80/443. Não instale o PDS no VPS que já serve o site.

## Passo a passo na Hostinger

Nada disto foi executado por este repositório.

1. Escolha o domínio do PDS e, se for diferente, o domínio dos handles. Anote os dois. Não use `aquaapp.systems`.
2. Contrate um VPS KVM na Hostinger com Ubuntu 24.04, no mínimo 1 GB de RAM, 1 vCPU e 20 GB de SSD. Guarde o IPv4 público. Se o plano entregar IPv6 público, guarde também.
3. No firewall do VPS no hPanel, libere entrada TCP 80 e TCP 443 para a internet. Restrinja o SSH (TCP 22) ao seu IP. Não publique a porta 3000: o PDS escuta nela só para o Caddy, na própria máquina.
4. Entre por SSH como root. Confira `lsb_release -a` (Ubuntu 24.04) e que as portas 80 e 443 estão livres (`ss -ltnp`).
5. Crie o DNS da seção seguinte e espere resolver, da sua rede, o apex e um nome aleatório sob o curinga.
6. Baixe o instalador e leia antes de rodar. Ele instala Docker, escreve `/pds`, gera os segredos e sobe o systemd.

```bash
curl --fail --location --output installer.sh \
  https://raw.githubusercontent.com/bluesky-social/pds/main/installer.sh
less installer.sh
sudo bash installer.sh
```

O script pergunta o DNS público (o `PDS_HOSTNAME`) e um e-mail de contato para o certificado. Esse e-mail não precisa ser do domínio dos handles. Na pergunta de criar conta, pode responder não e criar a primeira conta depois, com `pdsadmin`, quando o DNS estiver estável.

7. Compare `/pds/compose.yaml` com `infra/pds/compose.yaml`. O instalador baixa o compose de `main` na hora. Se `main` tiver andado, leia o diff antes de confiar. A linha `GODEBUG=multipathtcp=0` precisa continuar.
8. A zona dos handles não é o `PDS_HOSTNAME`. `/pds/pds.env` precisa de `PDS_SERVICE_HANDLE_DOMAINS=.aquaapp.online` (com o ponto) e o Caddyfile precisa incluir `*.aquaapp.online`. O modelo está em `infra/pds/Caddyfile.example`. Depois: `sudo systemctl restart pds`.
9. Confira:

```bash
sudo systemctl status pds
sudo docker logs --tail 50 pds
curl --fail --silent "https://<PDS_HOSTNAME>/xrpc/_health"
```

A resposta é JSON com `version`, por exemplo `{"version":"0.4.x"}`. Sem isso o app não mostra o cadastro.

10. `sudo chmod 700 /pds` e confira que `/pds/pds.env` não é legível por outros usuários. O diretório já sai com `700` no instalador. Não copie esse arquivo para o site nem para o git.

O `ufw`, se estiver ativo, também precisa das portas 80 e 443. O instalador abre as duas quando encontra o `ufw`. O firewall do hPanel é outra camada: as duas têm que concordar.

## DNS

No provedor de DNS do domínio escolhido. TTL de 600 segundos é o que a doc oficial sugere. Troque o IP pelo IPv4 do VPS. Publique AAAA só se o VPS tiver IPv6 público, com o mesmo conjunto de nomes.

Zona única (`PDS_HOSTNAME` igual ao pai dos handles):

| Nome | Tipo | Valor |
| --- | --- | --- |
| `exemplo.com` | A | IPv4 do VPS |
| `*.exemplo.com` | A | IPv4 do VPS |
| `exemplo.com` | AAAA | IPv6 do VPS, se houver |
| `*.exemplo.com` | AAAA | IPv6 do VPS, se houver |

Host separado, que é o DNS deste PDS:

| Nome | Tipo | Valor |
| --- | --- | --- |
| `pds.aquaapp.online` | A | IPv4 do VPS |
| `*.aquaapp.online` | A | IPv4 do VPS |
| `pds.aquaapp.online` | AAAA | IPv6, se houver |
| `*.aquaapp.online` | AAAA | IPv6, se houver |

O curinga é obrigatório para conta nova: o handle `alice.exemplo.com` precisa chegar no PDS para o certificado e para `https://alice.exemplo.com/.well-known/atproto-did`. Alguns painéis pedem o nome `*`, outros `*.exemplo.com`.

Confira de fora, com o resolvedor público, estes nomes (tipo A e, se publicou, AAAA): o host do PDS, `aleatorio.<zona-dos-handles>` e outro nome qualquer sob o curinga. Os três apontam para o VPS. Espere a propagação antes de rodar o instalador. O certificado sob demanda falha se o nome ainda não resolver.

Não aponte `aquaapp.systems` nem `*.aquaapp.systems` para este VPS.

## SMTP

Sem SMTP o PDS sobe, mas não confirma e-mail e não envia a recuperação de senha. As duas variáveis entram juntas. Uma só faz o processo recusar a configuração.

```
PDS_EMAIL_SMTP_URL=smtps://usuario:senha@smtp.exemplo.com:465/
PDS_EMAIL_FROM_ADDRESS=noreply@exemplo.com
```

O endereço de origem precisa ser um remetente que o provedor autoriza. A doc oficial cita Resend (`smtps://resend:<chave>@smtp.resend.com:465/`) e SendGrid como serviços prontos, ou um SMTP comum. Sendmail local, se existir na mesma máquina: `smtp:///?sendmail=true`.

Caractere especial no usuário ou na senha vai percent-encoded. `@` vira `%40`, `&` vira `%26`. A senha fica só em `/pds/pds.env`.

Depois de gravar: `sudo systemctl restart pds`. Teste um `requestPasswordReset` numa conta de prova e veja `sudo docker logs pds`. Se o e-mail não sair, o código de confirmação também fica na tabela `email_token` de `account.sqlite`. Isso é socorro, não o caminho normal.

O app já chama `com.atproto.server.requestPasswordReset` e `resetPassword` no `EXPO_PUBLIC_AQUA_PDS_URL`. Conta de outro PDS (bsky.social) recupera a senha no PDS dela.

## Backups

O dado mora em `/pds`. Parar o serviço é o jeito simples de copiar sem corromper SQLite (as bases usam WAL).

```bash
sudo systemctl stop pds
sudo tar -C / -czf "/root/pds-$(date +%F).tar.gz" pds
sudo systemctl start pds
curl --fail --silent "https://<PDS_HOSTNAME>/xrpc/_health"
```

O que essa cópia precisa conter:

- `/pds/pds.env` — senha de admin, segredo JWT e a chave de rotação PLC. Perder a chave de rotação impede o PDS de rotacionar as chaves PLC das contas que ele registrou. Guarde uma cópia cifrada fora do VPS e fora do git.
- `/pds/account.sqlite` — contas, e-mail, convites.
- `/pds/sequencer.sqlite` — cursor do relay. Sem ele, o relay dessincroniza.
- `/pds/did_cache.sqlite` — cache, dá para reconstruir, mas entra no tar.
- `/pds/actors/` — repositórios.
- `/pds/blocks/` — blobs.
- `/pds/caddy/` — certificados. Dá para reemitir. Incluir evita uma janela sem TLS.
- `/pds/caddy/etc/caddy/Caddyfile` e `/pds/compose.yaml`.

Copie o tar para outro lugar no mesmo dia. Um disco só no VPS não é backup. Restaure uma vez numa máquina de teste, com outro nome, antes de precisar. Não restaure por cima de um hostname que já federou: a doc oficial manda migrar conta a conta quando o host muda. Apagar e reinstalar no mesmo nome dessincroniza o relay (`bsky.network`).

Permissão: o tar tem segredo. `chmod 600` nele.

## Atualização

O Watchtower sobe no compose e puxa imagem à meia-noite (`WATCHTOWER_SCHEDULE=@midnight`, `WATCHTOWER_CLEANUP=true`). Para atualizar na hora:

```bash
sudo pdsadmin update
curl --fail --silent "https://<PDS_HOSTNAME>/xrpc/_health"
sudo docker logs --tail 80 pds
```

`pdsadmin update` baixa de novo o `compose.yaml` de `main`, faz pull e reinicia o systemd. Leia o diff do compose quando o comando disser que o arquivo mudou. Logs: `journalctl --unit pds` e `sudo docker logs pds`.

Não troque o hostname e não apague `/pds` para "atualizar".

## Monitoramento

- Saúde: `curl --fail --silent https://<PDS_HOSTNAME>/xrpc/_health`. Vale um cron ou o monitor da Hostinger nesse URL. O app usa o mesmo caminho antes de mostrar o cadastro.
- WebSocket do relay, para a rede enxergar os repositórios: `wss://<PDS_HOSTNAME>/xrpc/com.atproto.sync.subscribeRepos?cursor=0`. Logo depois da instalação a conexão fica quieta até existir um evento. A doc oficial sugere o `wsdump` para o teste.
- Logs: `sudo docker logs -f pds`. Não sobrevivem a um recreate, a menos que `LOG_DESTINATION=/pds/pds.log` esteja no env. `LOG_LEVEL=info` é o padrão.
- Disco: `df -h /pds`. Alerta antes de 80%.
- O diretório `monitoring/` do repositório oficial sobe Prometheus, Grafana e node_exporter à parte, em `127.0.0.1`. Não abre porta. O acesso é por túnel SSH. Variáveis `OTEL_*` vão para `/pds/pds.env`. `pdsadmin update` não mexe nesse stack. É opcional.

## Convites, limite e abuso

O exemplo liga as duas travas do servidor:

- `PDS_INVITE_REQUIRED=true` — `createAccount` sem código falha.
- `PDS_RATE_LIMITS_ENABLED=true` — limite no PDS. O limite da aba do app (5 entradas em 15 minutos, 3 cadastros por hora) não substitui este.

Código de convite, um uso:

```bash
sudo pdsadmin create-invite-code
```

Conta pela linha de comando (gera senha e convite, imprime a senha uma vez):

```bash
sudo pdsadmin account create alice@exemplo.com alice.exemplo.com
sudo pdsadmin account list
sudo pdsadmin account takedown did:plc:...
```

`pdsadmin` exige root e lê `/pds/pds.env`. A senha de admin não vai na linha de comando se você usa esses scripts.

Enquanto o PDS exigir convite, o build do app precisa de `EXPO_PUBLIC_AQUA_IDENTITY_INVITE_REQUIRED=true`. Sem isso o formulário não pede o código e o PDS recusa.

hCaptcha, se quiser uma trava a mais no PDS, são três variáveis juntas: `PDS_HCAPTCHA_SITE_KEY`, `PDS_HCAPTCHA_SECRET_KEY`, `PDS_HCAPTCHA_TOKEN_SALT`. O app tem as flags `EXPO_PUBLIC_AQUA_IDENTITY_CAPTCHA_ENABLED` e `EXPO_PUBLIC_AQUA_IDENTITY_CAPTCHA_SITE_KEY`. A checagem no navegador não prova o token. Quem prova é o PDS ou o BFF.

Abrir o cadastro sem convite é `PDS_INVITE_REQUIRED=false` e um restart. Faça isso só com SMTP, backup testado, alerta de disco e alguém olhando `pdsadmin account list`. Conta abusiva: `pdsadmin account takedown <DID>`.

## Cadastro no app

O build de produção já sai com:

| Variável | Valor |
| --- | --- |
| `EXPO_PUBLIC_AQUA_PDS_URL` | `https://pds.aquaapp.online` |
| `EXPO_PUBLIC_AQUA_HANDLE_DOMAIN` | `aquaapp.online` |
| `EXPO_PUBLIC_AQUA_PDS_SIGNUP_ENABLED` | `true` |
| `EXPO_PUBLIC_AQUA_IDENTITY_INVITE_REQUIRED` | `false` |

`EXPO_PUBLIC_ENV=production` liga os mesmos padrões quando as variáveis ficam vazias. `false` explícito desliga de novo. TestFlight e o desenvolvimento local, sem essas variáveis, continuam no Bluesky.

Onde isso entra:

- `eas.json`, perfis `production` e `production-apk`
- o workflow de OTA quando o canal é `production`
- `yarn build-web`, o export do site

O fluxo "Criar conta" abre em `https://pds.aquaapp.online`. No seletor há Aqua, Bluesky (`https://bsky.social`) e um servidor customizado. Conta no Bluesky ainda passa pelo gate `/gate/signup` quando o `describeServer` pede `phoneVerificationRequired`. Conta no PDS da AQUA não mostra esse captcha: o servidor não tem gate, e o app não avança para esse passo nem manda erro de handle para lá.

`/register` da AQUA Identity só mostra o formulário com URL, flag, domínio e `GET /xrpc/_health` devolvendo `version`. A senha vai num único `createAccount` e não volta no registro da conta.

Convite não é pedido. O `describeServer` ao vivo responde `inviteCodeRequired: false`.

## Domínio próprio, com o mesmo DID

A conta é o DID (`did:plc:...`), criado no `createAccount` e gravado no PLC (`PDS_DID_PLC_URL`, padrão `https://plc.directory`). O handle é um nome. Trocar o handle não troca o DID, o repositório, os blobs nem as chaves que ficam no PDS da AQUA.

Dois caminhos publicam o mesmo DID:

1. Handle hospedado pelo PDS, `<nome>.<zona>`. O curinga manda o nome para o VPS. O Caddy tira o certificado. O PDS responde `https://<nome>.<zona>/.well-known/atproto-did` com o DID em texto puro, se o nome termina numa zona de `PDS_SERVICE_HANDLE_DOMAINS`.
2. Domínio da própria pessoa, por exemplo `ada.outro.com` ou o apex que ela controla. O PDS da AQUA não hospeda esse nome. A pessoa publica um dos dois, no DNS ou no site dela:
   - TXT `_atproto.<handle>` com valor `did=<DID>`
   - `https://<handle>/.well-known/atproto-did` com o DID sozinho no corpo, `text/plain`

O app (`verifyHandleDid`) tenta o HTTPS primeiro e depois o TXT via DNS-over-HTTPS. Se o DID publicado for o da conta, chama `com.atproto.identity.updateHandle`. O registro local continua na mesma chave, o DID. Voltar para `<nome>.<zona da AQUA>` é a mesma chamada. A tela está em `/settings/identity`.

Sem a publicação, a troca não acontece. Sem sessão no PDS, a tela mostra o plano e não finge que o handle mudou.

## Riscos

- Federação: com `PDS_CRAWLERS=https://bsky.network` o repositório vai para o relay. Conteúdo público é público fora da AQUA.
- O DID e o handle resolvem no PLC e no DNS. Não são dados privados.
- `/pds/pds.env` é a senha de admin, o JWT e a chave de rotação. Vazar ou perder esse arquivo é o incidente grave.
- Cadastro sem convite enche disco e atrai abuso. A trava da aba do navegador não segura um cliente modificado.
- Zona de handle errada cria conta cujo nome não resolve. O app recusa handle fora de `EXPO_PUBLIC_AQUA_HANDLE_DOMAIN`, e o PDS recusa handle fora de `PDS_SERVICE_HANDLE_DOMAINS`. Os dois precisam ser a mesma zona.
- Usar `aquaapp.systems` mistura o site com o PDS nas portas 80/443.
- Instalar no VPS do site derruba o que já escuta nessas portas.
- Watchtower e `pdsadmin update` seguem `main`. Uma imagem nova pode exigir leitura do changelog antes de ficar sem supervisão.
- Reinstalar no mesmo hostname dessincroniza o relay.
- Sem SMTP não há verificação nem recuperação.
- 1 GB é o mínimo oficial, não uma folga.
- Firewall do hPanel e `ufw` são camadas diferentes. Uma fechada deixa o `_health` inacessível e o app esconde o cadastro.
- O cliente OAuth público continua com sessão no IndexedDB, como em `docs/aqua-identity.md`. Este PDS não muda isso. O serviço confidencial é `aqua-identity-service/`, à parte.
- A 616 não lê este PDS e este PDS não lê a 616.

## Checklist de produção

- [x] PDS no ar em `https://pds.aquaapp.online`, handles `.aquaapp.online`, SMTP com `confirmation@aquaapp.online`, convite desligado.
- [ ] `sudo pdsadmin request-crawl bsky.network` já rodou e o relay enxerga o host.
- [ ] `https://pds.aquaapp.online/xrpc/_health` devolve `version`.
- [ ] Caddy cobre o host e o curinga da zona. `GODEBUG=multipathtcp=0` presente.
- [ ] `/pds/pds.env` com segredos gerados no servidor, modo restrito, cópia cifrada fora do VPS. Nada disso no git.
- [ ] SMTP testado (confirmação ou reset chega).
- [ ] `PDS_INVITE_REQUIRED=true` e `PDS_RATE_LIMITS_ENABLED=true`.
- [ ] Backup com tar testado numa restauração de leitura.
- [ ] Uma conta de prova criada com `pdsadmin`, handle na zona certa, DID anotado.
- [ ] WebSocket do relay conecta.
- [x] Build de produção aponta para o PDS da AQUA, com Bluesky ainda selecionável e sem captcha nesse PDS.
- [ ] Domínio próprio de teste: TXT ou well-known com o mesmo DID, `updateHandle`, DID inalterado.

## O que ainda depende do Samu

1. Rodar `sudo pdsadmin request-crawl bsky.network` se o relay ainda não estiver lendo `pds.aquaapp.online`.
2. Manter o backup cifrado de `/pds/pds.env` fora do git.
3. Publicar um build de produção (site ou app) para o cadastro nativo chegar em quem usa o app. Este branch não faz merge.
