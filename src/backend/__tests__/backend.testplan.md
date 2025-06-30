# Backend Test Plan: Server Instance Management

This document outlines the initial test plan for backend unit and integration tests for Ark: Survival Ascended server management features.

## Scope
- Process management (start/stop, auto-start, manual stop tracking)
- Base install CRUD and update logic
- RCON script execution and automation
- API endpoints for process status, script execution, and base install management

## Test Types
- Unit tests for core logic (process manager, script engine, config validation)
- Integration tests for API endpoints (Express routes)
- Mocking of child_process, fs, and network requests as needed

## Initial Test Cases
- [ ] Start server process: should spawn process and update status
- [ ] Stop server process: should kill process and update status
- [ ] Auto-start logic: should start only eligible servers on backend startup
- [ ] Manual stop tracking: should prevent auto-start if manually stopped
- [ ] Base install CRUD: add, update, remove, and validate uniqueness
- [ ] Base install update: block if any server is running with that base
- [ ] Script execution: parse and execute RCON commands, wait, and update-base-install
- [ ] Script cancellation: cancel running script and update status
- [ ] API: /api/process-status returns correct status for all servers
- [ ] API: /api/execute-script starts script and returns execution key
- [ ] API: /api/script-status/:key returns correct script status
- [ ] API: /api/cancel-script cancels script execution

## Tools
- Jest (unit/integration testing)
- Supertest (Express API testing)
- ts-jest (TypeScript support)

## Next Steps
- Scaffold Jest config and initial test files in `src/backend/__tests__`.
- Implement mocks for process and file system operations.
- Add CI integration for automated test runs.
