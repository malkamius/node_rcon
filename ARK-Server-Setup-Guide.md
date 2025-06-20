# ARK: Survival Ascended Server Setup Guide (Windows)

This guide explains how to use the provided PowerShell scripts to set up and manage an ARK: Survival Ascended dedicated server on Windows.

---

## 1. Create the RCON Admin User

**Script:** `Create-RCON-User.ps1`

- **Purpose:** Creates a local Windows user (`Node.RCON`) and adds it to the Administrators group for server management.
- **How to use:**
  1. Open PowerShell as Administrator.
  2. Run:
     ```powershell
     .\Create-RCON-User.ps1
     ```
  3. Enter a password when prompted.

---

## 2. Download SteamCMD

**Script:** `Download-steamcmd.ps1`

- **Purpose:** Downloads and extracts SteamCMD, required for installing/updating ARK server files.
- **How to use:**
  1. Choose an install directory, e.g., `C:\steamcmd`.
  2. Run:
     ```powershell
     .\Download-steamcmd.ps1 -installDir "C:\steamcmd"
     ```

---

## 3. Install Base Server Files

**Script:** `Install-Base-Server-Files.ps1`

- **Purpose:** Installs the core ARK server files to a shared directory using SteamCMD.
- **How to use:**
  1. Choose a base install directory, e.g., `C:\ArkASA_SharedFiles`.
  2. Run:
     ```powershell
     .\Install-Base-Server-Files.ps1 -BaseServerInstallDirectory "C:\ArkASA_SharedFiles" -SteamCmdPath "C:\steamcmd\steamcmd.exe"
     ```

---

## 4. Create a Server Instance

**Script:** `Install-Instance.ps1`

- **Purpose:** Sets up a new server instance directory, linking to shared files but keeping save/config data separate.
- **How to use:**
  1. Choose an instance directory, e.g., `C:\ArkServers\MyServer1`.
  2. Run:
     ```powershell
     .\Install-Instance.ps1 -BaseServerInstallDirectory "C:\ArkASA_SharedFiles" -InstanceDirectory "C:\ArkServers\MyServer1"
     ```
  3. For cross-drive setups, add `-LinkType SymbolicLink`.

---

## 5. Schedule the Server to Start on Boot

**Script:** `Schedule-Server-Task.ps1`

- **Purpose:** Creates a Windows Scheduled Task to launch your ARK server automatically at system boot.
- **How to use:**
  1. Run (replace parameters as needed):
     ```powershell
     .\Schedule-Server-Task.ps1 -ServerName "My Ark Server" -ServerRootDirectory "C:\ArkServers\MyServer1" -AdminPasswordPlain "YourAdminPassword"
     ```
  2. You can specify other options like `-MapName`, `-QueryPort`, `-MaxPlayers`, etc.

---

## 6. Updating the Server

**Script:** `Update-ARK-Server.ps1`

- **Purpose:** Updates the base server files using SteamCMD.
- **How to use:**
  1. Run:
     ```powershell
     .\Update-ARK-Server.ps1 -ServerInstallDirectory "C:\ArkASA_SharedFiles" -SteamCmdPath "C:\steamcmd\steamcmd.exe"
     ```

---

## Notes
- Always run scripts in an elevated PowerShell session ("Run as Administrator").
- Adjust paths and parameters as needed for your environment.
- For more details, see comments in each script.
