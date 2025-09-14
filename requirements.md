# Requirements

- The application must support management of Ark server instances, including installation, configuration, and monitoring.
- All server instance install actions must be accessible from the server management modal in the frontend.
- Instance installs must allow specifying query port, game port, map name, session name, admin password, and optionally a server password.
- The backend must support running the PowerShell script for instance installs with admin permissions.
- All backend actions related to instance installs must be performed via WebSocket using the latest connection (via wsRef.current in the frontend).
- The backend must use adminSocketClient to execute scripts requiring admin permissions.
- REST endpoint `/api/install-instance` has been removed; all instance install actions are now handled via WebSocket and adminSocketClient.

## Additional notes
- Ensure all documentation and client code reference the WebSocket-based workflow for instance installs.
# WebSocket Message Handler Refactor (2025-07-06)
- WebSocket message handling must be organized by domain in handler classes under `src/backend/handlers/`.
- Each handler class must expose a `handlers` map of message type to handler function.
- `server.ts` must instantiate all handler classes and merge their handler maps for dispatch.
- Message type to handler mapping must be documented in `handlers/README.md`.
# Node.js RCON Manager Project Requirements

## 2025-06-17: New/Enhanced Features

- The horizontal elements of the main app window (e.g., sidebar, terminal area, current players window) must be resizable by the user (drag to resize horizontally).
  - [IMPLEMENTED] Resizing is available in the current frontend.
- The sizes of these elements must be saved per-server in the backend profile (config.json) and restored on load.
  - [IMPLEMENTED] Sizes are currently saved or restored per-server.
- Server profiles now support specifying the game (e.g., ARK: Survival Evolved/Ascended) and enabling extra features such as a current players window.
  - [PARTIALLY IMPLEMENTED] Game field is present in config, but extra features are not fully enabled.
- The current players window, if enabled, will show a live-updating list of players using the ListPlayers command, with a configurable update interval (seconds).
  - [IMPLEMENTED] Current players window is available in the frontend.
- The backend polls for ARK SE/SA chat messages using the `getchat` command and emits new messages to the frontend, which are displayed in the terminal.
  - [IMPLEMENTED]
- The frontend logs player connect/disconnect events to the terminal when the player list changes (not on first update).
  - [IMPLEMENTED]

## Overview
A Node.js application (written in TypeScript) that manages persistent RCON connections to multiple game servers. It provides a local web server with a frontend UI for interacting with these connections. The frontend uses xterm.js for terminal emulation, supports multiple tabs (one per server), and allows server management via a toolbar.

## Core Features

### Backend
**Persistent Node.js Process**: Runs continuously, managing RCON connections.
  - [IMPLEMENTED] The backend process is persistent.
**RCON Connection Management**:
  - Reads server configuration (IP, port, password, etc.) from a JSON file.  
    - [IMPLEMENTED] Reads from config.json.
  - Attempts to reconnect to any disconnected server every 5 seconds.  
    - [IMPLEMENTED] Reconnect logic is present.
  - No output is logged to the console or files; all status is shown in the UI.  
    - [IMPLEMENTED] No backend logging to files or console.
**Web Server**:
  - Hosts a local web server (configurable IP/port from JSON config).  
    - [IMPLEMENTED] Express server uses config.json for host/port.
  - Serves the frontend and provides a WebSocket or similar API for real-time RCON communication and status updates.  
    - [IMPLEMENTED] WebSocket API is used for RCON and status updates.


### Frontend

**xterm.js Integration**: Each RCON connection is displayed in a tab using xterm.js (with xterm-addon-fit for responsive resizing).
  - [IMPLEMENTED] xterm.js and xterm-addon-fit are used in the frontend.
**Tabs**: Each server connection has its own tab. Tabs show:
  - Server name/IP  
    - [IMPLEMENTED]
  - "Connected since" timestamp (if connected)  
    - [IMPLEMENTED]
  - "Disconnected since" timestamp (if disconnected)  
    - [IMPLEMENTED]
  - Tabs have an xterm window with all the contents of the rcon session (including command responses, chat messages, and player connect/disconnect events)  
    - [IMPLEMENTED]
  - Tabs can be navigated to directly with a hyperlink so people can bookmark individual server tabs. If they are not logged in, go to log in with a redirect url to the tab  
    - [NOT YET IMPLEMENTED] Direct tab links and login redirect are not yet available.
  - Switching tabs should not require reloading the page, could use ajax if it wants though  
    - [IMPLEMENTED] Tab switching is client-side, no reload required.
**Server Management Modal**:
  - Server management (add, edit, remove servers: IP/host, port, password) is handled in a modal dialog window, not inline or in a sidebar/toolbar.  
    - [IMPLEMENTED]
  - Modal is accessible from a toolbar or menu at the top of the UI.  
    - [IMPLEMENTED]
  - Changes are saved to the backend config JSON and applied live.  
    - [IMPLEMENTED]
**Toolbar**:
  - At the top of the UI.  
    - [IMPLEMENTED]
  - Provides access to open the server management modal and other controls.  
    - [IMPLEMENTED]
**Status Bar**:
  - At the top or bottom of each tab, shows connection status (Connected/Disconnected since ...).  
    - [IMPLEMENTED]
**No Logging**:
  - The backend does not log output to files or console; all status, chat, and player events are shown in the UI.  
    - [IMPLEMENTED]

#### Frontend Client Structure

**Entry Point (`index.html`)**:
  - Contains a `<div id="app"></div>` as the main mount point.  
    - [IMPLEMENTED]
  - Loads the main App class (e.g., `RconClientApp`) from a bundled JS file and instantiates it with the `app` element.  
    - [IMPLEMENTED]

**App Class (e.g., `RconClientApp`)**:
  - Responsible for initializing the entire frontend UI.  
    - [IMPLEMENTED]
  - Builds the main layout: toolbar at the top, tabs sidebar, and terminal area.  
    - [IMPLEMENTED]
  - Initializes:
    - **Toolbar**: Contains buttons for managing servers (opens modal) and creating new connections.  
      - [IMPLEMENTED]
    - **Server Management Modal**: Modal dialog for adding, editing, and removing server profiles. Inherits from a generic modal class for show/hide logic.  
      - [IMPLEMENTED]
    - **Tab Manager**: Manages connection tabs, each with its own xterm.js terminal and connection state.  
      - [IMPLEMENTED]
  - Sets up event listeners for UI actions (toolbar, modal, tabs, window resize, etc.).  
    - [IMPLEMENTED]
  - Handles WebSocket communication for RCON sessions and app-level events.  
    - [IMPLEMENTED]

**Toolbar**:
  - Implemented as a `div` with buttons for "Manage Servers" and "New Connection".  
    - [IMPLEMENTED]
  - Buttons trigger modal dialogs or new connection flows.  
    - [IMPLEMENTED]

**Server Management Modal**:
  - Modal dialog for server profile management (add, edit, remove).  
    - [IMPLEMENTED]
  - Triggered from the toolbar.  
    - [IMPLEMENTED]
  - Changes are saved to the backend config and applied live.  
    - [IMPLEMENTED]

**Tab Manager**:
  - Manages tabs for each RCON connection.  
    - [IMPLEMENTED]
  - Each tab contains an xterm.js terminal and its own WebSocket connection.  
    - [IMPLEMENTED] (WebSocket may be shared, but tab logic is per-connection)
  - Handles tab creation, activation, and connection state.  
    - [IMPLEMENTED]
  - Tabs can be navigated directly via hyperlinks for bookmarking.  
    - [NOT YET IMPLEMENTED] Direct tab links/bookmarks are not yet available.

**WebSocket Communication**:
  - Each tab manages its own WebSocket connection for RCON communication.  
    - [IMPLEMENTED] (Or a shared WebSocket with tab-specific routing)
  - The main app class may manage a base WebSocket for app-level events.  
    - [IMPLEMENTED]
  - If the front end is disconnected from the backend, a modal dialog should pop up and the frontend should start trying to reconnect to the backend every 5 seconds
    - [NOT IMPLEMENTED]
**Layout Flow**:
  1. `index.html` loads and instantiates the App class with the `app` element.  
     - [IMPLEMENTED]
  2. The App class builds the UI, initializes the toolbar, modal, and tab manager.  
     - [IMPLEMENTED]
  3. Toolbar provides access to open the server management modal and create new connections.  
     - [IMPLEMENTED]
  4. Server management modal is shown for server profile management.  
     - [IMPLEMENTED]
  5. Tab manager handles tabs, each with an xterm.js terminal and its own WebSocket. All tabs could use the same websocket, the app class could be responsible for handling data to/from the backend and just specify a tab id or something  
     - [IMPLEMENTED]

This structure ensures a modular, maintainable frontend that is easy to extend and reason about, especially for users new to React or frontend frameworks.

## Additional/Recommended Features
**Hot Reload Config**: Optionally, watch the config file for changes and reload servers without restarting the backend.  
  - [NOT YET IMPLEMENTED]
**Authentication**: Optionally, add a simple authentication layer for the web UI.  
  - [NOT YET IMPLEMENTED]
**Responsive UI**: Ensure the frontend works well on various screen sizes.  
  - [PARTIALLY IMPLEMENTED] Basic responsiveness, but not fully optimized for all devices.
**Graceful Shutdown**: On process exit, cleanly close all RCON connections.  
  - [IMPLEMENTED]
**Error Handling**: Show connection errors and retry attempts in the UI.  
  - [IMPLEMENTED]
**Frontend Framework**: Use React (with TypeScript) for the frontend for easier state management and UI updates.  
  - [IMPLEMENTED]
**WebSocket Communication**: Use WebSockets for real-time updates between backend and frontend.  
  - [IMPLEMENTED]
**Backend Debugging**: VS Code debug configuration is available for backend (Node.js) with `--inspect-brk` for breakpoints and inspection.
  - [IMPLEMENTED]

## Technologies
- **Backend**: Node.js, TypeScript, express.js (or fastify), rcon-client (or similar library)
- **Frontend**: React, TypeScript, xterm.js (with xterm-addon-fit), Material-UI (or similar for toolbar/tabs)
### Additional NPM Packages

- `xterm-addon-fit` (FitAddon): Required for responsive terminal resizing with xterm.js in the frontend.
- **Config**: JSON file for server and webserver settings

## File Structure (Suggested)
- `/src` (TypeScript source)
  - `/backend` (server, rcon management)
  - `/frontend` (React app)
- `/config.json` (server and webserver config)
- `/public` (static assets)
- `/README.md` (project documentation)

