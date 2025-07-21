# Plan: Frontend Server Management Panels

## Steps
- [x] Create SteamCmdManager component for SteamCMD path and install
- [x] Create BaseInstallManager component, refactor to depend on SteamCMD detection
- [x] Create InstanceManager component for instance install, with base install selection
- [x] Create ServerManagementPage to host all panels
- [ ] Integrate with backend websocket for SteamCMD and base install management
- [ ] Test all panels and flows
- [ ] Update documentation and requirements as needed

## Dependencies
- Backend websocket API for SteamCMD and base install management

## Recent Chat History Summary
- User requested splitting base install manager into three panels: SteamCMD, base installs, and instance management.
- Requirements: SteamCMD panel for path/install, base install panel (disabled if no SteamCMD), instance panel (disabled if no base installs/SteamCMD), all on a new management page.
- Backend already provides websocket API for SteamCMD and base install management.
