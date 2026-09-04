# Node.js RCON Manager Feature Checklist & Settings Audit

This document audits the settings, configuration capabilities, and features available in the codebase (`node_rcon` in `i:\repos\rcon`), identifies gaps where functionality exists in code/scripts/templates but is missing or incomplete in the UI, and provides a prioritized checklist to bring full server setup and management into the graphical interface.

---

## 1. Executive Summary & Core Discovery

The `rcon` project has substantial backend and automated tooling for managing ARK: Survival Ascended dedicated servers (including SteamCMD base installation, folder junctioning for shared binaries, INI configuration editing, and process management). 

However, **setting up a new server from the UI currently breaks or is incomplete** due to:
1. **Critical Disconnect in Instance Creation**:
   - `InstanceInstallModal.tsx` and `InstanceManager.tsx` collect instance parameters (`queryPort`, `gamePort`, `mapName`, `sessionName`, `adminPassword`, `serverPassword`).
   - The backend handler `BaseInstallHandler.ts` receives these parameters, but **only passes `baseInstallPath` and `instanceDirectory`** to the elevated service `InstallInstance`.
   - The elevated service (`elevated/src/handlers/installInstance.ts`) only creates folder junctions and directories—it **does NOT create the server profile in `config.json`**, does not generate the launch command line, and does not configure initial `Game.ini` / `GameUserSettings.ini` files!
   - As a result, after "installing" an instance from the UI, no new server profile appears in the Server Manager tab, and the instance cannot be launched or configured unless manually added.
2. **Missing Command-Line & Launch Flag Settings in the UI**:
   - The backend `ArkSAProcessManager` launches servers using `profile.parsedCommandline` (`child_process.spawn(exePath, profile.parsedCommandline)`).
   - In `config.json`, servers use rich command-line parameters (e.g. `SessionName`, `QueryPort`, `Port`, `MaxPlayers`, `-mods`, `-clusterID`, `-ClusterDirOverride`, `-NoBattlEye`, `-crossplay`, `-automanagedmods`, etc.).
   - In the frontend UI (`ServerManagementModal.tsx`), users can only edit `name`, `host`, `port`, `password`, `directory`, `game`, and `currentPlayers`. There are **no inputs for launch parameters, mods, cluster settings, or command-line flags**.
3. **Dead / Unlinked UI Components**:
   - `InstanceInstallModal.tsx` exists as a duplicate of `InstanceManager.tsx` embedded within `ServerManagementModal.tsx`.
   - `ScriptExecutionModal.tsx` is completely mock/stubbed with simulated `setTimeout` delays and is not integrated into `TabManager.tsx` or `ServerManagerPage.tsx`.

---

## 2. Server Setup & Launch Settings Matrix

The table below catalogs all ARK: Survival Ascended launch parameters and profile configuration fields present in the codebase, comparing what the backend/scripts support versus what the UI presents.

| Setting / Launch Flag | Target Location | Supported in Backend / Scripts | Present in UI (`ServerManagementModal` / `InstanceManager`) | Status & Gap |
| :--- | :--- | :--- | :--- | :--- |
| **`name`** | Profile / Task | ✅ Yes | ✅ Yes | Editable in `ServerManagementModal`. |
| **`host`** | Profile | ✅ Yes (`127.0.0.1`) | ✅ Yes | Editable in `ServerManagementModal`. |
| **`port` (RCON Port)** | Profile | ✅ Yes (`28155`, etc.) | ✅ Yes | Treated as RCON port in UI. |
| **`password` (RCON / Admin Password)** | Profile & Launch Cmd | ✅ Yes (`ServerAdminPassword=...`) | ⚠️ Partial | Editable in UI as RCON password; in `InstanceManager` as `adminPassword`. Never synced between profile and launch flags! |
| **`directory` (Instance Path)** | Profile & Process | ✅ Yes (`ShooterGame\Binaries\Win64`) | ✅ Yes | Directory path to game instance folder. |
| **`game`** | Profile | ✅ Yes (`"ark_sa"`) | ✅ Yes | Dropdown in `ServerManagementModal`. |
| **`autoStart`** | Profile | ✅ Yes (checked on startup) | ❌ **Missing from UI** | Implemented in backend `ProcessManager.ts` (starts if true and not manually stopped), but no checkbox in `ServerManagementModal`! |
| **`manuallyStopped`** | Profile | ✅ Yes (tracks manual stop) | ℹ️ Read-only indicator | Tracked by backend when user clicks Stop; clears on Start. |
| **`baseInstallId` / `baseInstallPath`**| Profile | ✅ Yes | ❌ **Missing from Profile UI** | Detected via junction or set during install; not shown or editable in server profile modal. |
| **`queryPort`** | Launch Commandline | ✅ Supported (`?QueryPort=28005`) | ⚠️ Only in Install Form | Asked during install form, but never saved to profile or used to generate `parsedCommandline`. |
| **`gamePort` (Port)** | Launch Commandline | ✅ Supported (`Port=28705`) | ⚠️ Only in Install Form | Asked during install form, but never saved to profile or used to generate `parsedCommandline`. |
| **`mapName`** | Launch Commandline | ✅ Supported (`TheIsland_WP`, etc.) | ⚠️ Only in Install Form | Hardcoded default `TheIsland` in install form; never saved to profile or editable later. |
| **`sessionName`** | Launch Commandline | ✅ Supported (`?SessionName="Name"`) | ⚠️ Only in Install Form | Never saved to profile or launch flags. |
| **`serverPassword` (Join Password)** | Launch Commandline | ✅ Supported (`ServerPassword=...`) | ⚠️ Only in Install Form | Input in install form, discarded immediately. |
| **`maxPlayers`** | Launch Commandline | ✅ Supported in PowerShell (`MaxPlayers=100`) | ❌ **Missing in UI** | Completely absent from frontend UI forms. |
| **`-mods`** | Launch Commandline | ✅ Supported (`-mods=928708,...`) | ❌ **Missing in UI** | Present in active `config.json` instances, but no field in UI to configure or update mod IDs. |
| **`-clusterID`** | Launch Commandline | ✅ Supported (`-clusterID="mythos"`) | ❌ **Missing in UI** | Present in active `config.json` instances, but completely unexposed in UI. |
| **`-ClusterDirOverride`** | Launch Commandline | ✅ Supported (`-ClusterDirOverride="..."`)| ❌ **Missing in UI** | Critical for multi-server cluster transfers on the same machine. No UI field. |
| **Server Flags** (`-NoBattlEye`, `-crossplay`, `-ForceAllowCaveFlyers`, `-automanagedmods`, `-ServerPlatform=ALL`, etc.) | Launch Commandline | ✅ Supported in active instances | ❌ **Missing in UI** | Hardcoded in `config.json` instances or PowerShell scripts; user cannot toggle or customize server flags in the GUI. |
| **`parsedCommandline` (Raw/Array)** | Profile | ✅ Used directly by `spawn()` | ❌ **Missing in UI** | `ProcessManager.ts` takes `profile.parsedCommandline` directly. There is no CLI builder or raw argument editor in the frontend. |

---

## 3. Configuration & Template Settings (INI Editor Gaps)

The frontend includes a **Config** tab (`ServerConfigTab.tsx`) with an extensive schema from `ark-settings-template.json` (over 2,400 lines) to edit `Game.ini` and `GameUserSettings.ini`.

However, several settings and behaviors are missing:

1. **New Instance Configuration Initialization**:
   - When a new instance is created, `ShooterGame\Saved\Config\WindowsServer` is created empty.
   - There is no template copying or default generation of `GameUserSettings.ini` with `[ServerSettings]`, `RCONPort`, `RCONEnabled=True`, `ServerAdminPassword`, etc.
   - Without these defaults, a newly created server cannot even accept RCON connections upon startup.
2. **Missing RCON Activation in INI**:
   - `RCONPort` and `RCONEnabled` in `GameUserSettings.ini` are required for the Node.js backend to connect, but they are not automatically populated when configuring or creating a server.
3. **Hardcoded Ports in Template vs. Profile**:
   - Changing the port or password in `ServerManagementModal` does not prompt to update `GameUserSettings.ini`, leading to configuration drift where RCON cannot authenticate.
4. **Unsupported Sections**:
   - Custom mod settings sections (e.g. `[StructuresPlus]`, `[DinoStorage]`) outside `[/Script/ShooterGame.ShooterGameMode]` and `[ServerSettings]` are omitted from `ark-settings-template.json` and cannot be added without manual file editing.

---

## 4. Script Execution & Automation System Audit

The codebase has requirements and backend modules for automated server scripts:
- **`src/backend/rconScriptEngine.ts`**:
  - Implements `parseScript()`, `executeScript()`, `wait <ms>`, and `update-base-install <id>`.
  - Backend endpoints exist in `server.ts`: `POST /api/execute-script`, `GET /api/script-status/:key`, `POST /api/cancel-script`.
- **UI Status / Gap**:
  - `src/frontend/ScriptExecutionModal.tsx` exists as a stub with dummy `setTimeout` logic and hardcoded restart warnings.
  - The modal is **never imported or rendered** in `ServerManagerPage.tsx` or `TabManager.tsx`.
  - The right-click context menu in `TabManager.tsx` described in `requirements.server-instance-management.md` is not implemented (only inline "Start" and "Stop" buttons exist).

---

## 5. Development Checklist

### Priority 1: Fix Instance Creation & Profile Auto-Registration (Immediate Fix)
- [x] **Elevated Service Instance Provisioning**:
  - In `elevated/src/handlers/installInstance.ts`, add default initial `GameUserSettings.ini` creation containing:
    ```ini
    [ServerSettings]
    RCONEnabled=True
    RCONPort=<queryPort or rconPort>
    ServerAdminPassword=<adminPassword>
    ServerPassword=<serverPassword>
    ```
- [x] **Profile Auto-Creation on Install**:
  - Update `BaseInstallHandler.ts` (handler for `installInstance`):
    - After `sendElevatedCommand('InstallInstance')` succeeds, construct a new `ServerProfile` in `config.profiles`.
    - Generate the default `parsedCommandline` array incorporating the user's `mapName`, `sessionName`, `queryPort`, `gamePort`, `adminPassword`, and base flags.
    - Persist to `config.json` via `saveProfiles()` and broadcast `profilesChanged`.
- [x] **Consolidate Duplicate Install Modals**:
  - Remove deprecated `InstanceInstallModal.tsx` (or unify it with `InstanceManager.tsx`).
  - Refresh server profile list in the UI upon successful installation so the new server appears immediately in the left sidebar.

### Priority 2: Expose Missing Server Launch Settings in UI
- [x] **Add Missing Profile Controls in `ServerManagementModal.tsx`**:
  - Add **"Auto-Start on Boot"** checkbox (`autoStart: boolean`).
  - Add **Game Port / Query Port** inputs distinct from RCON Port.
  - Add **Map Selection** dropdown (The Island, Scorched Earth, The Center, Aberration, Extinction, custom).
  - Add **Mod IDs** input (`-mods=...`) with clean comma-separated handling and whitespace normalization.
  - Add **Cluster Configuration** fields (`-clusterID` and `-ClusterDirOverride`).
  - Add **Launch Flags** toggles (`-NoBattlEye`, `-crossplay`, `-ForceAllowCaveFlyers`, `-automanagedmods`, `-servergamelog`, `-severgamelogincludetribelogs`, `-ServerRCONOutputTribeLogs`, `-NotifyAdminCommandsInChat`, `-noundermeshchecking`, `-noantispeedhack`).
  - Add an **"Advanced Command-Line Arguments"** editor (allowing raw view and editing of `profile.parsedCommandline` with bidirectional form synchronization).

### Priority 3: Server Configuration & INI Improvements
- [x] **Auto-Sync RCON Settings to INI**:
  - Ensure updating a server profile's port or password prompts to update the instance's `GameUserSettings.ini`.
- [x] **Custom / Mod INI Section Support**:
  - Allow adding arbitrary INI keys and custom mod sections in `ServerConfigTab.tsx` beyond the static template.
- [x] **Raw INI File Editor Fallback**:
  - Provide a toggle in `ServerConfigTab.tsx` to view and edit the raw text of `Game.ini` and `GameUserSettings.ini` directly.

### Priority 4: Script Execution & Right-Click Context Menu
- [x] **Wire `ScriptExecutionModal` to Backend**:
  - Replace mock `setTimeout` in `ScriptExecutionModal.tsx` with actual WebSocket or REST calls to `/api/execute-script` and `/api/script-status`.
- [x] **Context Menu in `TabManager.tsx`**:
  - Implement a right-click context menu on server items in the sidebar:
    - Start Server
    - Stop Server / Graceful Shutdown
    - Execute Script...
    - Open Directory in Explorer
- [x] **Multi-Server Batch Actions**:
  - Enable multi-selection checkboxes or Ctrl/Shift-click in `TabManager.tsx` to start/stop or execute scripts on multiple servers simultaneously.

### Priority 5: Custom Script Template Persistence (Option A)
- [x] **Backend Script Storage & REST API**:
  - Implement `ScriptTemplate` interface and repository in `src/backend/scriptTemplates.ts` with built-in templates and `config.customScripts` persistence.
  - Add endpoints: `GET /api/scripts`, `POST /api/scripts`, `DELETE /api/scripts/:id`.
  - Safeguard built-in templates from deletion or overwrite.
- [x] **Frontend Script Template Management in `ScriptExecutionModal.tsx`**:
  - Load script templates dynamically from `/api/scripts` with optgroup grouping (Built-in Presets vs Custom Templates).
  - Add "Save As New Template" with name and description fields.
  - Add "Save Changes" for updating existing custom scripts.
  - Add "Delete Template" with confirmation for custom scripts.
  - Add local script file import (`.rcon`, `.txt`) and export/download.
- [x] **Automated Testing**:
  - Add unit tests in `src/backend/__tests__/scriptTemplates.spec.ts`.
  - Add integration tests in `src/backend/__tests__/api.integration.spec.ts`.

### Priority 6: Server Crash & Engine Log Viewer (Option B)
- [x] **Log File Inspection API**:
  - Implement `GET /api/server-logs/:key` to scan and tail `<instanceDirectory>\ShooterGame\Saved\Logs\` (`ShooterGame.log`, timestamped backups, and crash dumps).
- [x] **Frontend Log & Crash Modal / Tab**:
  - Add "View Server Logs / Crash Reports" in the right-click context menu in `TabManager.tsx` and button in `ServerConfigTab.tsx`.
  - Add dedicated monospace log viewer with search, tailing, and download log options (`ServerLogsModal.tsx`).
- [x] **Process Crash Detection & Auto-Recovery Hooks**:
  - Hook into process exit tracking in `ProcessManager.ts` to detect non-zero exit codes or abrupt closures when `manuallyStopped === false` and trigger automated recovery/alerts.

### Priority 7: SteamCMD Build ID & Game Update Notifier (Option C)
- [x] **ACF Manifest Parser & Periodic Build Checking**:
  - Parse `appmanifest_2430930.acf` from the `steamapps` folder of base installs to extract current `buildid`.
  - Periodically query SteamCMD public branch API (`https://api.steamcmd.net/v1/info/2430930`) for the latest build ID.
- [x] **UI Update Notifications**:
  - Display "Update Available" badges in `BaseInstallManager.tsx`, sidebar server items in `TabManager.tsx`, and in the RCON window header in `RconClientWindow.tsx`.
  - Expose base install association, build numbers, and update status in `ServerManagementModal.tsx` and `ServerConfigTab.tsx`.

### Priority 8: INI Backup History & Version Restore (Option D)
- [x] **Backup History API**:
  - Implemented `iniBackupManager.ts` with `listIniBackups()`, `getIniBackupContent()`, `getActiveIniContent()`, and `restoreIniBackup()`.
  - Added REST endpoints in `iniApi.ts`: `GET /api/server-ini/:keyOrIdx/backups`, `GET /api/server-ini/:keyOrIdx/backups/:filename`, and `POST /api/server-ini/:keyOrIdx/restore`.
  - Added WebSocket handlers in `IniHandler.ts`: `getIniBackups`, `getIniBackupContent`, and `restoreIniBackup`.
  - Enforces strict directory traversal and filename validation (`isSafeIniBackupFileName`).
  - Automatically creates pre-restore safety snapshots (`<base>.<timestamp>.pre-restore.backup.ini`) before rolling back configuration files.
  - Implemented LCS-based line diffing (`computeLineDiff`) and dual-pane side-by-side alignment (`computeSideBySideDiff`).
- [x] **Revision History UI in `ServerConfigTab.tsx` & `IniRevisionModal.tsx`**:
  - Built `IniRevisionModal.tsx` with base file selector (`GameUserSettings.ini` vs `Game.ini`), chronological revision list with safety badges, and multiple diff views (`Side-by-Side Diff`, `Unified Diff`, and `Raw Backup View`).
  - Added interactive restore confirmation dialog highlighting the target file, snapshot timestamp, and automatic safety snapshot guarantee.
  - Added "🕒 Revision History / Restore Backup" button in `ServerConfigTab.tsx` top bar and "🕒 Revisions" button in the active editor header.
  - Automatically refreshes the INI editor form and raw text upon restoring a revision.
- [x] **Automated Testing & Build Verification**:
  - Created unit test suite `src/backend/__tests__/iniBackup.spec.ts` (17 tests) covering snapshot discovery, safety classification, safe naming, pre-restore backup generation, restoration, and diff computation.
  - Expanded `src/backend/__tests__/api.integration.spec.ts` with integration tests for backup enumeration, content inspection, safety backups, and restoration.
  - All 113 Jest tests passing across 9 test suites; `npm run build` compiles with 0 errors.

### Priority 9: Live Server End-to-End Testing & Integration Validation (Option E)
- [x] **End-to-End Validation & Diagnostics**:
  - Validated multi-server batch script execution with parallelized dispatch in `ScriptExecutionModal.tsx`.
  - Implemented two-stage graceful shutdown in `ProcessManager.ts` with RCON `SaveWorld` + `DoExit` and timeout fallback to process termination.
  - Verified directory opening in Windows Explorer via `/api/open-directory` with path validation and audit logging.
- [x] **Backup Retention & Pruning Utility**:
  - Implemented `pruneIniBackups` and `deleteIniBackup` in `src/backend/iniBackupManager.ts` with strict pre-restore safety backup preservation.
  - Added REST endpoints `POST /api/server-ini/:keyOrIdx/backups/prune` and `DELETE /api/server-ini/:keyOrIdx/backups/:filename` with audit logging.
  - Added WebSocket handlers `pruneIniBackups` and `deleteIniBackup` in `src/backend/handlers/IniHandler.ts`.
  - Built interactive retention control popover ("🧹 Cleanup Backups") and individual snapshot delete buttons (🗑️) in `src/frontend/IniRevisionModal.tsx`.
- [x] **Active vs Stopped Server Diagnostics & INI Safety**:
  - Added active server running warning banners to `IniRevisionModal.tsx` and `ServerConfigTab.tsx` informing users that changes to running servers require restart and may be overwritten on shutdown.
  - Ensured companion `.updated.ini` timestamped files and safety restore snapshots prevent accidental configuration loss.
- [x] **Automated Testing & Build Verification**:
  - Expanded unit and integration test suites: 131 tests passing across 9 test suites (`npx jest --forceExit`).
  - Clean build across all three projects (`npm run build`): `build:backend`, `build:frontend`, and `build:elevated` with 0 errors.

### Priority 10: Deep URL Routing, Bookmarking & Frontend Reconnect Modal
- [x] **Deep URL Routing & Server Bookmarking**:
  - Implemented `src/frontend/urlRouting.ts` with `parseUrlParams`, `buildUrlHash`, `updateUrlHash`, `resolveBookmarkedServerKey`, and `copyBookmarkLink`.
  - Supports deep routing via URL hash (e.g. `#server=127.0.0.1:28155`, `#server=...&activity=config`, or `#127.0.0.1:28155`) and query string fallback (`?server=...`).
  - Automatically selects the bookmarked server upon initial page load and when profiles arrive from the backend.
  - Synchronizes browser URL via `history.replaceState` without page reload when switching server tabs or activity tabs (`rcon`, `config`, `baseinstalls`).
  - Listens to `hashchange` and `popstate` events to respond immediately to browser back/forward buttons and URL modifications.
  - Added "🔗 Copy Bookmark Link" option to the server right-click context menu in `src/frontend/TabManager.tsx` with instant feedback notification.
  - Added "🔗 Bookmark" button to the RCON window header in `src/frontend/RconClientWindow.tsx` for one-click link copying.
- [x] **Connection Loss Modal & Automated Reconnection Loop**:
  - Upgraded `src/frontend/DisconnectedModal.tsx` into a modern, dark-themed interactive modal dialog with pulsing glow indicators and status diagnostics.
  - Implemented 5-second automatic reconnection cycle with a 1-second interval countdown ticker display ("Retrying in X seconds...").
  - Displays live attempt counter badge ("Attempt #N"), progress indicator bar, and backend WebSocket target URL.
  - Added manual "🔄 Retry Now" interactive button allowing immediate reconnection without waiting for the timer.
  - Configured auto-dismissal upon reconnection (`ws.onopen`), resetting retry attempts and countdown timers, and reloading profiles and session lines.
- [x] **Automated Testing & Build Verification**:
  - Created unit test suite `src/frontend/__tests__/urlRouting.spec.ts` (19 tests) covering hash parsing, query params, precedence, server resolution by host:port and name, hash generation, and edge cases.
  - Created unit test suite `src/frontend/__tests__/reconnectModal.spec.ts` (16 tests) covering retry ticker formatting, attempt badge formatting, progress percentage calculation, and conditional modal rendering.
  - Expanded Jest test suite to 166 tests passing across 11 test suites (`npx jest --forceExit`).
  - Clean compilation across all three builds (`npm run build`): `build:backend`, `build:frontend`, and `build:elevated` with 0 errors.

### Priority 11: Multi-Server Batch RCON Command Broadcasting (Option 1)
- [x] **Backend Multi-Server Broadcasting Engine & APIs**:
  - Extended WebSocket `handlers.command` in `SessionHandler.ts` to support both single `key: string` and batch `keys: string[]`.
  - Implemented dedicated WebSocket message handler `handlers.broadcastCommand` dispatching commands concurrently across all target servers via `Promise.allSettled(keys.map(k => rconManager.sendCommand(k, command)))`.
  - Emits `broadcastCommandResult` events containing aggregated per-server execution outputs and status classifications (`success`, `disconnected`, `error`).
  - Preserves audit trail and single-server tab history by updating `sessionLines[key]` on disk and broadcasting individual `sessionLine` events for every targeted server.
  - Added REST endpoint `POST /api/broadcast-command` with payload validation (`keys: string[]`, `command: string`), concurrent dispatch, and structured audit logging (`auditLog('broadcastCommand', ...)`).
- [x] **Frontend Broadcast Terminal & Multi-Server Mode**:
  - In `RconClientWindow.tsx`, implemented multi-server selection mode when 2+ servers are selected (`selectedKeys.length > 1`).
  - Added multi-server notice banner per `requirements.server-instance-management.md:48`: *"⚠️ Multi-Server Selection Active (N servers): Real-time output streams and player lists for individual servers are unavailable. Batch controls in the sidebar and RCON Command Broadcasting are enabled."*
  - Added server status chips with individual `Connected` (green) / `Disconnected` (red) badges and overall connection summary (`N Connected, M Disconnected`).
  - Disabled/hid live player list with informative message card: *"Player list is unavailable when multiple servers are selected."*
  - Implemented unified broadcast terminal console (`__broadcast__` session) with ANSI syntax coloring: bold cyan `[BROADCAST] > command`, bold green `[ServerName (host:port)]` for successful responses, and bold red `[ServerName (host:port)]` for errors/disconnections.
  - Enabled command input bar in multi-server mode with dynamic placeholder, `Broadcast (N)` button, `Broadcasting...` progress indicator, and command history (Arrow Up/Down).
  - Added "Clear Log" button for broadcast session and "Clear Selection" button.
  - Integrated in `ServerManagerPage.tsx` with asynchronous `handleBroadcastCommand` dispatch, promise resolution, and WebSocket `broadcastCommandResult` parsing.
- [x] **Automated Testing & Build Verification**:
  - Created unit test suite `src/backend/__tests__/broadcastCommand.spec.ts` (8 tests) covering input validation, multi-server concurrent dispatch, bounded history persistence, and status classification.
  - Added integration test suite in `src/backend/__tests__/api.integration.spec.ts` testing `POST /api/broadcast-command` for validation error codes and multi-server response schemas.
  - Created frontend unit test suite `src/frontend/__tests__/broadcastFormatting.spec.ts` (10 tests) verifying ANSI formatting, label resolution, and connection summary calculations.
  - Total test suite expanded to 186 passing tests across 13 test suites (`npx jest --forceExit`).
  - Clean compilation across all three build targets (`npm run build`) with 0 errors.
