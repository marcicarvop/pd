# Assunção & Paladini — App Desktop para Windows

Este repositório, além do app web, inclui um empacotador que transforma o PDV em um **programa Windows** com instalador `.exe` (Inno Setup) e `.msi` (WiX). Tudo roda **offline**, com um MongoDB embarcado.

## Como funciona

```
┌─────────────────────────────────────────────────────┐
│  AssuncaoPaladini.exe (janela pywebview)            │
│  ├─ inicia mongod.exe em 127.0.0.1:27070 (embedded) │
│  ├─ inicia FastAPI (uvicorn) em 127.0.0.1:8991      │
│  └─ abre janela apontando para a UI React servida   │
│      pelo próprio backend                           │
└─────────────────────────────────────────────────────┘
```

- Os dados ficam em `%APPDATA%\AssuncaoPaladini\mongo-data`.
- Os logs ficam em `%APPDATA%\AssuncaoPaladini\logs`.
- O segredo JWT é gerado na primeira execução e guardado em `%APPDATA%\AssuncaoPaladini\secret.key`.
- Nenhum tráfego vai pra internet.

## Gerar o instalador

**Você não precisa ter Windows.** O workflow do GitHub Actions faz tudo. Basta:

1. Enviar o código ao GitHub (botão **Save to GitHub** do Emergent).
2. Entrar no repositório → aba **Actions** → workflow **Build Windows Installer** → **Run workflow** e informar a versão (ex.: `1.0.0`). Ou criar uma **tag** `v1.0.0` e dar push para disparar automaticamente.
3. Aguardar ~10 min. Ao final, baixe os arquivos na aba **Releases** (ou no artefato `AssuncaoPaladini-Windows-...`).

Resultado:
- `AssuncaoPaladini-Setup-1.0.0.exe` (Inno Setup)
- `AssuncaoPaladini-1.0.0.msi` (WiX)

## Rodar localmente (opcional, Windows + Python 3.11)

```powershell
# 1) build do frontend
cd frontend
"REACT_APP_BACKEND_URL=" > .env.production.local
yarn install && yarn build

# 2) baixar mongod.exe portátil e copiar p/ mongodb\bin\
#    (baixe de https://www.mongodb.com/try/download/community — "Windows x64")

# 3) instalar deps e abrir a janela
cd ..
pip install -r backend/requirements.txt
pip install -r desktop/requirements.txt
python desktop/launcher.py
```

## Primeiro login

Usuário `admin` · senha `admin123` · PIN `1234`.
No menu **Usuários**, altere a senha e o PIN antes de usar em produção.

## Correções do build (v1.0.8)

O erro `PackageNotFoundError: No package metadata was found for fastapi` vinha do
`pip install -r backend/requirements.txt`: `emergentintegrations` (depende de um pacote fora do
PyPI) e `jq` (sem versão pronta para Windows/Python 3.11) faziam o pip não instalar nada, e o passo
ficava verde mesmo assim. O que mudou:

- `backend/requirements-build.txt`: só as dependências que o `server.py` usa, para o build Windows.
- Workflow: todo comando confere o código de saída; uma checagem importa as dependências e o
  `backend.server` antes do PyInstaller; o PyInstaller gera em `dist/` na raiz; o `.exe`
  passa por um teste de inicialização (`AP_HEADLESS=1`) antes dos instaladores.
- `desktop/server.spec`: lista pelo nome o que estiver faltando; o backend vai congelado dentro do exe.
- `desktop/launcher.py`: erros de início vão para `%APPDATA%\AssuncaoPaladini\logs\launcher.log`
  e aparecem numa caixa de mensagem.
- Instaladores: GUIDs válidos no `Product.wxs`, o `v` da tag é removido da versão e o `app.ico`
  passou a ser opcional no Inno Setup.

Versões aceitas: `1.2.3` ou `1.2.3.4` (tag `v1.2.3`).
