# Correção do build Windows (PyInstaller) — repo smardigo/0811

Copie estes arquivos por cima do repositório, mantendo os mesmos caminhos:

| Arquivo | Ação |
|---|---|
| `backend/requirements-build.txt` | **novo** — só as dependências de runtime do `server.py` |
| `backend/__init__.py` | **novo** — torna `backend` um pacote normal (congelamento confiável) |
| `.github/workflows/build-windows.yml` | substituir |
| `desktop/server.spec` | substituir |
| `desktop/launcher.py` | substituir |
| `desktop/requirements.txt` | substituir |
| `installer/inno-setup.iss` | substituir |
| `installer/wix/Product.wxs` | substituir |

## Causa do erro `No package metadata was found for fastapi`
`backend/requirements.txt` tem `emergentintegrations==0.2.2` (depende de um wheel privado
fora do PyPI, então o pip não resolve) e `jq` (sem wheel para Windows/cp311). O pip
cancela a instalação inteira — nada é instalado — mas no `pwsh` o passo termina com o
código do último comando (`pip install pyinstaller pywebview`, que funciona) e fica verde.
O PyInstaller roda sem fastapi/motor/etc. → `copy_metadata("fastapi")` explode.

## Outros problemas que quebrariam o build logo depois (também corrigidos)
1. O PyInstaller gravava em `desktop/dist/`, mas mongod/frontend/Inno/WiX usam `dist/` da raiz.
2. `server.py` ia como arquivo solto; agora fica congelado no PYZ (`backend.server`).
3. GUIDs inválidos no `Product.wxs` (`...-ap000msi001` não é hexadecimal) → o `candle` falharia.
4. Tag `v1.0.0` virava versão `v1.0.0` → inválida no WiX. Agora o `v` é removido e o formato é validado.
5. `SetupIconFile=app.ico` sem o arquivo no repo → o Inno falharia. Agora o ícone é opcional.
6. Exe com `console=False` fechava sem explicar. Agora: log em
   `%APPDATA%\AssuncaoPaladini\logs\launcher.log` + caixa de mensagem com o erro.

## Novo no workflow
- Cada comando confere `$LASTEXITCODE` (falha de verdade = passo vermelho).
- Preflight: importa todas as deps e o `backend.server` antes do PyInstaller.
- Smoke test: roda o `.exe` congelado (`AP_HEADLESS=1`), sobe mongod + backend e confere `/api/`.

## Gerar
Crie a tag (`git tag v1.0.8 && git push origin v1.0.8`) ou use **Actions → Run workflow**
com uma versão `1.2.3` ou `1.2.3.4`.
