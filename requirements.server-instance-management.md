# Server Instance Management Requirements

## Overview
This document outlines the requirements for implementing process management and base file install management for Ark: Survival Ascended server instances. The goal is to allow the backend to manage server processes directly, provide robust controls for starting/stopping servers, and manage base file installations and updates. These features are only available for Ark: Survival Ascended servers and require the `directory` property to be set in the server profile (location of game files).

---

## Features & Requirements

### 1. Server Process Management
- **Automatic Start Option**: 
  - Add a checkbox in the Server Management Modal to enable "Start server automatically" for each server profile.
  - This option is only available if the server profile's `directory` is set and the game is Ark: Survival Ascended.
- **Manual Stop Tracking**:
  - Add a property to server profiles to track if the server was stopped manually (e.g., `manuallyStopped: boolean`).
  - If a server was stopped manually, it should NOT be started automatically when the backend starts up.
- **Startup Behavior**:
  - On backend startup, for each Ark: Survival Ascended server profile with `directory` set:
    - Check if a process is running with the path `[directory]\ShooterGame\Binaries\Win64\ArkAscendedServer.exe`.
    - If not running, and the server is set to start automatically and was not manually stopped, start the server process.
- **Process Tracking**:
  - The backend should track the process for each running server instance.
  - When a server process exits, update its status and notify the frontend.
  - If possible, track the process start date/time and display it in the frontend.
- **Frontend Controls**:
  - Add a right-click context menu to the server list (TabManager) with options to start/stop a server.
  - Support multi-select for servers. When multiple servers are selected, show a message in the RCON content window indicating that output and player lists are unavailable, but allow batch start/stop actions. Also allow commands to be sent to all selected servers
  - Display server process status in the frontend. If RCON is disconnected but the process is running, show this status.

### 2. Base File Install Management
- **Base Install Profiles**:
  - The backend should track base file installs as separate profiles (e.g., `baseInstalls`).
  - Each base install profile should include its path, version, and any relevant metadata.
- **Base Install Management UI**:
  - Add a button/window in the frontend for managing base file installs.
  - Allow users to add, update, or remove base file installs.
- **Server Instance Installation**:
  - Provide a button to install a new server instance, allowing the user to select a base file install as the source.
  - Store in the server profile which base install it was created from.
- **Updating Base Installs**:
  - Allow updating a base file install (e.g., via SteamCMD).
  - Prevent updates if any server instances using that base install are currently running.
  - To determine which instances are using a base install:
    - Preferably, store the base install reference in the server profile.
    - Optionally, check where a folder junction points to on disk.

### 3. Additional Features & Improvements
- **Process Status Details**:
  - If possible, display the process start time in the frontend.
- **Robust Error Handling**:
  - Provide clear error messages if starting/stopping a server fails.
  - Prevent starting a server if its directory or base install is missing or invalid.
- **Extensibility**:
  - Design the backend process manager to support future games or server types.
- **Security**:
  - Potentially ensure only authorized users can start/stop servers or update base installs.
- **Logging**:
  - Log all process management actions and base install updates for auditing.

---

## Data Model Changes
- **ServerProfile**:
  - Add: `autoStart: boolean`, `manuallyStopped: boolean`, `baseInstallId: string` (optional)
- **BaseInstallProfile**:
  - Add: `id: string`, `path: string`, `version: string`, `lastUpdated: Date`, etc.

---

## Open Questions / Future Enhancements
- Should we support scheduled restarts or updates for server instances?
- Should we allow custom pre/post-start scripts for advanced users?
- Should we expose process logs or crash reports in the frontend?

---

## Summary
This system will provide robust, user-friendly management of Ark: Survival Ascended server processes and base file installs, with clear frontend controls and backend tracking. The design should be extensible for future server types and provide a solid foundation for advanced server management features.


# Original chat message
write a requirements.server-instance-management.md document. We are going to be implementing process management for the servers. These options require the server profile directory to be set(location of game files), and only work on ark survival ascended servers. So, a checkbox option under server management modal to start a server automatically. a property in server profiles to track whether the server was stopped manually. if stopped manually, do not start it when the backend starts up. when the backend starts up, it should check processes for if there is a process with the path of the directory + ShooterGame\Binaries\Win64\ArkAscendedServer.exe, if it is not found and the server is set to start automatically and it wasn't manually shut down, start it. We will also manage updating base file installs. A button/window for managing base file installs should be available, and these should be tracked by the backend, maybe base install profiles? a button for installing server instances pointing to base file installs. Ability to update base file installs, requires any instances pointing to that install to not be running. Might be able to see running instances by checking where a folder junction is pointing to? Or we could store where the instance was set up to point to in the profile. We won't be creating a task for each server instance, the backend will manage starting/stopping processes... right click context menu for servers in the front end tab manager with options for starting/stopping a server. Should be able to select multiple servers(rcon content window will show a message saying multiple servers selected, can't show output/connected players won't work either) and right click to shutdown/start all the servers etc. The backend should track processes of running servers and when they exit, it should update their status to the front end. Server process status should be displayed on the front end if rcon status is disconnected and server is running. If we can get the started date of the process, that would be cool too... If you can think of any improvements or other features to add, feel free.