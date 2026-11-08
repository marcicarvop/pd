# SPEC — Correção do build Windows (smardigo/0811)

Entrega: arquivos corrigidos em `/app/windows-build-fix/` (e `/app/windows-build-fix.zip`) para o
pipeline GitHub Actions que empacota o PDV (FastAPI + pywebview + mongod portátil + React) em .exe/.msi.
Não é um app web; o template FastAPI/React em /app não foi alterado.

Validado aqui (Linux, Python 3.11, PyInstaller 6.22.3):
- spec original + venv sem deps → reproduz `PackageNotFoundError: fastapi`
- spec novo + venv sem deps → preflight lista as deps ausentes
- spec novo + requirements-build.txt → build OK em `dist/AssuncaoPaladini`; exe congelado sobe mongod + backend (seed + /api/)
- sem mongod → launcher.log + exit 1
Não validável aqui: execução no Windows (EdgeChromium/pythonnet), Inno Setup e WiX.
