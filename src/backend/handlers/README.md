# INI Handler WebSocket Message Types

| Message Type    | Handler Class | Description |
|-----------------|---------------|-------------|
| getServerIni    | IniHandler    | Loads INI file for a server profile and sends as object. |
| saveServerIni   | IniHandler    | Saves INI file for a server profile. Uses deep merge to preserve existing properties not specified in new settings. |

## Deep Merge Behavior (2025-07-13)
- When saving INI files, the backend uses `deepMerge` from `iniApi.ts`.
- Existing INI properties not specified in the new settings are preserved.
- Duplicate entries, arrays, and nested sections are merged according to the rules in `deepMerge`.
- This ensures that only the provided settings are updated, while all other settings remain intact.

---

**Next steps:**
- Test INI save functionality to confirm deep merge works as expected for all INI property types.
- Update requirements and plan files for any additional INI/config management changes needed.

# WebSocket Message Handlers

This directory contains handler classes for WebSocket message types, grouped by domain. Each handler exposes a `handlers` map of message type to handler function.

| Message Type                | Handler Class         | File                  |
|-----------------------------|----------------------|-----------------------|
| getSessionLines             | SessionHandler       | SessionHandler.ts     |
| clearSessionLines           | SessionHandler       | SessionHandler.ts     |
| command                     | SessionHandler       | SessionHandler.ts     |
| adminTask                   | SessionHandler       | SessionHandler.ts     |
| getProfiles                 | ProfileHandler       | ProfileHandler.ts     |
| saveProfiles                | ProfileHandler       | ProfileHandler.ts     |
| getProcessStatus            | ProfileHandler       | ProfileHandler.ts     |
| startServer                 | ProfileHandler       | ProfileHandler.ts     |
| stopServer                  | ProfileHandler       | ProfileHandler.ts     |
| shutdownserver              | ProfileHandler       | ProfileHandler.ts     |
| startserver                 | ProfileHandler       | ProfileHandler.ts     |
| getBaseInstalls             | BaseInstallHandler   | BaseInstallHandler.ts |
| addBaseInstall              | BaseInstallHandler   | BaseInstallHandler.ts |
| updateBaseInstall           | BaseInstallHandler   | BaseInstallHandler.ts |
| removeBaseInstall           | BaseInstallHandler   | BaseInstallHandler.ts |
| updatebaseinstall           | BaseInstallHandler   | BaseInstallHandler.ts |
| getServerIni                | IniHandler           | IniHandler.ts         |
| saveServerIni               | IniHandler           | IniHandler.ts         |

## Adding New Handlers
- Add a new handler class in this directory.
- Export a `handlers` map from the class.
- Register the handler in `server.ts` by merging its handlers into the master handler map.
