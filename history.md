# RCON Manager Development History

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