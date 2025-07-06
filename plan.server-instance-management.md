# 2025-07-06: WebSocket Handler Refactor
- Refactored WebSocket message handling in `server.ts` to use handler classes per domain (session, profile, base install, ini/config).
- Each handler exposes a map of message type to function. Master handler map dispatches messages.
- Added documentation table in `handlers/README.md`.

## Next Steps
- Test all WebSocket message types for correct routing and behavior.
- Consider further splitting or documenting handler context dependencies.

## Chat History Summary
2025-07-06: Refactored WebSocket message handling in `server.ts` to use handler classes per domain. Each handler exposes a map of message type to function. Master handler map dispatches messages. Added documentation table in `handlers/README.md`.
# Server Instance Management Implementation Plan

This plan outlines the recommended approach for implementing the features described in `requirements.server-instance-management.md` for the `manage-instances` branch. The goal is to deliver robust, maintainable, and extensible server process and base file management for Ark: Survival Ascended servers.

---

## 1. Data Model & Config Updates
- **Update ServerProfile**: Add `autoStart`, `manuallyStopped`, and `baseInstallId` fields.
- **Add BaseInstallProfile**: Track `id`, `path`, `version`, `lastUpdated`, and metadata.
- **Backend Config**: Add `steamcmdPath` and `baseInstallUpdateCheckInterval`.

## 2. SteamCMD Integration
- **Install/Detect SteamCMD**: Implement logic to set and validate the SteamCMD path. Provide UI/config options for users to set/update the path.
- **Disable base file actions if SteamCMD is missing**: Show clear errors in frontend/backend.

## 3. Base File Install Management
- **Automatic Detection of Base File Installs**: For any server instance with a `directory` set, the backend should check the junction path of the `steamapps` folder (if it exists) to determine the base file install. Detected base install paths should be auto-added to the managed list (if not already present) and must be unique.
- **BaseInstall CRUD**: Backend endpoints and frontend UI for adding, updating, and removing base installs are implemented. Auto-detected installs are included and duplicates are prevented. Users can now fully manage base installs from the UI.
- **Steamapps & .acf Parsing**: On base install add/update or auto-detection, check for `steamapps` folder and parse `appmanifest_2430930.acf` for `buildid`.
- **Build ID & Update Checks**:
  - Periodic (configurable) backend polling of the SteamCMD API for the latest build id is implemented.
  - Local build id is compared; base installs are marked as "update available" if out of date.
  - Update status is exposed in frontend base install management and RCON window header.
- **Prevent Updates While In Use**: Block base install updates if any running server is using the install.

## 4. Server Process Management
- **Process Manager Service**:
  - Track running server processes, start/stop, and monitor exit events.
  - On backend startup, auto-start servers as per profile settings and manual stop state.
  - Track and expose process start time.
- **Frontend Controls**:
  - Add right-click context menu in TabManager for start/stop (single/multi-select).
  - Show process status in server list and RCON window.
  - Multi-select disables output/player list, enables batch actions.

## 5. RCON Script Execution
- **Script Engine**:
  - Parse scripts line by line, supporting RCON commands, `wait <ms>`, and `update-base-install <id>`.
  - Implement script execution queue per server, with status/cancellation support.
  - Block `update-base-install` if any server using the base is running.
  - Provide built-in restart/update script template.
- **Frontend Integration**:
  - Add "Execute Script" to RCON manager context menu (multi-select supported).
  - Modal for script selection and execution.
  - Show script status and allow cancellation.

## 6. Error Handling, Logging, and Security
- **Robust error messages** for all user actions.
- **Audit logging** for process and base install actions.
- **Security**: Restrict sensitive actions to authorized users (future-proof for RBAC).

## 7. Extensibility & Testing
- **Design for future games/types**: Abstract process and install management for easy extension.
- **Unit/integration tests** for backend services and critical frontend flows.

---

## Implementation Order (Progress)
1. Data model and config changes (complete)
2. SteamCMD detection and config UI (complete)
3. Base install CRUD, .acf parsing, and update check logic (complete)
4. Server process manager and backend process tracking (complete)
5. `/api/process-status` endpoint for real-time status of all managed servers (complete)
6. Frontend controls for process and base install management (complete: process status display, controls, and base install management UI)
7. RCON script engine and frontend integration (next)
8. Error handling, logging, and security improvements (next)
9. Testing and documentation (next)

---

## Notes
- Use TypeScript types/interfaces for all new models.
- Prefer async/await and robust error handling in backend.
- Use React context/hooks for frontend state where appropriate.
- Document all new endpoints and config options.

---

This plan is designed to deliver incremental value, with clear separation of concerns and extensibility for future features.
