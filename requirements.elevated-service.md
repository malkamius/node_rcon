# requirements.elevated-service.md

## Purpose
A Node.js/TypeScript service to perform privileged operations (e.g., creating junctions for Ark server instances) that previously required PowerShell scripts.

## Features
- Listens on port 12345 for HTTP POST requests.
- Accepts a `command` and `params` in the request body.
- Supports an `InstallInstance` command to create a new Ark server instance (initially by invoking the existing PowerShell script, but designed for future native Node.js implementation).
- Extensible handler/task system for future privileged operations.

## Next Steps
- Implement native Node.js logic for creating junctions/symlinks (replace PowerShell dependency).
- Add authentication/authorization for production use.
- Add more privileged commands as needed.
