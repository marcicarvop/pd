; Assunção & Paladini — Inno Setup script
; Compile with: iscc installer\inno-setup.iss

#define MyAppName "Assunção & Paladini"
#define MyAppExeName "AssuncaoPaladini.exe"
#define MyAppPublisher "Assunção & Paladini"
#define MyAppVersion GetEnv("APP_VERSION")
#if MyAppVersion == ""
  #define MyAppVersion "1.0.0"
#endif

[Setup]
AppId={{B7A1D5F2-6B84-4FD0-9B8C-ASSUNCAOPALADINI}}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\AssuncaoPaladini
DefaultGroupName=Assunção & Paladini
DisableProgramGroupPage=no
OutputDir=..\dist-installer
OutputBaseFilename=AssuncaoPaladini-Setup-{#MyAppVersion}
Compression=lzma2/ultra
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\{#MyAppExeName}
#if FileExists(AddBackslash(SourcePath) + "app.ico")
SetupIconFile=app.ico
#endif
; SignTool=standard /d $qAssunção & Paladini$q $f

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Tasks]
Name: "desktopicon"; Description: "Criar atalho na área de trabalho"; GroupDescription: "Atalhos"; Flags: unchecked

[Files]
Source: "..\dist\AssuncaoPaladini\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\Desinstalar {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Abrir Assunção & Paladini agora"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: files; Name: "{userappdata}\AssuncaoPaladini\logs\*.log"
; NOTE: we do NOT delete {userappdata}\AssuncaoPaladini\mongo-data — preserve the shop's data
