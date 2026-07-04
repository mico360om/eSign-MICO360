; Inno Setup script — eSign MICO360 desktop client (MAUI).
; Produces a real setup.exe that installs the app to Program Files with Start
; Menu + Desktop shortcuts and an uninstall entry. Build:
;   & "C:\Users\<you>\AppData\Local\Programs\Inno Setup 6\ISCC.exe" client-installer.iss
#define AppName "eSign MICO360 Client"
#define AppVer  "1.0.0"
#define Pub     "MICO360 Softwares"
#define Exe     "EsignMico360.Client.Maui.exe"

[Setup]
AppId={{8C3F0D5B-2A4E-5B7C-AF32-1B2C3D4E5F60}}
AppName={#AppName}
AppVersion={#AppVer}
AppPublisher={#Pub}
DefaultDirName={autopf}\eSign MICO360\Client
DisableProgramGroupPage=yes
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64
OutputDir=..\..\..\Installers
OutputBaseFilename=eSignMico360-Client-Setup-{#AppVer}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName={#AppName}

[Files]
Source: "..\..\publish\client-win-x64\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion

[Icons]
Name: "{autoprograms}\eSign MICO360 Client"; Filename: "{app}\{#Exe}"
Name: "{autodesktop}\eSign MICO360 Client";  Filename: "{app}\{#Exe}"

[Run]
Filename: "{app}\{#Exe}"; Description: "Launch eSign MICO360 Client"; Flags: nowait postinstall skipifsilent
