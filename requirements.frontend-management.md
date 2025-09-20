# Frontend Server Management Requirements

## Features
- SteamCMD management panel: Set/check SteamCMD path, install SteamCMD if not detected.
- Base Install management panel: List/add/remove base installs, disabled if SteamCMD not detected.
- Instance management panel: Select base install, set instance path, install instance. Disabled if no base installs or SteamCMD not detected.
- All panels are modular and combined in a new Server Management page.


## Notes
- Updating and installing base installs now supported via WebSocket (`updateSteamGame`, `installSteamGame`) with real-time progress updates.
- Progress is streamed to the frontend and shown in a column.
- Update/install actions are disabled if SteamCMD is not detected/installed at the current path.
- Instance management panel allows filtering/selection by base install.
- SteamCMD path is managed via websocket API (getSteamCmdInstall, getSteamCmdExistsAt, setSteamCmdPath, installSteamCmd).
