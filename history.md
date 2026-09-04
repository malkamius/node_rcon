## 2026-09-04
- **Backend config.json Hot Reload Watcher (requirements.md:164)**:
  - **Core Watcher Implementation (`src/backend/configWatcher.ts`)**:
    - Built `ConfigWatcher` class and `createConfigWatcher` factory.
    - Utilizes `fs.watch` on `config.json` with debouncing (default 250ms) to coalesce rapid multi-event writes from text editors or external tools.
    - Added Windows atomic-save support by detecting `'rename'` events and cleanly re-establishing file watch handles.
    - Robust error handling and non-blocking safety: parses JSON safely, notifies via `onError` and warnings on invalid/corrupted JSON without crashing or terminating the backend process, and recovers once valid JSON is written.
    - Key-diffing algorithm: compares host:port keys and profiles JSON to compute exact `changedKeys` (added, updated, or removed servers).
    - Unref timers and watchers (`.unref()`) ensuring clean process exits and no open handles during test teardown.
    - Internal write deduplication: provides `markLastKnownConfig` and `markLastKnownProfiles` hooks so backend-initiated saves (`saveProfiles`) update watcher baselines and avoid redundant callback cycles.
  - **Server & Profile Integration (`src/backend/server.ts` & `src/backend/profiles.ts`)**:
    - Wired `ConfigWatcher` into `server.ts` with `onProfilesChanged` callback that updates in-memory `config.profiles`, refreshes active connections via `rconManager.loadProfiles()`, and broadcasts `profilesChanged` over WebSocket.
    - Added `onConfigChanged` callback to update shared in-memory `config` state and broadcast `baseInstallsUpdated` if base installs changed.
    - Exported `configWatcher` from `server.ts` and wired `setConfigWatcher` in `profiles.ts` to sync baselines on backend saves.
    - Fixed unref handling across `ProcessManager.ts` and `rconManager.ts` polling/reconnect intervals for clean test lifecycle teardown.
  - **Requirements & Test Verification**:
    - Updated `requirements.md:164` to `[IMPLEMENTED]`.
    - Created comprehensive unit test suite `src/backend/__tests__/configWatcher.spec.ts` (11 tests) verifying debouncing, profile additions/modifications/deletions, corrupt JSON resilience, atomic replace re-attaching, and deduplication.
    - Verified all 16 test suites (215 tests) pass with 0 failures, and `npm run build:backend` compiles cleanly.

- **Multi-Server Batch RCON Command Broadcasting (Priority 11 / Option 1)**:
  - **Backend Multi-Server Broadcasting Engine (`src/backend/handlers/SessionHandler.ts` & `src/backend/server.ts`)**:
    - Extended `handlers.command` to support single `msg.key` (string) and batch `msg.keys` (string[]).
    - Added dedicated WebSocket message handler `handlers.broadcastCommand`:
      - Concurrently dispatches commands across all target servers via `Promise.allSettled(keys.map(k => rconManager.sendCommand(k, command)))`.
      - Preserves audit trail and single-server tab history by updating `sessionLines[key]` on disk and broadcasting individual `sessionLine` events for every targeted server.
      - Classifies status per server: `success` (if not beginning with `[RCON ERROR]` and not `[RCON] Not connected`), `disconnected`, or `error`.
      - Emits `broadcastCommandResult` events containing aggregated per-server execution outputs, statuses, timestamps, and request GUIDs.
      - Integrates structured audit logging (`auditLog('broadcastCommand', ...)`).
    - Added REST endpoint `POST /api/broadcast-command`:
      - Payload validation for `keys` (non-empty array of strings) and `command` (non-empty string).
      - Concurrent query execution via `rconManager.sendCommand(key, command)`.
      - Updates session history and returns `{ ok: true, command, results: [...] }`.
  - **Frontend Broadcast Terminal & Multi-Server Mode (`src/frontend/RconClientWindow.tsx`, `ServerManagerPage.tsx`, & `rconTerminalManager.ts`)**:
    - In `rconTerminalManager.ts`:
      - Implemented and exported `formatBroadcastResult(command, results, serverProfiles)` formatting command lines and per-server responses into ANSI syntax: bold cyan `[BROADCAST] > command`, bold green `[ServerName (host:port)]` for successful responses, and bold red for errors/disconnections.
      - Implemented `calculateConnectionSummary(selectedKeys, serverProfiles, rconStatusMap, statusMap)` returning `{ connected, disconnected, total, text }`.
    - In `RconClientWindow.tsx`:
      - Activated multi-server mode when 2+ servers are selected (`selectedKeys.length > 1`).
      - Added multi-server notice banner per `requirements.server-instance-management.md:48`: *"⚠️ Multi-Server Selection Active (N servers): Real-time output streams and player lists for individual servers are unavailable. Batch controls in the sidebar and RCON Command Broadcasting are enabled."*
      - Displayed target server status chips with individual `Connected` (green) / `Disconnected` (red) pills and connection summary counter badge.
      - Replaced player list panel with an unavailable notice card: *"Player list is unavailable when multiple servers are selected."*
      - Implemented dedicated interactive broadcast console (`__broadcast__` session) with empty-state guidance and ANSI colored output.
      - Enabled command input bar in multi-server mode with dynamic placeholder, `Broadcast (N)` button, `Broadcasting...` progress indicator, and command history (Arrow Up/Down).
      - Added "Clear Log" button for the broadcast session and "Clear Selection" button.
    - In `ServerManagerPage.tsx`:
      - Wired `selectedKeys`, `onDeselectAll`, and `onBroadcastCommand` into `RconClientWindow`.
      - Implemented asynchronous `handleBroadcastCommand` returning a Promise that resolves when `broadcastCommandResult` arrives.
      - Handled WebSocket `broadcastCommandResult` appending formatted ANSI lines to `__broadcast__` session without duplicate command headers.
  - **Automated Testing & Build Verification**:
    - Created unit test suite `src/backend/__tests__/broadcastCommand.spec.ts` (8 tests) covering input validation, multi-server concurrent dispatch, bounded history persistence, and status classification.
    - Expanded `src/backend/__tests__/api.integration.spec.ts` with integration tests for `POST /api/broadcast-command` (validation 400s and 200 response structure).
    - Created frontend unit test suite `src/frontend/__tests__/broadcastFormatting.spec.ts` (10 tests) verifying ANSI formatting, label resolution, and connection summary calculations.
    - Total test suite expanded to 186 passing tests across 13 test suites (`npx jest --forceExit`).
    - Clean compilation across all three build targets (`npm run build`: `build:backend`, `build:frontend`, `build:elevated`) with 0 errors.

- **Deep URL Routing, Bookmarking & Frontend Reconnect Modal (Priority 10)**:
  - **Deep URL Routing & Server Bookmarking (`src/frontend/urlRouting.ts`)**:
    - Created `urlRouting.ts` implementing `parseUrlParams`, `buildUrlHash`, `updateUrlHash`, `resolveBookmarkedServerKey`, and `copyBookmarkLink`.
    - Supported URL hash parameter format (e.g. `#server=127.0.0.1:28155`, `#server=...&activity=config`, or raw `#127.0.0.1:28155`) with query string fallback (`?server=...`).
    - Handled URL encoding/decoding and bidirectional activity tab synchronization (`rcon`, `config`, `baseinstalls`).
    - Integrated automatic server tab selection in `ServerManagerPage.tsx` upon initial load and WebSocket profile updates, resolving by `host:port` key or profile name.
    - Updated browser URL via `history.replaceState` on tab and activity switches without page reloads.
    - Added `hashchange` and `popstate` listeners for seamless browser back/forward and address bar navigation.
    - Added "🔗 Copy Bookmark Link" action to the server right-click context menu in `src/frontend/TabManager.tsx` with inline feedback toast.
    - Added "🔗 Bookmark" button in `src/frontend/RconClientWindow.tsx` header for one-click server URL copying.
  - **Connection Loss Modal & Automated Reconnection Loop (`src/frontend/DisconnectedModal.tsx` & `src/frontend/ServerManagerPage.tsx`)**:
    - Upgraded `DisconnectedModal.tsx` with a dark theme aesthetic, animated pulsing glow warning icon, live connection status card, attempt badge, and backend target URL indicator.
    - Implemented automated 5-second reconnection loop with a 1-second interval countdown ticker display ("Retrying in X seconds...").
    - Added animated countdown progress bar tracking remaining time out of 5 seconds.
    - Added interactive "🔄 Retry Now" button triggering immediate connection attempts.
    - Implemented auto-dismissal upon reconnection (`ws.onopen`), resetting retry attempts and countdown timers, and reloading profiles and session lines.
  - **Automated Testing & Build Verification**:
    - Created unit test suite `src/frontend/__tests__/urlRouting.spec.ts` (19 tests) covering hash parsing, query params, precedence, server resolution by host:port and name, hash generation, and edge cases.
    - Created unit test suite `src/frontend/__tests__/reconnectModal.spec.ts` (16 tests) covering retry ticker formatting, attempt badge formatting, progress percentage calculation, and conditional modal rendering.
    - Total test suite expanded to 166 passing tests across 11 test suites (`npx jest --forceExit`).
    - Full build passes cleanly across all three targets (`npm run build`: `build:backend`, `build:frontend`, `build:elevated`) with 0 errors.

- **Live Server End-to-End Testing & Integration Validation (Priority 9 / Option E)**:
  - **Backup Retention & Pruning Utility (`src/backend/iniBackupManager.ts` & `src/backend/iniApi.ts`)**:
    - Implemented `pruneIniBackups(serverOrDir, options)` supporting `keepCount` (retention count), `olderThanDays` (age cutoff), and `preserveSafetyBackups` (strict protection for pre-restore snapshots).
    - Implemented `deleteIniBackup(serverOrDir, filename)` safely deleting individual snapshots with filename sanitization and traversal protection.
    - Added REST endpoints: `POST /api/server-ini/:keyOrIdx/backups/prune` and `DELETE /api/server-ini/:keyOrIdx/backups/:filename` with audit logging.
    - Added WebSocket message handlers: `pruneIniBackups` and `deleteIniBackup` in `src/backend/handlers/IniHandler.ts`.
  - **Graceful Shutdown & Batch Script Synchronization (`src/backend/ProcessManager.ts` & `src/frontend/ScriptExecutionModal.tsx`)**:
    - Added `shutdownGracefully(key, rconManager?, timeoutMs?)` implementing two-stage graceful shutdown via RCON: sends `SaveWorld`, pauses, sends `DoExit`, and monitors process liveness with fallback to process kill on timeout or RCON disconnection.
    - Updated `stopServer` and `shutdownserver` in `ProfileHandler.ts` to use graceful shutdown and mark `manuallyStopped = true`.
    - Parallelized batch script execution and cancellation across multiple servers using `Promise.all` in `ScriptExecutionModal.tsx`.
  - **Active Server INI Diagnostics & Retention Controls UI (`src/frontend/IniRevisionModal.tsx` & `src/frontend/ServerConfigTab.tsx`)**:
    - Added active server warning banners in `IniRevisionModal.tsx` and `ServerConfigTab.tsx` alerting users that active servers hold configuration in memory, requiring restart and risking overwrite on shutdown.
    - Added "🧹 Cleanup Backups" retention panel to `IniRevisionModal.tsx` allowing one-click pruning with configurable retention limits and safety backup preservation.
    - Added single snapshot deletion buttons (🗑️) with confirmation dialogs and special warnings for pre-restore safety snapshots.
  - **Automated Testing & Build Verification**:
    - Expanded unit test suites `src/backend/__tests__/iniBackup.spec.ts` and `src/backend/__tests__/serverManager.spec.ts`.
    - Expanded integration test suite `src/backend/__tests__/api.integration.spec.ts` testing pruning and snapshot deletion.
    - All 131 Jest tests passing across 9 test suites (`npx jest --forceExit`).
    - Full build passes cleanly across `build:backend`, `build:frontend`, and `build:elevated` with 0 errors.

- **INI Backup History & Version Restore (Priority 8 / Option D)**:
  - **Backend INI Backup Management Engine (`src/backend/iniBackupManager.ts`)**:
    - Implemented `listIniBackups(serverOrDir, file?)` enumerating all timestamped `GameUserSettings.<timestamp>.backup.ini` and `Game.<timestamp>.backup.ini` files from `<instanceDirectory>\ShooterGame\Saved\Config\WindowsServer\`.
    - Added timestamp parsing (`parseTimestampFromBackupName`) and friendly formatting (`formatBackupDate`).
    - Added directory traversal protection and filename sanitization (`isSafeIniBackupFileName`).
    - Implemented `getIniBackupContent` and `getActiveIniContent` returning UTF-8 contents, file sizes, and modification timestamps.
    - Implemented `restoreIniBackup(serverOrDir, backupFilename)` with automated pre-restore safety snapshot creation (`<base>.<timestamp>.pre-restore.backup.ini`), non-destructive rollback, and active file replacement.
    - Implemented Longest Common Subsequence line diff utility (`computeLineDiff`) and dual-pane side-by-side alignment (`computeSideBySideDiff`).
  - **REST API Endpoints & WebSocket Handlers (`src/backend/iniApi.ts` & `src/backend/handlers/IniHandler.ts`)**:
    - Added REST endpoints: `GET /api/server-ini/:keyOrIdx/backups`, `GET /api/server-ini/:keyOrIdx/backups/:filename`, and `POST /api/server-ini/:keyOrIdx/restore`.
    - Added WebSocket message handlers: `getIniBackups`, `getIniBackupContent`, and `restoreIniBackup`.
    - Integrated structured audit logging (`logs/audit.log`) for all restore operations.
  - **Revision History Modal & INI Editor Integration (`src/frontend/IniRevisionModal.tsx` & `src/frontend/ServerConfigTab.tsx`)**:
    - Created `IniRevisionModal.tsx` with base file selector (`GameUserSettings.ini` vs `Game.ini`), revision sidebar with `PRE-RESTORE SAFETY` badges, human-readable file sizes, and snapshot dates.
    - Added multiple diff views: `Side-by-Side Diff` (synchronized dual-pane with line numbers and color-coded insertions/deletions), `Unified Diff` (standard stream), and `Raw Backup View` (full preview).
    - Added interactive confirmation dialog for restorations with safety snapshot guarantees.
    - Added "🕒 Revision History / Restore Backup" button in `ServerConfigTab.tsx` top toolbar and "🕒 Revisions" button inside the active editor header.
    - Configured automatic reload of INI forms and raw text upon restoring a revision.
  - **Automated Testing & Build Verification**:
    - Created unit test suite `src/backend/__tests__/iniBackup.spec.ts` (17 tests) covering snapshot discovery, safety classification, safe naming, pre-restore backup generation, restoration, and diff computation.
    - Expanded `src/backend/__tests__/api.integration.spec.ts` with integration tests for backup enumeration, content inspection, safety backups, and restoration.
    - All 113 Jest tests pass cleanly across 9 test suites (`npx jest --forceExit`).
    - Verified full build passes (`build:backend`, `build:frontend`, `build:elevated`) with 0 errors.

## 2026-09-03
- **SteamCMD Build ID & Game Update Notifier (Priority 7 / Option C)**:
  - **ACF Manifest Parser & Periodic Build Checking (`src/backend/steamUpdateNotifier.ts` & `src/backend/server.ts`)**:
    - Created `steamUpdateNotifier.ts` with `parseAcfBuildId(acfContent)` extracting the `buildid` from Valve ACF VDF manifest files.
    - Added `getAcfBuildIdFromDir(installDir)` locating `<installDir>/steamapps/appmanifest_2430930.acf`.
    - Implemented `fetchSteamLatestBuildId(appId)` polling the public branch API (`https://api.steamcmd.net/v1/info/2430930`) with error handling.
    - Implemented `evaluateBaseInstalls(baseInstalls, latestBuildId)` comparing installed build IDs with SteamCMD public branch build IDs and setting `updateAvailable: true` when outdated, or `installAvailable: true` when directories exist without manifests.
    - Implemented `findLinkedBaseInstall(serverDir, baseInstalls)` resolving both direct paths and directory junctions.
    - Integrated with `server.ts` periodic background checking (default every 10s with `.unref()` timer) and WebSocket broadcasts (`baseInstallsUpdated`, `profilesChanged`).
    - Added on-demand update check API: `POST /api/check-updates`.
    - Enriched `GET /api/profiles` and `GET /api/process-status` with `baseInstallId`, `baseInstallPath`, `baseInstallVersion`, `latestBuildId`, and `updateAvailable`.
  - **WebSocket Handler Enhancements (`ProfileHandler.ts` & `BaseInstallHandler.ts`)**:
    - Enriched `getProfiles` and `getProcessStatus` WebSocket responses with linked base install metadata and update flags.
    - Added `checkUpdates` WebSocket handler in `BaseInstallHandler.ts` enabling manual on-demand update checks from the frontend.
  - **UI Update Notifications & Badges**:
    - **`BaseInstallManager.tsx`**: Added a "🔄 Check for Updates" toolbar button and prominent `UPDATE` badge with quick-action `Update` button in the Update Available column.
    - **`TabManager.tsx`**: Added an orange `UPDATE` pill badge next to server names in the sidebar whenever their linked base install has an update available.
    - **`RconClientWindow.tsx`**: Added a `⚠️ Game Update Available (Steam Build <id>)` alert badge in the terminal header.
    - **`ServerConfigTab.tsx`**: Added a dedicated Base Install & Game Update Status banner displaying linked base install path, installed build ID, latest Steam build ID, and update status.
    - **`ServerManagementModal.tsx`**: Added "Linked Base Install" selector in the General & Identity section with live update status and build ID readout.
  - **Automated Testing & Build Verification**:
    - Created unit test suite `src/backend/__tests__/steamUpdateNotifier.spec.ts` (9 tests) testing ACF manifest parsing, build comparisons, directory matching, and fallback handling.
    - Expanded `src/backend/__tests__/api.integration.spec.ts` with integration tests for `GET /api/base-installs` and `POST /api/check-updates`.
    - Verified all 87 tests pass across 8 test suites (`npx jest`).
    - Verified complete build passes (`build:backend`, `build:frontend`, `build:elevated`) with 0 errors.
- **Server Crash & Engine Log Viewer (Priority 6 / Option B)**:
  - **Backend Log Inspection API (`src/backend/serverLogsApi.ts` & `src/backend/server.ts`)**:
    - Implemented `getServerLogsDir` resolving `<instanceDirectory>\ShooterGame\Saved\Logs\`.
    - Implemented `isSafeLogFileName` and `getLogFilePath` with strict directory traversal prevention (`..`, path separators, unauthorized extensions).
    - Implemented `listServerLogFiles(dir)` returning all `.log`, `.txt`, `.dmp`, `.xml` files sorted newest first with `ShooterGame.log` pinned to top, along with file size, mtime, and crash classification (`isCrash`).
    - Implemented `tailServerLog(dir, file, options)` reading last $N$ lines with case-insensitive search filtering.
    - Added REST endpoints: `GET /api/server-logs/:key`, `GET /api/server-logs/:key/tail`, and `GET /api/server-logs/:key/download`.
  - **Process Crash Detection & Recovery Hooks (`src/backend/ProcessManager.ts` & `src/backend/server.ts`)**:
    - Hooked `child.on('exit')` and `child.on('error')` on server processes.
    - When `profile.manuallyStopped !== true`, detects unexpected exit, sets `crashed: true`, logs `server_crash` to `logs/audit.log`, auto-appends a `[CRASH ALERT]` notice to terminal session lines, and broadcasts `serverCrash` and `processStatus` over WebSocket.
    - Updated `startPeriodicStatusCheck` to detect if a previously tracked server unexpectedly vanished from the system process list without manual stop.
  - **Frontend Log Viewer Modal & Context Menu (`src/frontend/ServerLogsModal.tsx`, `TabManager.tsx`, `ServerConfigTab.tsx`, `ServerManagerPage.tsx`)**:
    - Created `ServerLogsModal.tsx` featuring:
      - Log file selector dropdown with active (`★`) and crash (`⚠️`) badges and human-readable file sizes.
      - Monospace log display console with syntax coloring (errors/crashes in red, warnings in yellow, connects in green, saves in blue).
      - Configurable line count (100, 200, 500, 1000, 2000 lines).
      - Real-time search filter with line counter.
      - "Live Tail" toggle polling active logs every 4 seconds.
      - "Auto-Scroll" to bottom toggle.
      - "Download Log" button streaming file downloads.
    - Added "View Server Logs / Crash Reports" to the server right-click context menu in `TabManager.tsx`.
    - Added "📜 View Logs & Crash Reports" button in `ServerConfigTab.tsx` header.
    - Added visual `Crashed` status badge and subtitle notice in sidebar when a server process terminates unexpectedly.
  - **Automated Testing & Build Verification**:
    - Added unit test suite `src/backend/__tests__/serverLogs.spec.ts` (14 tests) covering path resolution, file listing, classification, tailing, traversal rejection, and filtering.
    - Expanded `src/backend/__tests__/api.integration.spec.ts` with integration tests for `/api/server-logs/:key`, `/tail`, and `/download`.
    - Verified all 76 Jest tests pass cleanly across 7 test suites (`npx jest`).
    - Verified `npm run build` (`build:backend`, `build:frontend`, `build:elevated`) compiles cleanly with 0 errors.

- **Elevated Service Instance Provisioning**:
  - In `elevated/src/handlers/installInstance.ts`, added `updateGameUserSettings` to automatically create/update `<instanceDirectory>\ShooterGame\Saved\Config\WindowsServer\GameUserSettings.ini` with `[ServerSettings]`, `RCONEnabled=True`, `RCONPort`, `ServerAdminPassword`, and `ServerPassword` without duplicating sections or keys.
  - Automatically initializes `<instanceDirectory>\ShooterGame\Saved\Config\WindowsServer\Game.ini` if missing so configuration parsers do not fail.
- **Backend Profile Auto-Registration**:
  - Updated `BaseInstallHandler.ts` to forward `rconPort`, `queryPort`, `gamePort`, `adminPassword`, `serverPassword`, `mapName`, and `sessionName` to the elevated service.
  - Assembles the full default `parsedCommandline` array with map suffix verification (`_WP`), ports, passwords, and standard ASA dedicated server flags.
  - Auto-registers the new server profile in `config.profiles`, persists via `saveProfiles()`, and logs to audit log.
- **WebSocket Broadcast & Sidebar Live Refresh**:
  - Updated `server.ts` to broadcast `profilesChanged` over WebSocket when `saveProfiles()` changes profiles.
  - Updated `ServerManagerPage.tsx` to handle `profilesChanged` events and immediately reload profiles, making the newly created server instance appear in the sidebar ready to configure and start.
- **Consolidated Duplicate Install Modals**:
  - Enhanced `InstanceInstallModal.tsx` with `rconPort` field (default 27020), standard default ports (`27015`, `7777`), `TheIsland_WP` default map, and a loading state that disables buttons while installing.
  - Replaced the duplicate 150-line raw form in `InstanceManager.tsx` with a clean "Instance Management" card that opens `InstanceInstallModal`.
  - Updated `InstallManager.tsx` and `ServerManagementModal.tsx` to use the unified modal.
- **Automated Testing & Build Verification**:
  - Added `src/backend/__tests__/installInstance.spec.ts` covering command-line formatting and INI updating.
  - Verified clean compilation across backend, frontend, and elevated services.

- **Server Launch Settings & Command-Line Synchronization (Priority 2)**:
  - Created `src/frontend/commandlineUtils.ts` with bidirectional conversion between `parsedCommandline` string arrays and structured launch settings (`mapName`, `queryPort`, `gamePort`, `serverPassword`, `maxPlayers`, `modIds`, `clusterId`, `clusterDirOverride`, and standard boolean flags).
  - Enhanced `ServerManagementModal.tsx` with dedicated, clearly organized UI sections:
    - **General & Identity**: Added "Auto-Start Server on Boot / Launch" (`autoStart: boolean`), server name, host, directory, and active players tracking.
    - **Ports & Passwords**: Added dedicated Query Port (`?QueryPort=...`) and Game Port (`Port=...`) inputs distinct from RCON Port, plus join password and RCON/admin password.
    - **Map & Server Settings**: Added Map selection dropdown with ASA presets (`TheIsland_WP`, `ScorchedEarth_WP`, `TheCenter_WP`, `Aberration_WP`, `Extinction_WP`) and Custom map text input, plus Max Players.
    - **Mods & Clustering**: Added Mod IDs input (`-mods=...`) with whitespace normalization and comma separation, Cluster ID (`-clusterID=...`), and Cluster Directory Override (`-ClusterDirOverride=...`).
    - **Server Launch Flags**: Added interactive toggles for `-NoBattlEye`, `-crossplay`, `-ForceAllowCaveFlyers`, `-automanagedmods`, `-servergamelog`, `-severgamelogincludetribelogs`, `-ServerRCONOutputTribeLogs`, `-NotifyAdminCommandsInChat`, `-noundermeshchecking`, and `-noantispeedhack`.
    - **Advanced Command-Line Arguments Editor**: Added collapsible raw editor showing each argument on its own line with live bidirectional synchronization with the structured form inputs.
    - **Server Table Improvements**: Displaying RCON Port, Game/Query ports, Auto-Start badge (`Auto`/`Manual`), host, and action buttons.
  - Ensured saving updates both top-level profile properties and regenerates `profile.parsedCommandline` while preserving any unmanaged or custom command-line arguments.
  - Added unit test suite `src/backend/__tests__/commandlineUtils.spec.ts` covering CLI parsing, flag toggling, port extraction, mod cleaning, and default generation.
  - Excluded `__tests__` from backend production build in `tsconfig.backend.json` to prevent rootDir conflicts while enabling full Jest coverage.
  - Verified full test suite passes (19/19 tests) and all packages (`build:backend`, `build:frontend`, `build:elevated`) compile cleanly.

- **Server Configuration & INI Improvements (Priority 3)**:
  - In `src/backend/iniApi.ts`:
    - Implemented and exported `syncRconSettingsToIni(serverOrDir, port, password?)` to update or insert `RCONEnabled=True`, `RCONPort=<port>`, and `ServerAdminPassword=<password>` under `[ServerSettings]` in `GameUserSettings.ini` while preserving existing comments, whitespace, and all other sections.
    - Added automated creation of timestamped backups (`GameUserSettings.<timestamp>.backup.ini`) before overwriting.
    - Exported `getIniPath` and `deepMerge`.
  - In `src/backend/handlers/IniHandler.ts`:
    - In `getServerIni`: Now reads and returns `rawText` alongside `iniObj`.
    - In `saveServerIni`: Supports saving `rawText` directly (with timestamped backup) as well as `msg.overwrite === true` for `iniObj`.
    - Added `syncRconToIni` handler to trigger `syncRconSettingsToIni` for specified profile indices or key.
  - In `src/backend/handlers/ProfileHandler.ts`:
    - Added automatic INI syncing during `saveProfiles` when `msg.syncIni === true` or when profiles specify `syncIni: true`.
  - In `src/frontend/ServerConfigTab.tsx`:
    - **View Mode Switcher**: Added `viewMode: 'form' | 'raw'` toggle buttons in the editor header next to Save and Cancel.
    - **Raw INI Editor Fallback**: Full-height monospace `<textarea>` with dark theme `#181a20`, character/line count badges, "Save Raw INI" (with dirty checking and disabled state), "Reload from Disk" action, and backend `saveServerIni` rawText saving.
    - **Custom & Mod INI Section Support**: Automatic detection of non-template sections in `iniObj`, dedicated "Custom & Mod INI Sections" card in the Form editor, ability to add/delete sections (e.g. `[StructuresPlus]`, `[DinoStorage]`), dynamically add/edit/rename/delete key-value pairs, and seamless merging of custom sections on save.
  - In `src/frontend/ServerManagementModal.tsx`:
    - Added `syncRconToIni: boolean` (default true) and tracked `initialPort` and `initialPassword` upon editing or creating a profile.
    - Added clean checkbox in "Ports & Passwords" card: `Auto-sync RCON settings to GameUserSettings.ini (RCONPort, RCONEnabled=True, ServerAdminPassword)`.
    - Added inline `Sync to INI Now` button with live success/error banners when an instance directory is set.
    - In `handleSaveProfile`: Automatically triggers `syncRconToIni` when port or password changes with auto-sync enabled; if auto-sync is disabled, presents a confirmation modal asking the user if they'd like to sync or skip.
  - Added unit test suite `src/backend/__tests__/iniSync.spec.ts` (12 tests) verifying INI syncing, raw text retrieval/saving, backup generation, and profile handler integration. All 31 tests passing across 5 suites.

- **Script Execution & Right-Click Context Menu (Priority 4)**:
  - **Wired `ScriptExecutionModal` to Backend**:
    - Replaced mock `setTimeout` in `src/frontend/ScriptExecutionModal.tsx` with actual REST endpoints: `POST /api/execute-script`, `GET /api/script-status/:key`, and `POST /api/cancel-script`.
    - Added multi-server targeting (`serverKeys: string[]`) allowing simultaneous script runs on multiple servers.
    - Added real-time polling with progress bars, line-by-line status indicators (`pending`, `running`, `completed`, `cancelled`, `error`), and per-server error messages.
    - Added built-in presets: "Restart and Update (15 min warning)", "Quick Broadcast (30s Warning & Save)", "Save World Now", and editable "Custom Script".
    - Handled script cancellation across all active servers via `handleCancel()`.
  - **Context Menu in `TabManager.tsx`**:
    - Implemented a custom right-click context menu on server items in the sidebar:
      - **Start Server** (enabled when stopped)
      - **Stop Server / Graceful Shutdown** (enabled when running)
      - **Execute Script...** (opens `ScriptExecutionModal` pre-targeted to that server)
      - **Open Directory in Explorer** (calls `POST /api/open-directory` to open instance path in Windows Explorer)
      - **Select for Batch Action** (toggles multi-selection state)
    - Auto-dismisses when clicking outside, scrolling, or pressing Escape, with bounds clamping to viewport edges.
  - **Multi-Server Batch Actions**:
    - Added multi-selection checkboxes to server items in `TabManager.tsx` with Ctrl/Shift-click support.
    - Added top batch action bar in sidebar displaying selection count, "Select All", "Clear", "Start (N)", "Stop (N)", and "Execute Script...".
    - Added multi-server informational banner in `ServerManagerPage.tsx` above RCON window when 2+ servers are selected, explaining that terminal/players reflect the active tab while batch commands can be executed across all selected servers.
  - **Backend Script Engine & Directory Opening**:
    - In `src/backend/rconScriptEngine.ts`: Refactored `executeScript` to run lines asynchronously in background (`runScriptLoop`) so `POST /api/execute-script` immediately returns running status without blocking, and `getScriptStatus(key)` returns live progress during polling.
    - In `src/backend/server.ts`: Added `POST /api/open-directory` endpoint using `child_process.spawn('explorer.exe', [targetDir], { detached: true })` with path existence verification and audit logging.
    - Decoupled `rconScriptEngine.ts` from circular `server.ts` dependencies using `setProcessManager`.
  - **Automated Testing & Build Verification**:
    - Expanded `src/backend/__tests__/serverManager.spec.ts` with script parsing, execution loop, and cancellation unit tests.
    - Expanded `src/backend/__tests__/api.integration.spec.ts` with integration tests for `/api/execute-script`, `/api/script-status/:key`, `/api/cancel-script`, and `/api/open-directory`.
    - Verified all 35 Jest tests pass cleanly across 5 test suites.
    - Verified `npm run build` (`build:backend`, `build:frontend`, `build:elevated`) compiles with 0 errors.

- **Custom Script Template Persistence (Priority 5 / Option A)**:
  - **Backend Script Template Engine (`src/backend/scriptTemplates.ts`)**:
    - Defined and exported `ScriptTemplate` interface (`id`, `name`, `description`, `content`, `isBuiltIn`, `createdAt`, `updatedAt`).
    - Implemented immutable built-in presets: "Restart and Update (15 min warning)", "Quick Broadcast (30s Warning & Save)", "Save World Now", and "Default Template".
    - Implemented `getScriptTemplates()` merging built-ins with `config.customScripts`.
    - Implemented `saveScriptTemplate()` with validation, unique ID generation (`custom-${Date.now()}`), and persistence to `config.json`.
    - Implemented `deleteScriptTemplate()` with protection forbidding deletion of built-in templates.
  - **REST Endpoints (`src/backend/server.ts`)**:
    - Added `GET /api/scripts` to return all available built-in and user custom script templates.
    - Added `POST /api/scripts` with body validation, custom template saving, and audit logging.
    - Added `DELETE /api/scripts/:id` with built-in protection (400) and audit logging.
  - **Frontend Script Management (`src/frontend/ScriptExecutionModal.tsx`)**:
    - Integrated with `GET /api/scripts` on mount with resilient fallback to built-in presets if disconnected.
    - Added `<optgroup>` organization separating "Built-in Presets" and "Custom Templates" with color badges (`Built-in` vs `Custom`).
    - Added inline "Save as New Template" card with name and description inputs.
    - Added "Save Changes" for updating selected custom scripts.
    - Added "Delete Template" with confirmation for custom scripts.
    - Added script file import (`.rcon`, `.txt`) via HTML5 FileReader and export/download as `.rcon` file.
  - **Automated Testing & Build Verification**:
    - Added unit test suite `src/backend/__tests__/scriptTemplates.spec.ts` (14 tests) covering template retrieval, creation, updating, deletion, and built-in protection.
    - Expanded `src/backend/__tests__/api.integration.spec.ts` with integration tests for `/api/scripts` (GET, POST, DELETE).
    - Verified all 57 Jest tests pass cleanly across 6 test suites.
    - Verified `npm run build` compiles with 0 errors across backend, frontend, and elevated services.

### Next Steps & Roadmap Priorities
- **Priority 6 (Option B)**: Server Crash & Engine Log Viewer (Tailing `ShooterGame.log`, viewing crash minidumps/reports, context menu integration, and automated recovery hooks).
- **Priority 7 (Option C)**: SteamCMD Build ID & Game Update Notifier (`appmanifest_2430930.acf` parsing, SteamCMD API polling, UI update indicators in Base Install Manager and RCON header).
- **Priority 8 (Option D)**: INI Backup History & Version Restore (Listing timestamped `.backup.ini` files and restoring snapshots).
- **Priority 9 (Option E)**: Live Server End-to-End Testing & Integration Validation.

## 2025-10-09
- Backend process status check now runs immediately on startup, not delayed by the interval.
## 2025-10-09
- Frontend now uses processStatus from each profile (if present) to immediately populate statusMap, so process status is shown without waiting for the next periodic update.
## 2025-10-09
- Store process statuses by key when processStatus is emitted from processManager.
- Attach processStatus to each profile in /api/profiles and internal getProfiles calls.
- Refactored getProfiles to allow injection of processStatuses for consistent status reporting.
- Updated server.ts and profiles.ts to support this feature.

## 2025-09-24
- Migrated backend elevated operations to use the new `sendElevatedCommand` function, which communicates with the `elevated` service via HTTP POST.
- Removed all usage of `sendAdminSocketCommand` in backend handlers (instance install, SteamCMD install, adminTask, etc.).
- Updated `BaseInstallHandler` and `SessionHandler` to use the new endpoint for privileged operations.
- Installed and typed `node-fetch` for HTTP requests to the elevated service.
- All instance install and admin tasks now use the new elevated service endpoint.

# 2025-09-24 (earlier)
## 2025-09-23

- Frontend: Updated `InstanceManager.tsx` to include all required parameter inputs for instance installation (queryPort, gamePort, mapName, sessionName, adminPassword, serverPassword).
- Frontend: Removed unused `InstanceInstallModal.tsx` from the codebase.
- All instance install actions now use the main InstanceManager form, no modal required.

### Next steps
- Test instance install flow in the UI and backend for error handling and edge cases.
## 2025-09-19

- Backend: Renamed `updatebaseinstall` handler to `updateSteamGame` in `BaseInstallHandler.ts`.
- Backend: Added new `installSteam` handler for initial Steam game install using SteamCMD.
- Backend: Both `updateSteam` and `installSteamGame` now stream progress updates to the frontend via WebSocket (`steamUpdateProgress` and `steamInstallProgress` messages).
- Frontend: Added `handleUpdate` and `handleInstall` logic to `BaseInstallManager.tsx`, wiring them to the update/install buttons.
- Frontend: Displays a column with real-time progress output for update/install actions.
- All changes documented and requirements/plan files updated as needed.

### Next steps
- Test update/install flows in the UI and backend for error handling and edge cases.
- Update documentation for new progress streaming and handler names.
## 2025-09-14 (cont)

- Join/leave session line messages now include the full player string (name and guid if present) in the chat window, while the currentPlayers list still only shows the name.
## 2025-09-14

- Updated player name filtering in `playersListener` (server.ts):
  - Now parses player strings to extract only the player name for the `currentPlayers` list.
  - If a GUID is present (e.g., 'Name, GUID'), it is included in session lines for join/leave events, but not in the `currentPlayers` broadcast.
  - Ensures only the player name (not index, not GUID) is shown in the currentPlayers list, but GUID is tracked in session lines for audit/logging.

### Next steps
- Review frontend handling of currentPlayers and sessionLine events to ensure correct display and usage of player names and GUIDs if needed.
# 2025-07-06
- Refactored `installInstance` in `BaseInstallHandler.ts` to use `sendAdminSocketCommand` for running the PowerShell script with admin privileges, instead of spawning the process directly. This ensures all instance installs are executed with the required permissions via the admin socket.
# 2025-07-06
- Removed deprecated REST endpoint `/api/install-instance` from `server.ts`. Instance installs are now handled exclusively via WebSocket and executed using `adminSocketClient` to ensure admin permissions.
- Ensured all instance install actions are routed through the WebSocket backend, as per requirements.

Next steps:
- Confirm all frontend and backend code paths use the WebSocket for instance installs.
- Remove any remaining references to the old REST endpoint in documentation or client code if present.
# 2025-07-06
- Refactored WebSocket message handling in `server.ts`:
  - Split message handlers into domain-specific handler classes: `SessionHandler`, `ProfileHandler`, `BaseInstallHandler`, `IniHandler` (in `src/backend/handlers/`).
  - Each handler exposes a map of message type to handler function.
  - `server.ts` now instantiates handlers and dispatches messages via a master handler map.
  - Added `handlers/README.md` documenting the message type to handler mapping.
- Next steps:
  - Test all WebSocket message types for correct routing and behavior.
  - Consider further splitting or documenting handler context dependencies.
  - Update requirements and plan files to reflect this refactor.

## 2025-09-24
- Migrated backend elevated operations to use the new `sendElevatedCommand` function, which communicates with the `elevated` service via HTTP POST.
- Removed all usage of `sendAdminSocketCommand` in backend handlers (instance install, SteamCMD install, etc.).
- Updated `BaseInstallHandler` and `SessionHandler` to use the new endpoint for privileged operations.
- Installed and typed `node-fetch` for HTTP requests to the elevated service.
- All instance install and admin tasks now use the new elevated service endpoint.

### SteamCMD Installer Migration
- Deprecated the PowerShell-based `Install-SteamCmd.ps1` script.
- Added a new cross-platform Node.js script `install-steamcmd.js` for downloading and extracting SteamCMD.
- Updated documentation in `README.md` to reflect the new installation method.
- Installed the `unzipper` npm package for zip extraction in Node.js.
- Completed migration of all INI/config and process control actions in `ServerConfigTab.tsx` to use the shared WebSocket connection (`wsRequest`).
- Backend (`server.ts`) now supports `getServerIni`, `saveServerIni`, `startServer`, and `stopServer` WebSocket message types for these actions.
- Added WebSocket backend handlers in `server.ts` for `getServerIni`, `saveServerIni`, `startServer`, and `stopServer` to support frontend migration from fetch to WebSocket for INI/config and process control actions.
- Added `getIni` and `saveIni` async exports to `iniApi.ts` for direct backend usage by WebSocket handlers.
- Next steps: Continue migrating remaining frontend fetch calls to use the shared WebSocket and add backend handlers as needed.

## 2025-07-06
- Frontend: Refactored `ServerManagerPage.tsx` to use the main WebSocket connection for all backend API calls to `/api/profiles` (get/save) and `/api/session-lines/:key` (get). Added a `wsRequest` utility for request/response messaging over WebSocket. Removed all `fetch` calls for these endpoints from this file.
- Frontend: Refactored `ServerManagementModal.tsx` to use the parent-provided `onSave` prop (which uses the shared WebSocket connection) for saving server profiles. Removed all direct `fetch` calls from this file. Profile management is now fully WebSocket-based and consistent with the rest of the app.
- This continues the migration of all frontend fetch calls to use the main WebSocket connection managed by the app. No backend changes were required for this step.

**Next steps:**
- Refactor the next frontend file (`ServerConfigTab.tsx`) to use the WebSocket for INI/config management actions.
- Continue migrating all fetch calls in `src/frontend/**` to use the shared WebSocket connection.
- Update requirements and plan files if the feature scope or implementation details change.

**Next steps:**
- Refactor the next frontend file (`ServerManagementModal.tsx`) to use the WebSocket for profile management actions.
- Continue migrating all fetch calls in `src/frontend/**` to use the shared WebSocket connection.
- Update requirements and plan files if the feature scope or implementation details change.
- Frontend: Refactored `RconClientWindow` to use the shared application WebSocket for all actions, including clearing the log. Removed its own WebSocket setup/cleanup logic. The clear log action is now delegated to the parent via a new `onClearLog` prop, which uses the main WebSocket connection managed by `ServerManagerPage`. This ensures consistent disconnect/reconnect handling and avoids duplicate WebSocket connections.

**Next steps:**
- Test RCON terminal log clearing and ensure disconnect modal appears as expected on backend disconnects.
- Monitor for any regressions in RCON command or log handling after WebSocket refactor.

## 2025-07-05
- Backend: Updated `Install-Instance.ps1` so that `Mods` and `ModsUserData` folders under `ShooterGame\Binaries\Win64\ShooterGame` are now always created as real folders (not junctioned or symlinked) in new server instances. These folders are excluded from the dynamic linking process and are created as standard directories in the instance.

**Next steps:**
- Test instance creation to confirm Mods and ModsUserData are real folders and not links.
- Update documentation if further exclusions or instance-specific folders are needed.

## 2025-07-04
- Backend: Fixed bug in WebSocket handler for `updatebaseinstall`—now properly awaits async `processManager.isRunning` for all affected profiles before allowing a base install update. Prevents race conditions and ensures updates only run when all related servers are stopped.

**Next steps:**
- Monitor for any issues with async process status checks during base install updates.
## 2025-07-21
- Split BaseInstallManager frontend into three modular panels: SteamCmdManager, BaseInstallManager, and InstanceManager.
- Created new ServerManagementPage to host all three panels for server management.
- SteamCmdManager: Allows setting/checking SteamCMD path and installing SteamCMD if not detected.
- BaseInstallManager: Manages base installs, disabled if SteamCMD is not detected.
- InstanceManager: Allows selection of base install and instance path for new instance installs, disabled if no base installs or SteamCMD is not detected.
- Added requirements.frontend-management.md and plan.frontend-management.md to document and plan the new frontend management features.
- Updated BaseInstallManager to accept steamCmdDetected prop and disable actions if SteamCMD is not detected.

**Next steps:**
## 2025-07-03
- Backend: Added periodic process status check to ProcessManager. The backend now calls getStatus on all managed server sessions at a regular interval, using listProcesses and portscanner to detect if a port is in use but no process is detected. Emits an error status in this case for improved diagnostics and frontend display. This supports robust monitoring and error reporting for server instance management.
**Next steps:**
- Integrate new status/error reporting into frontend server/process status UI.
- Expand tests to cover periodic status checks and error scenarios (e.g., port in use, no process).
- Continue refining process management and monitoring for reliability and extensibility.
- Testing: Created backend test plan and initial Jest test scaffolding for process management, base install management, and RCON script engine. Added `jest.config.json` and a sample test suite in `src/backend/__tests__/serverManager.spec.ts`. Installed Jest and related dependencies. Verified test setup with a successful initial test run (all scaffolded tests pass).

**Next steps:**
- Expand unit and integration tests for backend services and API endpoints.
- Add frontend test scaffolding for critical flows as needed.

- Frontend/Backend: Tested the full RCON script automation workflow in the UI, including script selection, execution, status polling, and cancellation. Verified robust user feedback, error handling, and status updates for all script actions. Made minor refinements to UI feedback and error messages based on test results. No major issues found; the workflow is now production-ready.
- Documentation: Confirmed that requirements and implementation plan are up-to-date with the current feature set. No changes needed at this time.

**Next steps:**
- Monitor user feedback and usage for any issues or enhancement requests.
- Begin preparing unit/integration tests for backend and critical frontend flows.

- Planning: Ready to begin frontend integration for RCON script execution, status display, and cancellation controls. Backend API and script engine are complete and documented.
- Next step is to implement the UI for script selection, execution, monitoring, and cancellation in the RCON manager, following requirements and plan.
- Backend/Frontend: Began implementation of error handling, logging, and security improvements for server process and script management. This includes adding more robust error messages for user actions, preparing audit logging for process and base install actions, and reviewing sensitive actions for future RBAC support.
- Next, will focus on surfacing backend errors in the frontend UI, logging key actions, and preparing for future extensibility and testing.

**Next steps:**
- Implement and test improved error handling for all user actions in both backend and frontend.
- Add audit logging for process and base install actions.
- Review and document security-sensitive actions for future RBAC.
- Begin preparing unit/integration tests for backend and critical frontend flows.
- Frontend: Completed end-to-end integration of RCON script automation workflow. The `ScriptExecutionModal` is now fully integrated into the RCON manager UI, with backend API calls for script execution, status polling, and cancellation wired up. Robust user feedback and error handling have been added for all script actions, including clear status, error, and completion messages.
- This completes the initial implementation of RCON script automation, enabling users to select, execute, monitor, and cancel scripts on one or more servers directly from the UI.

**Next steps:**
- Test the full script automation workflow in the UI and refine as needed based on user feedback.
- Update documentation and requirements if any changes or enhancements are made during testing.


## 2025-06-29
- Backend: Reviewed and improved error handling and audit logging for sensitive backend actions (server start/stop, base install update, script execution) as required by the plan. Ensured all such actions are consistently audit-logged and return robust error messages. This lays the foundation for future RBAC and security enhancements.


- Backend: Began abstraction of process management logic for extensibility. Created `ProcessManager` and `ArkSAProcessManager` classes in `src/backend/ProcessManager.ts` to provide a generic, extensible interface for server process management. Refactored `server.ts` to use the new abstraction, replacing direct process management logic with the `ArkSAProcessManager` instance. All process start/stop/status logic now uses the new class, laying the foundation for supporting additional game/server types in the future.

**Next steps:**
- Begin abstracting base install management logic for future extensibility (multi-game support).
- Document new interfaces and update implementation plan as needed.

- Refactor: Updated backend to export the Express `app` instance separately from the server startup logic in `server.ts`. This enables integration tests to import and use the app without triggering full startup or side effects, resolving initialization errors and supporting robust API testing.

**Next steps:**
- Update integration tests to use the new app export and verify tests run successfully.
- Expand integration and unit test coverage for backend endpoints and services.

- Testing: Implemented the first real backend API integration test for `/api/process-status` in `src/backend/__tests__/api.integration.spec.ts`. The test verifies that the endpoint returns a valid response structure. This is the first step toward comprehensive backend API test coverage.

**Next steps:**
- Expand integration tests for script execution and cancellation endpoints.
- Add frontend test scaffolding for critical flows as needed.

- Testing: Added backend API integration test scaffolding in `src/backend/__tests__/api.integration.spec.ts` for process status, script execution, and cancellation endpoints. Installed Supertest for Express API testing. Ready to implement real integration tests for backend API endpoints.

**Next steps:**
- Implement and expand integration tests for backend API endpoints.
- Add frontend test scaffolding for critical flows as needed.

- Frontend: Created `BaseInstallManager.tsx` React component to display a table of all base installs, their version, update status, and latest build. This is the first step toward full base install management UI.

## 2025-06-29
- Frontend: Added inline error/success feedback for start/stop actions in `ServerConfigTab.tsx`. Users now see a temporary message next to the controls if an action fails or succeeds.

## 2025-06-29
- Frontend: Added inline error/success feedback for start/stop actions in `TabManager.tsx`. Users now see a temporary message below the server entry if an action fails or succeeds.

## 2025-06-29
- Frontend: Added start/stop process controls to `TabManager.tsx` for each server in the sidebar, using the process status. Users can now start or stop servers directly from the server list.

## 2025-06-29
- Frontend: Added start/stop process controls to `ServerConfigTab.tsx` for the selected server, using the process status. Users can now start or stop the server instance directly from the config tab.

## 2025-06-29
- Frontend: Updated `ServerConfigTab.tsx` to show process status (running, stopped, manual/auto) for the selected server using the new `statusMap` from `/api/process-status`.

## 2025-06-29
- Frontend: Updated `RconClientWindow.tsx` to show real process status (running, stopped, manual/auto) in the RCON window header using the new `statusMap` from `/api/process-status`.

## 2025-06-29
- Frontend: Updated `TabManager.tsx` to display real process status (running, stopped, manual/auto) using the new statusMap from `/api/process-status`. Status is now visible in the server list sidebar.

## 2025-06-29
- Frontend: Integrated `/api/process-status` endpoint in `ServerManagerPage.tsx` to fetch and poll real-time process status for all servers. Status is now available for display in the UI and will be used for process controls and indicators.

## 2025-06-29
- Added `/api/process-status` endpoint to backend (`server.ts`) to provide real-time status of all managed Ark: Survival Ascended servers for frontend integration. This endpoint returns running state, start time, manual stop, auto-start, and base install association for each server profile.
- **Next:** Begin frontend integration to display and control server process status using this endpoint.

## 2025-06-29
- Frontend: Completed full CRUD and management UI for base installs in `BaseInstallManager.tsx`, including validation, feedback, and integration into the main page.
- Frontend: Process status polling, display, and controls (start/stop) are now fully integrated in the sidebar, config tab, and RCON window, with inline feedback for actions.
- Backend: All endpoints for process management and base install CRUD are now correctly placed and error-free. Process status broadcasting and `/api/process-status` endpoint are fully integrated.
- Documentation: Updated implementation plan to reflect completed CRUD and management features; next step is RCON script engine and frontend integration.

**Next steps:**
- Begin backend implementation for RCON script execution and automation.
- Implement frontend UI for script selection, execution, and status/cancellation.

## 2025-06-29

**Next steps:**
- Improve validation and user feedback for base install management actions.
- Frontend: Integrated `BaseInstallManager` into `ServerManagerPage.tsx` so the base install management UI is now accessible from the main page. Added stubs for add, update, and remove controls (UI only, no backend calls yet) to prepare for full management functionality.

## 2025-06-29
- Frontend: Added "Base Installs" as a new tab in `ServerManagerPage.tsx` and integrated the `BaseInstallManager` component. Added UI stubs for add, update, and remove controls (disabled for now) to the base install management panel.

**Next steps:**
- Implement add, update, and remove functionality for base installs in the frontend, wiring up to backend endpoints.

**Next steps:**
- Implement add, update, and remove functionality for base installs in the frontend, wiring up to backend endpoints.
**Next steps:**
- Continue with frontend integration, RCON script automation, or further server management features as needed.

## 2025-06-29
- Backend: Implemented RCON script engine module (`rconScriptEngine.ts`) to parse and execute scripts with support for RCON commands, `wait`, and `update-base-install` commands.
- Backend: Integrated script engine with real process status checks, blocking base install updates if any server using the base is running.
- Backend: Added API endpoints for script execution (`/api/execute-script`), status (`/api/script-status/:key`), and cancellation (`/api/cancel-script`).
- Backend: Wired up script engine to use the main RconManager instance and exported process status for integration.
- Documentation: Updated code to match requirements and implementation plan for RCON script automation.

**Next steps:**
- Begin frontend integration for script selection, execution, status display, and cancellation controls.

**Next steps:**
# 2025-06-29

## 2025-06-29
- Frontend: Finalizing integration of `ScriptExecutionModal` in the RCON manager. Connecting backend API calls for script execution, status polling, and cancellation. Adding robust user feedback and error handling for all script automation actions.
- This will complete the end-to-end workflow for RCON script automation in the UI.

**Next steps:**
- Test the full script automation workflow in the UI and refine as needed.
- Update documentation and requirements if any changes are made during implementation.
- Frontend: Continuing integration of `ScriptExecutionModal` into the RCON manager UI. Focus is on completing the modal launch, selection, and execution flow, and beginning to wire up backend API calls for script execution, status polling, and cancellation.
- This will enable end-to-end script automation from the UI, following the requirements and plan.

**Next steps:**
- Finalize modal integration and connect all backend API calls for script execution, status, and cancellation.
- Add robust user feedback and error handling for all script actions.
- Test the full script automation workflow in the UI.
- Frontend: Began integration of `ScriptExecutionModal` into the RCON manager UI. Users will be able to launch the modal from the right-click context menu and execute scripts on selected servers.
- This step prepares the UI for full script automation and backend API wiring.

**Next steps:**
- Complete integration of the modal into the RCON manager and connect backend API calls for script execution, status polling, and cancellation.
- Add user feedback and error handling for script actions in the modal and RCON manager.
- Frontend: Created `ScriptExecutionModal.tsx` React component for RCON script execution UI. The modal includes script selection, execution, status display, and cancellation controls, with placeholders for backend API integration.
- This component will be integrated into the RCON manager for full script automation support.

**Next steps:**
- Integrate `ScriptExecutionModal` into the RCON manager UI and wire up backend API calls for script execution, status polling, and cancellation.
- Add feedback and error handling for script actions in the modal.
- Frontend: Started implementation of the RCON script execution modal as a new React component. The modal includes UI for script selection, execution, status display, and cancellation controls, following the updated requirements.
- This prepares the codebase for full integration of script automation features in the RCON manager.

**Next steps:**
- Complete the script execution modal component and integrate it into the RCON manager UI.
- Implement API calls for script execution, status polling, and cancellation.
- Add feedback and error handling for script actions in the modal.
- Frontend: Began integration for RCON script execution, status display, and cancellation controls. Scaffolded UI in the RCON manager, including modal for script selection/execution and placeholders for status/cancellation.
- This is the first step toward full frontend support for RCON script automation as described in the requirements and plan.

**Next steps:**
- Implement script selection and execution logic in the modal.
- Integrate API calls for script execution, status polling, and cancellation.
- Display script execution status and allow cancellation from the UI.
**Next steps:**
- Continue with frontend integration, RCON script automation, or further server management features as needed.
# 2025-06-29
- Added a prominent comment at the top of `server.ts` clarifying that all Express API endpoint declarations must be placed after all imports, middleware, and `const app = express();`, just before `server.listen`. This is to prevent future placement errors and ensure maintainability.

**Next steps:**
- Continue with frontend integration, RCON script automation, or further server management features as needed.
# 2025-06-29
- Added `/api/process-status` endpoint to return the current running state and start time (if running) for all managed servers. This enables the frontend to query the current process status on page load or refresh, improving UI accuracy and reliability.

**Next steps:**
- Integrate process status polling into the frontend UI.
- Continue with RCON script automation or further server management features as needed.
# 2025-06-29
- Implemented process status broadcasting: whenever a server is started or stopped, a `processStatus` event is sent to all WebSocket clients with the server key and running status. This enables real-time frontend updates for server process state.

**Next steps:**
- Integrate process status updates into the frontend UI.
- Continue with RCON script automation or further server management features as needed.
# 2025-06-29
- Fixed placement of `/api/start-server/:key` and `/api/stop-server/:key` endpoints in `server.ts` to ensure they are declared after `app` initialization and middleware. This resolves previous compile/lint errors and restores backend functionality for manual server start/stop tracking.

**Next steps:**
- Implement process status broadcasting to frontend clients.
- Continue frontend integration for server instance management.

# RCON Manager Development History

- Complete backend process management for Ark: Survival Ascended server instances (status updates).
- Add frontend integration for base install update status and management.
- Add RCON script execution and automation features.

- Implemented manual stop tracking for Ark: Survival Ascended server instances in backend, with API endpoints to start/stop and update the flag.



## 2025-06-29
- Started implementation of server instance management features (manage-instances branch).
- Updated `ServerProfile` interface to include `autoStart`, `manuallyStopped`, and `baseInstallId` fields.
- Added `BaseInstallProfile` interface for tracking base file installs.
- Updated backend config defaults to include `steamcmdPath`, `baseInstallUpdateCheckInterval`, and `baseInstalls` array.
- Added backend API endpoints for getting/setting SteamCMD path and listing base installs (stubs) in `server.ts`.
- Implemented backend API endpoints for adding, updating, and removing base installs with validation for uniqueness and required fields.
- Added backend endpoint to validate SteamCMD path existence (`/api/validate-steamcmd-path`).

## 2025-06-28
- Added persistent session line storage for each server profile (RCON session) in the backend, keeping the last 100 lines (configurable).
- Each terminal line now includes a timestamp, which is stored and restored with the session.
- Frontend sends each new line to the backend as it is added; on backend restart, the last lines are restored to the terminal with correct timestamps.
- Added a per-profile toggle in the RCON client window to show/hide timestamps (default: on).
- Refactored frontend and backend to support session line APIs (`/api/session-lines/:key` GET/POST/DELETE).

## 2025-06-19
### Server Configuration & INI Management
- Added a Server Configuration tab to the frontend with a server list, selection, and INI editor UI for ARK Game.ini and GameUserSettings.ini files.
- Implemented backend Express endpoints to fetch and save INI files as JSON, using the `ini` npm package for parsing and writing.
- Backend now saves INI files in the correct ARK config subdirectory (`ShooterGame/Saved/Config/WindowsServer/`).
- Before overwriting an INI file, the backend creates a timestamped `.backup.ini` file in the same directory.
- INI editor UI supports checkboxes for booleans and number fields that can be cleared to omit settings from the INI.
- Frontend omits empty number fields when saving settings.
- TypeScript errors in backend and frontend were resolved.
- requirements.server-config-ini.md documents requirements and implementation plan for these features.

- ark-settings-template.json updated with settings from the wiki
- max height of settings editor dynamic now
feat: Implement server configuration and INI management features

- Added a new Server Configuration tab in the frontend for managing server settings.
- Implemented backend API for reading and writing INI files using Node.js and ini library.
- Created a JSON template system for ARK settings to facilitate dynamic form rendering.
- Developed a utility to load ARK settings template from the server.
- Enhanced server management modal to include dedicated server directory path.
- Added functionality for deep merging INI settings to preserve existing values.
- Implemented a verification script to ensure template integrity against actual INI files.

#### Next Steps
- Add error handling and user feedback for failed backend operations in the frontend.
- Optionally, allow users to view/download or restore from INI backups.
- Improve UI/UX: section navigation, search/filter, validation.

## 2025-06-18
### Disconnected/Reconnect Handling
- Frontend: Added a modal dialog that appears when the frontend loses connection to the backend, with automatic reconnection attempts every 5 seconds and a manual retry button.
- Backend: Ensured connection status is broadcast to the frontend; backend continues to attempt reconnects to servers every 5 seconds on disconnect.
- Added CSS override for xterm.js width cache div to comment out the width property.

## 2025-06-18
- Added backend polling for ARK SE/SA chat messages using the `getchat` RCON command, emitting chat events to the frontend if a new message is received.
- Implemented frontend handling of chat messages: chat output is appended to the terminal for the correct session and refreshes if the tab is active.
- Backend and frontend now log player connect/disconnect events to the terminal when the player list changes (not on first update).
- Added VS Code debug configuration for backend (Node.js) with `--inspect-brk` for debugging support.

## 2025-06-17
- Investigated persistent layout bug: currentPlayersWidth/sidebarWidth do not update to profile value when switching tabs without a refresh.
- Tried the following fixes:
  - Resetting widths to undefined on tab switch and forcing re-render.
  - Keying the CurrentPlayersWindow container by activeTab.
  - Removing setState from componentDidUpdate to avoid update loops.
  - Ensured getSidebarWidth/getCurrentPlayersWidth always pull from profile if state is undefined.
- VS Code build wasn't doing the webpack on the front end

## 2025-06-17
- Added support for resizable horizontal elements (sidebar, terminal area, current players window) in the main app window.
- Implemented saving and restoring of horizontal element sizes per-server in the backend profile (config.json).
- Updated requirements to specify resizable layout and persistent sizes.
- Server profiles now support specifying the game (e.g., ARK: Survival Evolved/Ascended) and enabling extra features such as a current players window.
- Implemented backend polling of ListPlayers and broadcasting to all frontends for current players feature.
- Frontend now displays a live-updating current players window for supported servers, with configurable update interval.

## 2025-06-17
- Integrated xterm.js and FitAddon into TerminalArea for real terminal emulation and responsive resizing.
- Updated REQUIREMENTS.md to specify use of FitAddon for xterm.js.
- Installed @xterm/addon-fit and updated imports to use the new package.
- Fixed all TypeScript errors related to xterm.js integration.
- Implemented backend RconManager for persistent RCON connection management, auto-reconnect, and status tracking.
- Backend now broadcasts connection status to frontend via WebSocket and reloads connections on profile update.
- Integrated frontend modal with backend API for live loading and saving of server profiles.
- Added backend API endpoints (`/api/profiles` GET/POST) to load and update server profiles in config.json.
- Created a backend utility module for reading and saving profiles.
- Implemented Server Management Modal as a React component for adding, editing, and deleting server profiles in the frontend.
- Integrated the modal into the main app and wired up the toolbar button to open it.
- Modal state is managed in the main app; backend integration for config management is pending.

## 2025-06-17
- Project initialized based on requirements in REQUIREMENTS.md.
- Created recommended folder structure: `/src/backend`, `/src/frontend`, `/public`, and `config.json`.
- Set up TypeScript and Webpack for both backend and frontend.
- Implemented a minimal Express backend with a WebSocket placeholder.
- Scaffolded a React frontend with a main `RconClientApp` component and basic layout (toolbar, sidebar, terminal area).
- Added a command input box below the terminal area with:
  - Command history (up/down arrow navigation)
  - Dropdown for past commands
  - Send button
- All UI code is commented and structured for clarity and future expansion.