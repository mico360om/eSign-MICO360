; Inno Setup script — eSign MICO360 .NET Server.
; Produces a real setup.exe that installs the app to Program Files and registers
; it as an auto-start Windows Service (config + JWT key + firewall via the
; bundled PowerShell script). Build:
;   & "C:\Users\<you>\AppData\Local\Programs\Inno Setup 6\ISCC.exe" server-installer.iss
#define AppName "eSign MICO360 Server"
#define AppVer  "1.0.0"
#define Pub     "MICO360 Softwares"

[Setup]
AppId={{7B2E9C4A-1F3D-4A6B-9E21-0A1B2C3D4E5F}}
AppName={#AppName}
AppVersion={#AppVer}
AppPublisher={#Pub}
DefaultDirName={autopf}\eSign MICO360\Server
DisableProgramGroupPage=yes
DisableDirPage=auto
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64
OutputDir=..\..\..\Installers
OutputBaseFilename=eSignMico360-Server-Setup-{#AppVer}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName={#AppName}

[Files]
Source: "..\..\publish\server-win-x64\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion
Source: "install-server-service.ps1";     DestDir: "{app}"; Flags: ignoreversion
Source: "uninstall-server-service.ps1";   DestDir: "{app}"; Flags: ignoreversion

[UninstallRun]
Filename: "powershell.exe"; \
  Parameters: "-ExecutionPolicy Bypass -NoProfile -File ""{app}\uninstall-server-service.ps1"""; \
  Flags: runhidden waituntilterminated; RunOnceId: "RemoveEsignService"

[Code]
var
  CfgPage: TInputQueryWizardPage;

procedure InitializeWizard;
begin
  CfgPage := CreateInputQueryPage(wpSelectDir,
    'Server configuration',
    'Admin login and listening ports',
    'Applied on first run: the admin password sets the seeded ''admin'' account; the ports are where the API listens (HTTPS uses a self-signed certificate).');
  CfgPage.Add('Admin password:', True);
  CfgPage.Add('HTTP port:', False);
  CfgPage.Add('HTTPS port:', False);
  CfgPage.Values[0] := ExpandConstant('{param:ADMINPW}');
  CfgPage.Values[1] := ExpandConstant('{param:PORT|5212}');
  CfgPage.Values[2] := ExpandConstant('{param:HTTPSPORT|5213}');
end;

function GetPw(): String;
begin
  Result := CfgPage.Values[0];
end;

function GetHttpPort(): String;
begin
  Result := Trim(CfgPage.Values[1]);
  if Result = '' then Result := '5212';
end;

function GetHttpsPort(): String;
begin
  Result := Trim(CfgPage.Values[2]);
  if Result = '' then Result := '5213';
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if (CurPageID = CfgPage.ID) and (Trim(GetPw) = '') then
  begin
    MsgBox('Please enter an admin password.', mbError, MB_OK);
    Result := False;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  RC: Integer;
  Params: String;
begin
  if CurStep = ssPostInstall then
  begin
    if Trim(GetPw) = '' then
    begin
      MsgBox('No admin password supplied. For silent installs pass /ADMINPW=YourPassword. Skipping service setup.', mbError, MB_OK);
      Exit;
    end;
    Params := '-ExecutionPolicy Bypass -NoProfile -File "' + ExpandConstant('{app}\install-server-service.ps1') +
              '" -AdminPassword "' + GetPw + '" -HttpPort ' + GetHttpPort + ' -HttpsPort ' + GetHttpsPort;
    if not Exec('powershell.exe', Params, '', SW_HIDE, ewWaitUntilTerminated, RC) then
      MsgBox('Could not launch the service installer.', mbError, MB_OK)
    else if RC <> 0 then
      MsgBox('Service setup returned error code ' + IntToStr(RC) + '. Check Event Viewer > Windows Logs > Application.', mbError, MB_OK);
  end;
end;
