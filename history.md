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
## 2025-07-06
- Migrated all session line and process status frontend fetch calls (`rconTerminalManager.ts`, `processStatusApi.ts`) to use the persistent WebSocket connection (`wsRequest`).
- Added WebSocket backend handler for `getProcessStatus` to support process status requests from the frontend.
- All session line actions (get, clear) and process status are now handled via the main WebSocket connection.
- Next steps: Review and migrate any remaining frontend fetch calls to WebSocket as needed.
## 2025-07-06
- Completed migration of all INI/config and process control actions in `ServerConfigTab.tsx` to use the shared WebSocket connection (`wsRequest`).
- Backend (`server.ts`) now supports `getServerIni`, `saveServerIni`, `startServer`, and `stopServer` WebSocket message types for these actions.
- Confirmed requirements and plan files for server config/INI management are up to date for this feature scope.
- Next steps: Continue migrating any remaining frontend fetch calls to WebSocket and add backend handlers as needed.
## 2024-06-09
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