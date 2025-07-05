# Server Instance Management Requirements

sample acf file from the local base file install:
appmanifest_2430930.acf

sample json from https://api.steamcmd.net/v1/info/2430930
2430930.json


## SteamCMD Installation & Management
- **SteamCMD Requirement**:
  - SteamCMD must be installed and its path stored in the backend configuration.
  - The backend should provide a way to set or update the SteamCMD path (configurable in the backend and optionally via the frontend UI).
  - SteamCMD is required for installing and updating base file installs.
  - If SteamCMD is not found or not configured, base file install/update actions should be disabled and a clear error should be shown.


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
- **Automatic Detection of Base File Installs**:
  - For any server instance with a `directory` set, the backend should attempt to determine the base file install by checking the junction path of the `steamapps` folder (if it exists) within the server directory.
  - If a valid junction is found, its target path should be used as the base install path for that server.
  - Any detected base install paths should be automatically added to the list of managed base file installs (if not already present).
  - All base file installs must be unique; duplicate paths should not be added.
- **Steamapps Folder & .acf Parsing**:
  - When managing base file installs, the backend must check if the `steamapps` folder exists within the base install path.
  - The backend should parse the `appmanifest_2430930.acf` file (located in the `steamapps` folder) to extract the current installed build id. The file is in a key-value format similar to JSON (see included example for structure).
  - The build id can be accessed via the `"buildid"` key in the ACF file.
- **Build ID & Update Checking**:
  - The backend should periodically (interval configurable in backend config and optionally via frontend) check the public branch build id from the SteamCMD API (`https://api.steamcmd.net/v1/info/2430930`, see `2430930.json` for structure: `data.2430930.depots.branches.public.buildid`).
  - If the build id in the ACF file does not match the latest public build id, the backend should mark the base install as "update available".
  - The frontend base file management screen should display the current build id, latest available build id, and whether an update is available for each base install.
  - The rcon screen could display that an update is available in the header of the rcon window
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
    - Additionally, check where a folder junction points to on disk (the backend should use this to auto-detect and manage base installs as described above).

### 3. RCON Script Execution & Automation
  - Users should be able to execute RCON scripts on one or more selected servers via a right-click context menu in the RCON manager ("Execute Script").
  - A modal should allow users to select a script and begin execution on all selected servers.
  - Scripts are plain text files parsed line by line. Each line is either an RCON command or a special command:
    - `wait <milliseconds>`: Pauses script execution for the specified time (not sent to RCON).
    - `update-base-install <baseInstallId>`: Triggers a base file update for the specified base install. This command must check that no running servers are using the base install before proceeding.
  - Provide a built-in restart/update script template, e.g.:
    - `serverchat SYSTEM: Restart and update in 15 minutes`
    - `wait 300000`
    - `serverchat SYSTEM: Restart and update in 10 minutes`
    - `wait 300000`
    - ...
    - In the last minute, send messages every 10 seconds until restart.
  - Scripts should support cancellation: provide an option to cancel all running scripts on selected servers.
  - The frontend should display script execution status and allow users to cancel or monitor progress.
  - Scripts should be extensible for future commands (e.g., pre/post-update hooks).

#### Frontend Requirements for RCON Script Execution
- Add a right-click context menu option in the RCON manager for "Execute Script" (multi-select supported).
- Display a modal dialog for script selection and execution parameters.
- On script execution, call the backend API to start the script for all selected servers.
- Poll script status for each selected server and display progress, current step, and any errors in the modal or RCON window.
- Provide a cancel button to stop script execution for any or all selected servers.
- Show clear feedback for script start, completion, errors, and cancellation.
- Support built-in and user-uploaded script templates (future enhancement).
- Design the UI and API integration to be extensible for additional script types and commands in the future.

### 4. Additional Features & Improvements
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
**Backend Config**:
  - Add: `steamcmdPath: string`, `baseInstallUpdateCheckInterval: number` (ms)
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
This system will provide robust, user-friendly management of Ark: Survival Ascended server processes, base file installs, and automated RCON script execution, with clear frontend controls and backend tracking. The design should be extensible for future server types and provide a solid foundation for advanced server management and automation features.
This system will provide robust, user-friendly management of Ark: Survival Ascended server processes and base file installs, with clear frontend controls and backend tracking. The design should be extensible for future server types and provide a solid foundation for advanced server management features.


# Original chat message
write a requirements.server-instance-management.md document. We are going to be implementing process management for the servers. These options require the server profile directory to be set(location of game files), and only work on ark survival ascended servers. So, a checkbox option under server management modal to start a server automatically. a property in server profiles to track whether the server was stopped manually. if stopped manually, do not start it when the backend starts up. when the backend starts up, it should check processes for if there is a process with the path of the directory + ShooterGame\Binaries\Win64\ArkAscendedServer.exe, if it is not found and the server is set to start automatically and it wasn't manually shut down, start it. We will also manage updating base file installs. A button/window for managing base file installs should be available, and these should be tracked by the backend, maybe base install profiles? a button for installing server instances pointing to base file installs. Ability to update base file installs, requires any instances pointing to that install to not be running. Might be able to see running instances by checking where a folder junction is pointing to? Or we could store where the instance was set up to point to in the profile. We won't be creating a task for each server instance, the backend will manage starting/stopping processes... right click context menu for servers in the front end tab manager with options for starting/stopping a server. Should be able to select multiple servers(rcon content window will show a message saying multiple servers selected, can't show output/connected players won't work either) and right click to shutdown/start all the servers etc. The backend should track processes of running servers and when they exit, it should update their status to the front end. Server process status should be displayed on the front end if rcon status is disconnected and server is running. If we can get the started date of the process, that would be cool too... If you can think of any improvements or other features to add, feel free.




Add requirements before base file install management to install steamcmd and store its path in the backend. steamcmd is required to install and update base files. Add requirements for base file install management to check if the steamapps folder exists and parse the .acf file(looks like json) for the build id, you can look at the format of the included acf file to get the keys to access the property. If the build id of the public branch provided by https://api.steamcmd.net/v1/info/2430930 json(You can look at 2430930.json to see the keys needed to access the build id). The backend should check for updates periodically(configurable in config/maybe front end?). the front end screen for base file management should display if updates are available. We will need the ability to execute rcon scripts which are parsed for commands and sent 1 at a time with an option for a wait command that is not an rcon command, but will pause processing of the script for however many milliseconds. We will include a restart/update script that sends a message using "serverchat SYSTEM: Restart and update in 15 minutes" newline wait 300000
"serverchat SYSTEM: Restart and update in 10 minutes" newline wait 300000 etc. the last minute will have messages every 10 seconds or so until the last  option to cancel all running scripts on the selected servers... Ability to right click on all selected servers in the rcon manager and "Execute Script" which brings up a modal to select the script and begin executing. a script command that is not an rcon command to update base files, that command needs to check if any of the servers running are pointing to those base files and not run if they are. Expand on this however you think would be appropriate.

The backend should be able to determine base file install of servers with a directory set. From "instances" by checking the junction path of the steamapps folder if it exists, is that possible? These base install paths will automatically be added for management at the end of existing base file installs. Base file installs should be unique. Please update the requirements and plan to reflect all this.
