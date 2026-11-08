# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec for the Assunção & Paladini POS desktop launcher.
#
# Build (from desktop/):
#   python -m PyInstaller server.spec --noconfirm --distpath ../dist --workpath ../build
# Produces: dist/AssuncaoPaladini/AssuncaoPaladini.exe  (repo-root dist/)
import importlib.util
import os
import sys

from PyInstaller.utils.hooks import collect_all, collect_data_files, collect_submodules

SPEC_DIR = os.path.dirname(os.path.abspath(SPEC))  # noqa: F821  (SPEC is injected by PyInstaller)
REPO_ROOT = os.path.abspath(os.path.join(SPEC_DIR, ".."))
IS_WIN = sys.platform == "win32"

# ---------------------------------------------------------------------------
# 1) Preflight: fail with a clear list instead of a cryptic metadata traceback
# ---------------------------------------------------------------------------
REQUIRED = {
    # import name -> pip package
    "fastapi": "fastapi",
    "starlette": "starlette",
    "uvicorn": "uvicorn",
    "motor": "motor",
    "pymongo": "pymongo",
    "pydantic": "pydantic",
    "pydantic_core": "pydantic-core",
    "bcrypt": "bcrypt",
    "jwt": "pyjwt",
    "dotenv": "python-dotenv",
    "email_validator": "email-validator",
    "multipart": "python-multipart",
    "tzdata": "tzdata",
    "webview": "pywebview",
}
if IS_WIN:
    REQUIRED.update({"clr_loader": "clr-loader", "pythonnet": "pythonnet"})

missing = [pkg for mod, pkg in REQUIRED.items() if importlib.util.find_spec(mod) is None]
if missing:
    raise SystemExit(
        "\n[server.spec] Dependencias ausentes no Python que esta rodando o PyInstaller:\n"
        f"  interpretador: {sys.executable}\n"
        f"  faltando     : {', '.join(missing)}\n"
        "Instale com:  python -m pip install -r backend/requirements-build.txt -r desktop/requirements.txt\n"
    )

# ---------------------------------------------------------------------------
# 2) Collect packages (collect_all already copies each package's dist-info
#    metadata, so the old copy_metadata(...) line is not needed)
# ---------------------------------------------------------------------------
datas = []
binaries = []
hiddenimports = [
    # backend frozen into the PYZ (launcher does `from backend.server import app`)
    "backend",
    "backend.server",
    # uvicorn picks these by string at runtime
    "uvicorn.logging",
    "uvicorn.loops.auto",
    "uvicorn.loops.asyncio",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.http.h11_impl",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan.on",
    "uvicorn.lifespan.off",
    # imported lazily inside server.py when SERVE_FRONTEND=1
    "fastapi.responses",
    "fastapi.staticfiles",
    "email_validator",
    "multipart",
    "dns",  # pymongo optional SRV support, harmless if absent
]

for pkg in ("fastapi", "starlette", "uvicorn", "motor", "pymongo", "bson", "gridfs",
            "pydantic", "pydantic_core", "email_validator", "tzdata"):
    d, b, h = collect_all(pkg)
    datas += d
    binaries += b
    hiddenimports += h

# pywebview: skip the backends that can't import on Windows (android/gtk/qt/cocoa)
_SKIP_WEBVIEW = ("webview.platforms.android", "webview.platforms.gtk",
                 "webview.platforms.qt", "webview.platforms.cocoa")
hiddenimports += collect_submodules(
    "webview", filter=lambda name: not name.startswith(_SKIP_WEBVIEW)
)
datas += collect_data_files("webview")  # includes lib/*.dll used by EdgeChromium

if IS_WIN:
    # EdgeChromium (WinForms) backend runs on pythonnet -> clr_loader
    for pkg in ("clr_loader", "pythonnet"):
        d, b, h = collect_all(pkg)
        datas += d
        binaries += b
        hiddenimports += h
    hiddenimports += ["clr"]

block_cipher = None

a = Analysis(
    [os.path.join(SPEC_DIR, "launcher.py")],
    pathex=[REPO_ROOT],  # makes the `backend` package importable for analysis
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter", "pytest", "black", "mypy", "IPython"],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

_icon = os.path.join(REPO_ROOT, "installer", "app.ico")

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="AssuncaoPaladini",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    icon=_icon if os.path.exists(_icon) else None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="AssuncaoPaladini",
)
