# Correção completa do build Windows (PyInstaller) — Assunção & Paladini

## O que é
Entrega do código completo e corrigido do pipeline de empacotamento Windows do repo `smardigo/0811` (PDV desktop: FastAPI + pywebview + mongod portátil + React), resolvendo o erro `PackageNotFoundError: No package metadata was found for fastapi` e os dois bugs latentes que quebrariam o build logo em seguida.

## Para quem é
Quem cria a tag `v*` no GitHub e espera que o Actions gere o `.exe` (Inno Setup) e o `.msi` (WiX) na aba Releases sem falhar.

## Causa raiz (confirmada na análise do repo + logs)
1. **Deps do backend não chegam ao Python do build**: `backend/requirements.txt` inclui pacotes que falham no runner Windows (`jq>=1.6.0` sem wheel estável p/ cp311, `emergentintegrations==0.2.2`, dev-deps). O pip instala tudo numa transação só — se um pacote falha, **nada** é instalado; o shell `pwsh` não propaga o erro (o último comando sai 0) e o passo fica verde. O PyInstaller então não encontra fastapi/motor/etc. e explode na linha 31 (`copy_metadata`).
2. **Bug de caminho**: o PyInstaller roda em `desktop/` e grava em `desktop/dist/`, mas os passos seguintes (mongod, frontend, WiX, Inno) montam a partir do `dist/` da raiz — o instalador sairia sem o `.exe`.
3. **Bundling frágil do backend**: o spec copia `server.py` como dado solto em vez de congelá-lo no grafo de imports (runtime fica dependente de resolução de namespace package).

## O que a correção entrega
- **`backend/requirements-build.txt`** (novo): só as dependências de runtime do `server.py` (fastapi, uvicorn, motor, pymongo, pydantic, bcrypt, pyjwt, passlib, python-dotenv, email-validator, python-multipart, tzdata) — sem jq/dev-deps que travam o runner.
- **`.github/workflows/build-windows.yml` corrigido**: cada `pip install` propaga falha (`$LASTEXITCODE`); preflight que importa todas as deps e aponta por nome o que faltar; PyInstaller invocado com `--distpath ../dist --workpath ../build` para gerar no `dist/` da raiz; demais passos (mongod 7.0.14, bundle React, Inno, WiX, artifacts, release) mantidos.
- **`desktop/server.spec` corrigido**: verificação explícita que lista tudo o que está ausente antes de coletar; remoção da linha fatal `copy_metadata(...)` (redundante — `collect_all` já copia metadados); `pathex=[".."]` + `hiddenimports=["backend.server"]` para congelar o backend no PYZ; coleta de `pythonnet`/`clr_loader` para a janela pywebview abrir no exe.
- **`desktop/launcher.py` endurecido**: log de crash em `%APPDATA%/AssuncaoPaladini/logs/launcher.log` + caixa de mensagem no Windows se o app não subir — fim do "abre e fecha sem explicar".
- **Prova antes da entrega**: o spec corrigido é validado rodando o PyInstaller aqui (Linux, deps presentes) até gerar o pacote; e a falha atual é replicada sem as deps para mostrar o preflight barrando com mensagem clara. (A execução final do `.exe` só é possível em Windows — declarado como limitação.)

## Fase 1 — o que será feito agora
1. Criar `backend/requirements-build.txt` com as deps de runtime do backend.
2. Reescrever `.github/workflows/build-windows.yml` (instalação fail-fast + preflight + caminhos de dist corrigidos).
3. Reescrever `desktop/server.spec` (verificação + collect_all + backend congelado + webview/pythonnet).
4. Endurecer `desktop/launcher.py` (crash log + mensagem de erro visível).
5. Validar o build com PyInstaller no ambiente atual e replicar o modo de falha para provar o preflight; entregar os 4 arquivos prontos para colar no repo.
