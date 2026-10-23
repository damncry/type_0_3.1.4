#define MyAppName "type_0"
#define MyAppVersion "3.1.4"
#define MyAppPublisher "type_0"
#define MyAppExeName "type_0.exe"
#define MyAppSource "dist\type_0"

[Setup]
AppId={{8F4E7B95-138D-4C25-A88C-4D8B82D70D03}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={localappdata}\Programs\type_0
DefaultGroupName=type_0
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=installer_output
OutputBaseFilename=type_0_Setup_3.1.4
SetupIconFile=assets\type_0.ico
UninstallDisplayIcon={app}\type_0.exe
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
RestartApplications=no
Uninstallable=yes
VersionInfoVersion=3.1.4.0
VersionInfoProductVersion=3.1.4
VersionInfoCompany=type_0
VersionInfoDescription=type_0 System Monitor

[Languages]
Name: "russian"; MessagesFile: "compiler:Languages\Russian.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Создать ярлык на рабочем столе"; GroupDescription: "Дополнительные ярлыки:"; Flags: unchecked

[Files]
Source: "{#MyAppSource}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\type_0"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\type_0"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Запустить type_0"; Flags: nowait postinstall skipifsilent
