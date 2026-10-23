# Диагностика сборки type_0 3.1.4

## Если Node.js установился, но дальше кажется, что ничего не происходит

`setup_node.ps1` подготавливает только портативный Node.js. Он не собирает интерфейс и не запускает приложение самостоятельно. Для полного цикла запускай `build_exe.bat`.

В текущей версии 3.1.4 сценарий сборки после подготовки Node.js явно печатает путь, версии Node/npm и проверяет доступ к npm registry. Далее должны последовательно появиться этапы:

1. `Checking access to the npm package registry`;
2. `Installing JavaScript packages`;
3. `Building the React interface`;
4. `Packaging the type_0 desktop app`;
5. сборка установщика Inno Setup, если он установлен.

Установка npm-зависимостей может занять несколько минут. Журнал npm сохраняется в `.build_tools\npm-cache\_logs`. Сам портативный Node хранится в `.build_tools` и повторно используется через `.build_tools\node_path.txt`.

## Если снова останавливается

- На `Node.js or npm could not run`: проверь, что `.build_tools\node_path.txt` указывает на папку, в которой есть `node.exe` и `npm.cmd`.
- На проверке npm registry: проверь доступ к `https://registry.npmjs.org/`, DNS, прокси и VPN. Не отключай защиту Windows.
- На `npm install`: приложи самый свежий файл из `.build_tools\npm-cache\_logs`.
- На сборке Next.js: пришли первую ошибку перед сообщением `Next.js could not export the UI`.
- На PyInstaller: пришли traceback целиком.

Новая версия не утверждает, что сборка прошла успешно до её выполнения на Windows. Изменения сценария проверены статически в среде подготовки; полный Windows build нужно подтвердить на целевом компьютере.
