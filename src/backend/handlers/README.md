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
