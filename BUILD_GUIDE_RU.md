# type_0 3.1.4 — руководство по сборке на Windows

## Что необходимо

- Windows 10/11 x64.
- Python 3.12 x64 (рекомендуется); также поддерживаются Python 3.11 и 3.13. В установщике Python включи Python Launcher.
- Inno Setup 6 — если нужен Setup.exe.
- Интернет на первом запуске для скачивания Python/npm-зависимостей. Если Node.js не установлен, сценарий попробует скачать официальный портативный Node.js 22 LTS и сверить SHA-256.
- Microsoft Edge WebView2 Runtime для показа интерфейса; на большинстве обновлённых Windows он уже есть.

## Сборка одним действием

1. Распакуй весь ZIP в локальную папку, например `C:\Build\type_0`. Не запускай батники прямо из окна архиватора.
2. Дважды запусти `build_exe.bat`.
3. Сценарий сначала проверит Python и установит `requirements.txt`, включая `pywebview`, `psutil`, `pystray`, Pillow, Python.NET и `clr_loader`.
4. Затем он проверит Node.js/npm. Если совместимого Node.js не найдено, `setup_node.ps1` загрузит портативный Node.js 22 LTS в `.build_tools`. Папка не добавляется в системный PATH и не устанавливает Node глобально.
5. Сценарий установит npm-пакеты, выполнит `npm run build`, проверит `out\index.html`, затем соберёт PyInstaller `onedir`.
6. Результаты:
   - `dist\type_0\type_0.exe` — запускай из этой папки, не отделяя EXE от `_internal`.
   - `installer_output\type_0_Setup_3.1.4.exe` — если найден Inno Setup 6.

Загрузка Node.js проверяется по SHA-256 из официального `nodejs.org`. Никакие исполняемые файлы не запускаются из сторонних зеркал.

## Если Node.js подготовился, но приложение не появилось

Не запускай `setup_node.ps1` как самостоятельную сборку: он только загружает Node.js. Полный процесс всегда запускается через `build_exe.bat`. В версии 3.1.4 после подготовки Node.js батник явно выводит версии Node/npm, проверяет доступ к npm registry, затем продолжает `npm install`, `npm run build` и PyInstaller. После успешной сборки батник спрашивает, открыть ли `type_0.exe`.

Если окно кажется неподвижным на этапе `Installing JavaScript packages`, не закрывай его сразу: npm может скачивать зависимости. Журнал npm находится в `.build_tools\npm-cache\_logs`. Если появляется `registry.npmjs.org is not reachable`, это уже проблема сети/DNS/прокси, а не Node.js.

## Если сборка не начинается

- `Python ... was not found`: установи Python 3.12 x64 с https://www.python.org/downloads/windows/ и включи Python Launcher.
- `Could not prepare portable Node.js automatically`: проверь доступ к `https://nodejs.org/dist/`. Как запасной путь установи Node.js 22 LTS с https://nodejs.org/en/download, закрой старые CMD и снова запусти `build_exe.bat`.
- `Python requirements failed`: прочитай сообщение pip выше; проверь доступ к `pypi.org`, прокси и сертификаты. Теперь зависимости Python устанавливаются до проверки Node.js, поэтому ошибка Node.js не должна оставлять `pywebview` неустановленным.
- `npm install failed`: проверь доступ к `registry.npmjs.org`; при корпоративном прокси настрой npm для него или повтори сборку позже.
- `Next.js could not export the UI`: найди первое сообщение об ошибке от `npm run build`. `out\index.html` появляется только после успешного экспорта.
- `No module named 'webview'`: запусти `py -3.12 -m pip install -r requirements.txt` (или для установленной версии Python) и `run_app_debug.bat`. В штатной последовательности build-файл теперь устанавливает этот пакет до сборки.
- Если не появился Setup.exe, открой `installer.iss` в Inno Setup Compiler и нажми F9.

## Запуск приложения

- `run_app.bat` проверяет наличие `out\index.html`. Если статический интерфейс ещё не собран, он запускает полный `build_exe.bat`, а затем стартует исходную оболочку без консольного окна.
- `run_app_debug.bat` выполняет те же проверки, но запускает Python с консолью, чтобы видеть ошибки.
- Лог: `%APPDATA%\type_0\crash.log`.
- Настройки: `%APPDATA%\type_0\settings.json`.

## О диагностике пользователя

В предыдущем `crash.log` были две отдельные ошибки:
1. Старые строки `ctypes.wintypes.LRESULT` из прежней версии `main.py`; они относятся к старому обработчику перетаскивания и не объясняют отказ запуска версии 3.1.0.
2. Текущий критический запуск `webview_main.py` завершался с `ModuleNotFoundError: No module named 'webview'`. `build_exe.bat` сначала проверял Node.js и выходил до установки Python-зависимостей. В 3.1.3 порядок исправлен: Python-зависимости устанавливаются до подготовки Node.js.

Статический интерфейс отсутствовал потому, что `npm run build` не выполнялся, поэтому `run_app.bat` сообщал `UI bundle is missing`. Сейчас `run_app.bat` вызывает сборку, если `out\index.html` отсутствует.

## Сборка вручную

Ручной вариант требует установленного Python, Node.js/npm и доступных npm-зависимостей:

```bat
py -3.12 -m pip install -r requirements.txt
npm install --no-audit --no-fund --no-progress
npm run build
py -3.12 -m PyInstaller --noconfirm --clean --windowed --onedir --name type_0 --icon assets\type_0.ico --add-data "out;out" --add-data "assets;assets" --collect-all webview --collect-all pystray --collect-all PIL --collect-all clr_loader --hidden-import=clr --hidden-import=clr_loader --hidden-import=pythonnet --hidden-import=webview.platforms.edgechromium --hidden-import=webview.platforms.winforms --hidden-import=webview.platforms.mshtml webview_main.py
```

Для ручной компиляции установщика открой `installer.iss` в Inno Setup Compiler и нажми F9.

## Безопасность

Не отключай Microsoft Defender и не добавляй сборку в исключения вслепую. Если Defender повторно обнаружит угрозу, оставь файл в карантине, сохрани имя обнаружения и путь, а затем отправь файл в Microsoft на анализ как возможное ложное обнаружение.


## Ошибка «Cannot overwrite variable HOME»

Эта ошибка была исправлена в версии 3.1.3: параметр PowerShell переименован с `$home` на `$nodeHomePath`, чтобы не конфликтовать с системной переменной `$HOME`. При повторе неудачной старой попытки удали только `.build_tools` в папке проекта и заново запусти `build_exe.bat`.


## Версия 3.1.4: улучшение плавности

CPU и ОЗУ теперь считываются отдельным фоновым потоком с интервалом, выбранным в настройках. Список процессов обновляется независимым потоком примерно раз в 2.5–4 секунды, поэтому перечисление процессов больше не блокирует каждый запрос интерфейса. При перетаскивании рамки/заголовка приложение временно приостанавливает UI-опрос и тяжёлые анимации, затем немедленно возобновляет получение кэшированных данных. Это снижает нагрузку на WebView при движении окна.
