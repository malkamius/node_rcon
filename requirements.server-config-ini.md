# Server Configuration & INI Management Requirements (`server-config-ini` branch)

## Overview
This document outlines the requirements and implementation plan for the new Server Configuration and INI management features, to be developed in the `server-config-ini` branch.

---

## 1. Activity Tabs in Frontend
- Add a tab bar at the top of the app for switching between activities:
  - RCon (existing, default)
  - Server Configuration (new)
- Each tab displays its own main content area.

## 2. Server Configuration Tab
- Shows a list of managed servers (from config or discovered by path).
- Each server entry displays:
  - Name (from config or folder)
  - IP/Port (if available)
  - Dedicated server directory path (new field)
- “Manage Servers” button (same as RCon tab, but accessible here too).
- Selecting a server loads its Game.ini and GameUserSettings.ini for editing.

## 3. Server Management Enhancements
- Add/Edit server modal supports:
  - IP (optional)
  - Port (optional)
  - Dedicated server directory path (optional)
  - At least one of (path or IP/port) must be provided.
- Save these fields in config.json.

## 4. INI File Management
- Use a Node.js INI library (e.g., `ini` or `iniparser`) in the backend to read/write Game.ini and GameUserSettings.ini.
- When a server is selected, backend loads the INI files and sends their contents to the frontend as structured data.
- Frontend displays settings as a form:
  - Each setting has a checkbox (enabled if present in the INI, unchecked if not).
  - Input type (checkbox, slider, textbox, etc.) is determined by a JSON template describing available options and types for each setting.
- User can add/remove/modify settings, then save changes.
- Saving sends the updated structure to the backend, which writes the INI files.

## 5. Settings Templates
- Store JSON templates for each game type (e.g., ARK: Survival Evolved) describing:
  - INI sections
  - Setting names
  - Data types (float, int, string, bool, enum, etc.)
  - UI hints (slider min/max, dropdown options, etc.)
- Use these templates to render the settings UI and validate input.

---

## Implementation Steps

1. Add a new tab bar to the frontend (React) for activity switching.
2. Add a Server Configuration tab with server selection and INI editing UI.
3. Update server management modal to support the new directory path field and flexible connection info.
4. Add backend endpoints for reading/writing INI files using a Node.js INI library.
5. Create JSON templates for settings and use them to render the settings editor UI.

---

This document is specific to the `server-config-ini` branch and should be updated as development progresses.
