# plan.elevated-service.md

## Feature: Node.js Elevated Service for Privileged Operations

### Steps
1. Scaffold new Node.js/TypeScript project in `elevated/`.
2. Implement HTTP server on port 12345 with a task/handler registry.
3. Add `InstallInstance` handler.
4. Update `Register-ArkAdminSocketServerTask.ps1` to use `npm start` for the new service.
5. Document changes in `history.md` and update requirements/plan files.

### Chat History Summary
- User requested to move away from PowerShell for privileged operations, but keep scripts for now.
- New Node.js service should handle privileged tasks (starting with InstallInstance) and be extensible.
- Service should listen on port 12345 and use HTTP API.
- Register-ArkAdminSocketServerTask.ps1 should be updated to launch the new service.
