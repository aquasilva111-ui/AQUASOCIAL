# aqua-personal-git

Núcleo do Git pessoal semântico da AQUA (desenho em `../docs/personal-git.md`):
JSON canônico + SHA-256, commits semânticos encadeados, diff campo a campo,
revert, rollback, verificação e exportação/importação conferindo hashes.

Sem I/O e sem dependências (só `node:crypto`). Quem guarda (PDS para o branch
público, cofre cifrado para o privado) é outra camada.

```bash
npm install
npm test
```
