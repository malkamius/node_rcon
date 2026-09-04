import React from 'react';
import { InstanceInstallModal, InstanceInstallParams } from './InstanceInstallModal';
import { ModSelector } from './ModSelector';
import {
  STANDARD_FLAGS,
  PRESET_MAPS,
  ParsedLaunchSettings,
  parseCommandline,
  buildOrSyncCommandline,
  cleanModIds
} from './commandlineUtils';

export interface ServerProfile {
  name: string;
  host: string;
  port: number; // RCON Port
  password: string; // RCON / Admin Password
  game?: string;
  features?: {
    currentPlayers?: {
      enabled: boolean;
      updateInterval: number;
    }
  };
  directory?: string;
  autoStart?: boolean;
  manuallyStopped?: boolean;
  baseInstallId?: string;
  baseInstallPath?: string;
  baseInstallVersion?: string;
  latestBuildId?: string;
  updateAvailable?: boolean;
  parsedCommandline?: string[];
  processStatus?: any;

  // Top-level launch settings
  queryPort?: number;
  gamePort?: number;
  mapName?: string;
  serverPassword?: string;
  maxPlayers?: number;
  modIds?: string;
  clusterId?: string;
  clusterDirOverride?: string;
}

interface ServerManagementModalProps {
  show: boolean;
  onClose: () => void;
  serverProfiles: ServerProfile[];
  onSave: (profiles: ServerProfile[]) => void;
  wsRef: React.RefObject<WebSocket>;
  error?: string | null;
  clearError?: () => void;
}

interface ServerManagementModalWithInstanceState {
  profiles: ServerProfile[];
  editingIndex: number | null;
  editProfile: ServerProfile;
  error?: string | null;
  showInstanceInstall: boolean;
  baseInstalls: { id: string; path: string; version?: string | null; latestBuildId?: string | null; updateAvailable?: boolean }[];
  instanceInstallError?: string | null;
  instanceInstalling?: boolean;

  // Launch configuration state
  launchSettings: ParsedLaunchSettings;
  rawCommandLineText: string;
  showAdvancedCommandLine: boolean;
  selectedPresetMap: string;
  customMapName: string;

  // RCON to INI sync state
  syncRconToIni: boolean;
  initialPort: number;
  initialPassword: string;
  showSyncConfirmModal: boolean;
  syncStatusMsg: { type: 'success' | 'error'; text: string } | null;
  syncingNow: boolean;
  pendingSaveProfiles: ServerProfile[] | null;
}

export class ServerManagementModal extends React.Component<
  ServerManagementModalProps,
  ServerManagementModalWithInstanceState
> {
  constructor(props: ServerManagementModalProps) {
    super(props);
    const defaultSettings = parseCommandline([]);
    this.state = {
      profiles: props.serverProfiles,
      editingIndex: null,
      editProfile: {
        name: '',
        host: '',
        port: 27020,
        password: '',
        game: 'ark_sa',
        autoStart: false,
        features: { currentPlayers: { enabled: false, updateInterval: 10 } },
        directory: ''
      },
      error: null,
      showInstanceInstall: false,
      baseInstalls: [],
      instanceInstallError: null,
      instanceInstalling: false,
      launchSettings: defaultSettings,
      rawCommandLineText: '',
      showAdvancedCommandLine: false,
      selectedPresetMap: 'TheIsland_WP',
      customMapName: '',
      syncRconToIni: true,
      initialPort: 27020,
      initialPassword: '',
      showSyncConfirmModal: false,
      syncStatusMsg: null,
      syncingNow: false,
      pendingSaveProfiles: null
    };
  }

  wsRequest(ws: WebSocket | null, payload: any, cb: (data: any) => void, timeout = 8000) {
    if (!ws || ws.readyState !== 1) {
      cb({ error: 'WebSocket not connected' });
      return;
    }
    const requestId = 'req' + Math.random().toString(36).slice(2);
    payload.requestId = requestId;

    let timer = setTimeout(() => {
      ws.removeEventListener('message', handleMessage);
      cb({ error: 'WebSocket request timeout' });
    }, timeout);

    const handleMessage = (event: MessageEvent) => {
      try {
        clearTimeout(timer);
        const msg = JSON.parse(event.data);
        if (msg.requestId === requestId) {
          ws.removeEventListener('message', handleMessage);
          cb(msg);
        }
      } catch {}
    };
    ws.addEventListener('message', handleMessage);
    ws.send(JSON.stringify(payload));
  }

  openInstanceInstallModal = () => {
    this.wsRequest(this.props.wsRef.current, { type: 'getBaseInstalls' }, (msg) => {
      if (msg.error) {
        this.setState({ baseInstalls: [], showInstanceInstall: true, instanceInstallError: msg.error });
      } else {
        this.setState({ baseInstalls: msg.baseInstalls || [], showInstanceInstall: true, instanceInstallError: null });
      }
    });
  };

  closeInstanceInstallModal = () => {
    if (!this.state.instanceInstalling) {
      this.setState({ showInstanceInstall: false, instanceInstallError: null });
    }
  };

  handleInstanceInstall = (params: InstanceInstallParams) => {
    const ws = this.props.wsRef.current;
    if (!ws || ws.readyState !== 1) {
      this.setState({ instanceInstallError: 'WebSocket not connected' });
      return;
    }
    this.setState({ instanceInstalling: true, instanceInstallError: null });
    const requestId = 'req' + Math.random().toString(36).slice(2);
    const handleMessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'installInstance' && msg.requestId === requestId) {
          ws.removeEventListener('message', handleMessage);
          this.setState({ instanceInstalling: false });
          if (msg.error) {
            this.setState({ instanceInstallError: msg.error });
          } else {
            const fallbackProfile: ServerProfile = {
              name: params.sessionName,
              host: '127.0.0.1',
              port: params.rconPort || 27020,
              password: params.adminPassword,
              game: 'ark_sa',
              directory: params.instanceDirectory,
              queryPort: params.queryPort,
              gamePort: params.gamePort,
              mapName: params.mapName,
              autoStart: false,
              features: {
                currentPlayers: {
                  enabled: true,
                  updateInterval: 10
                }
              }
            };
            const createdProfile = msg.newProfile || fallbackProfile;
            const updatedProfiles = [...this.state.profiles, createdProfile];
            this.setState({
              profiles: updatedProfiles,
              showInstanceInstall: false,
              instanceInstallError: null
            });
            this.props.onSave(updatedProfiles);
            if (this.props.onClose) this.props.onClose();
          }
        }
      } catch {}
    };
    ws.addEventListener('message', handleMessage);
    ws.send(
      JSON.stringify({
        type: 'installInstance',
        ...params,
        rconPort: params.rconPort || 27020,
        requestId
      })
    );
  };

  componentDidMount() {
    this.loadBaseInstalls();
  }

  componentDidUpdate(prevProps: ServerManagementModalProps) {
    if (prevProps.serverProfiles !== this.props.serverProfiles) {
      this.setState({ profiles: this.props.serverProfiles });
    }
    if (!prevProps.show && this.props.show) {
      this.loadBaseInstalls();
    }
  }

  loadBaseInstalls = () => {
    if (this.props.wsRef.current && this.props.wsRef.current.readyState === 1) {
      this.wsRequest(this.props.wsRef.current, { type: 'getBaseInstalls' }, (msg) => {
        if (!msg.error && Array.isArray(msg.baseInstalls)) {
          this.setState({ baseInstalls: msg.baseInstalls });
        }
      });
    }
  };

  handleEdit = (idx: number) => {
    const profile = { ...this.state.profiles[idx] };
    const parsed = parseCommandline(profile.parsedCommandline);

    // Complement with top-level fields if explicitly defined
    if (profile.queryPort !== undefined) parsed.queryPort = profile.queryPort;
    if (profile.gamePort !== undefined) parsed.gamePort = profile.gamePort;
    if (profile.mapName !== undefined) parsed.mapName = profile.mapName;
    if (profile.serverPassword !== undefined) parsed.serverPassword = profile.serverPassword;
    if (profile.maxPlayers !== undefined) parsed.maxPlayers = profile.maxPlayers;
    if (profile.modIds !== undefined) parsed.modIds = profile.modIds;
    if (profile.clusterId !== undefined) parsed.clusterId = profile.clusterId;
    if (profile.clusterDirOverride !== undefined) parsed.clusterDirOverride = profile.clusterDirOverride;

    const matchedPreset = PRESET_MAPS.find(
      (m) => m.id.toLowerCase() === (parsed.mapName || '').toLowerCase()
    );
    const selectedPresetMap = matchedPreset ? matchedPreset.id : 'custom';
    const customMapName = matchedPreset ? '' : parsed.mapName;

    const rawCommandLineText =
      profile.parsedCommandline && profile.parsedCommandline.length > 0
        ? profile.parsedCommandline.join('\n')
        : buildOrSyncCommandline([], parsed, profile).join('\n');

    this.setState({
      editingIndex: idx,
      editProfile: {
        ...profile,
        autoStart: profile.autoStart ?? false,
        queryPort: parsed.queryPort,
        gamePort: parsed.gamePort,
        mapName: parsed.mapName,
        modIds: parsed.modIds,
        clusterId: parsed.clusterId,
        clusterDirOverride: parsed.clusterDirOverride
      },
      launchSettings: parsed,
      rawCommandLineText,
      showAdvancedCommandLine: false,
      selectedPresetMap,
      customMapName,
      initialPort: profile.port || 27020,
      initialPassword: profile.password || '',
      syncRconToIni: true,
      syncStatusMsg: null,
      syncingNow: false,
      showSyncConfirmModal: false,
      pendingSaveProfiles: null
    });
  };

  handleDelete = (idx: number) => {
    const profiles = this.state.profiles.slice();
    profiles.splice(idx, 1);
    // Deleting an instance is a configuration change, not just a UI change.
    // Persist it immediately so closing the dialog cannot restore the entry.
    this.setState({ profiles, editingIndex: null, error: null });
    if (this.props.clearError) this.props.clearError();
    this.props.onSave(profiles);
  };

  handleAdd = () => {
    const defaultSettings = parseCommandline([]);
    defaultSettings.queryPort = 27015;
    defaultSettings.gamePort = 7777;

    const newProfile: ServerProfile = {
      name: '',
      host: '127.0.0.1',
      port: 27020,
      password: '',
      game: 'ark_sa',
      autoStart: false,
      features: { currentPlayers: { enabled: true, updateInterval: 10 } },
      directory: '',
      queryPort: 27015,
      gamePort: 7777,
      mapName: 'TheIsland_WP',
      modIds: '',
      clusterId: '',
      clusterDirOverride: '',
      parsedCommandline: []
    };

    const rawCommandLineText = buildOrSyncCommandline([], defaultSettings, newProfile).join('\n');

    this.setState({
      editingIndex: -1,
      editProfile: newProfile,
      launchSettings: defaultSettings,
      rawCommandLineText,
      showAdvancedCommandLine: false,
      selectedPresetMap: 'TheIsland_WP',
      customMapName: '',
      initialPort: 27020,
      initialPassword: '',
      syncRconToIni: true,
      syncStatusMsg: null,
      syncingNow: false,
      showSyncConfirmModal: false,
      pendingSaveProfiles: null
    });
  };

  syncCommandLine = (
    profile: ServerProfile,
    settings: ParsedLaunchSettings,
    baseArgs?: string[]
  ): string => {
    const currentLines =
      baseArgs ||
      (this.state.rawCommandLineText.trim()
        ? this.state.rawCommandLineText.split('\n').map((l) => l.trim()).filter(Boolean)
        : profile.parsedCommandline);

    const updated = buildOrSyncCommandline(currentLines, settings, profile);
    return updated.join('\n');
  };

  handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    let checked = false;
    if (type === 'checkbox' && 'checked' in e.target) {
      checked = (e.target as HTMLInputElement).checked;
    }

    if (name.startsWith('features.currentPlayers.')) {
      const field = name.replace('features.currentPlayers.', '');
      this.setState((prev) => ({
        editProfile: {
          ...prev.editProfile,
          features: {
            ...prev.editProfile.features,
            currentPlayers: {
              ...((prev.editProfile.features && prev.editProfile.features.currentPlayers) || {
                enabled: false,
                updateInterval: 10
              }),
              [field]: field === 'enabled' ? checked : Number(value)
            }
          }
        }
      }));
      return;
    }

    if (name === 'autoStart') {
      this.setState((prev) => ({
        editProfile: {
          ...prev.editProfile,
          autoStart: checked
        }
      }));
      return;
    }

    this.setState((prev) => {
      const updatedProfile = {
        ...prev.editProfile,
        [name]: name === 'port' ? Number(value) : value
      };
      // If name or password changed, update raw command-line text
      const newRaw = this.syncCommandLine(updatedProfile, prev.launchSettings);
      return {
        editProfile: updatedProfile,
        rawCommandLineText: newRaw
      };
    });
  };

  handleLaunchSettingChange = (
    field: keyof ParsedLaunchSettings,
    value: any
  ) => {
    this.setState((prev) => {
      const updatedSettings = {
        ...prev.launchSettings,
        [field]: value
      };
      const updatedProfile = {
        ...prev.editProfile,
        ...(field === 'queryPort' ? { queryPort: value } : {}),
        ...(field === 'gamePort' ? { gamePort: value } : {}),
        ...(field === 'mapName' ? { mapName: value } : {}),
        ...(field === 'modIds' ? { modIds: value } : {}),
        ...(field === 'clusterId' ? { clusterId: value } : {}),
        ...(field === 'clusterDirOverride' ? { clusterDirOverride: value } : {}),
        ...(field === 'serverPassword' ? { serverPassword: value } : {}),
        ...(field === 'maxPlayers' ? { maxPlayers: value } : {})
      };
      const newRaw = this.syncCommandLine(updatedProfile, updatedSettings);
      return {
        launchSettings: updatedSettings,
        editProfile: updatedProfile,
        rawCommandLineText: newRaw
      };
    });
  };

  handlePresetMapChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    this.setState((prev) => {
      const newMap = val === 'custom' ? (prev.customMapName || 'TheIsland_WP') : val;
      const updatedSettings = { ...prev.launchSettings, mapName: newMap };
      const updatedProfile = { ...prev.editProfile, mapName: newMap };
      const newRaw = this.syncCommandLine(updatedProfile, updatedSettings);
      return {
        selectedPresetMap: val,
        launchSettings: updatedSettings,
        editProfile: updatedProfile,
        rawCommandLineText: newRaw
      };
    });
  };

  handleCustomMapChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    this.setState((prev) => {
      const updatedSettings = { ...prev.launchSettings, mapName: val };
      const updatedProfile = { ...prev.editProfile, mapName: val };
      const newRaw = this.syncCommandLine(updatedProfile, updatedSettings);
      return {
        customMapName: val,
        launchSettings: updatedSettings,
        editProfile: updatedProfile,
        rawCommandLineText: newRaw
      };
    });
  };

  handleFlagToggle = (flagId: string, checked: boolean) => {
    this.setState((prev) => {
      const updatedFlags = {
        ...prev.launchSettings.flags,
        [flagId]: checked
      };
      const updatedSettings = {
        ...prev.launchSettings,
        flags: updatedFlags
      };
      const newRaw = this.syncCommandLine(prev.editProfile, updatedSettings);
      return {
        launchSettings: updatedSettings,
        rawCommandLineText: newRaw
      };
    });
  };

  handleRawCommandLineChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const lines = val.split('\n').map((l) => l.trim()).filter(Boolean);
    const parsed = parseCommandline(lines);

    const matchedPreset = PRESET_MAPS.find(
      (m) => m.id.toLowerCase() === (parsed.mapName || '').toLowerCase()
    );
    const selectedPresetMap = matchedPreset ? matchedPreset.id : 'custom';
    const customMapName = matchedPreset ? '' : parsed.mapName;

    this.setState((prev) => ({
      rawCommandLineText: val,
      launchSettings: parsed,
      selectedPresetMap,
      customMapName,
      editProfile: {
        ...prev.editProfile,
        queryPort: parsed.queryPort,
        gamePort: parsed.gamePort,
        mapName: parsed.mapName,
        modIds: parsed.modIds,
        clusterId: parsed.clusterId,
        clusterDirOverride: parsed.clusterDirOverride,
        serverPassword: parsed.serverPassword,
        maxPlayers: parsed.maxPlayers
      }
    }));
  };

  syncRconToIniNow = () => {
    const { editingIndex, editProfile } = this.state;
    if (!editProfile.directory) return;
    this.setState({ syncingNow: true, syncStatusMsg: null });
    this.wsRequest(
      this.props.wsRef.current,
      {
        type: 'syncRconToIni',
        idx: editingIndex,
        port: editProfile.port,
        password: editProfile.password
      },
      (resp) => {
        this.setState({ syncingNow: false });
        if (resp.error || resp.ok === false) {
          this.setState({
            syncStatusMsg: { type: 'error', text: resp.error || 'Failed to sync to GameUserSettings.ini' }
          });
        } else {
          this.setState({
            syncStatusMsg: { type: 'success', text: 'Successfully synced RCON settings to GameUserSettings.ini' },
            initialPort: editProfile.port,
            initialPassword: editProfile.password || ''
          });
          setTimeout(() => {
            this.setState((prev) => (prev.syncStatusMsg?.type === 'success' ? { syncStatusMsg: null } : null));
          }, 3500);
        }
      }
    );
  };

  confirmSyncAndSave = () => {
    const { editingIndex, editProfile, pendingSaveProfiles } = this.state;
    this.setState({ showSyncConfirmModal: false });
    if (editingIndex !== null && editProfile.directory) {
      this.wsRequest(
        this.props.wsRef.current,
        {
          type: 'syncRconToIni',
          idx: editingIndex,
          port: editProfile.port,
          password: editProfile.password
        },
        () => {}
      );
    }
    if (pendingSaveProfiles) {
      if (this.props.clearError) this.props.clearError();
      this.props.onSave(pendingSaveProfiles);
    }
    this.setState({ editingIndex: null, error: null, pendingSaveProfiles: null });
  };

  skipSyncAndSave = () => {
    const { pendingSaveProfiles } = this.state;
    this.setState({ showSyncConfirmModal: false });
    if (pendingSaveProfiles) {
      if (this.props.clearError) this.props.clearError();
      this.props.onSave(pendingSaveProfiles);
    }
    this.setState({ editingIndex: null, error: null, pendingSaveProfiles: null });
  };

  handleSave = () => {
    const {
      editingIndex,
      editProfile,
      launchSettings,
      rawCommandLineText,
      profiles,
      initialPort,
      initialPassword,
      syncRconToIni
    } = this.state;
    if (!editProfile.name) {
      if (this.props.clearError) this.props.clearError();
      this.setState({ error: 'Name is required.' });
      return;
    }
    if (!editProfile.directory && (!editProfile.host || !editProfile.port)) {
      if (this.props.clearError) this.props.clearError();
      this.setState({ error: 'Either Directory or both Host and Port are required.' });
      return;
    }

    let finalCommandLine: string[];
    if (rawCommandLineText.trim()) {
      const lines = rawCommandLineText.split('\n').map((l) => l.trim()).filter(Boolean);
      finalCommandLine = buildOrSyncCommandline(lines, launchSettings, editProfile);
    } else {
      finalCommandLine = buildOrSyncCommandline(editProfile.parsedCommandline, launchSettings, editProfile);
    }

    const finalProfile: ServerProfile = {
      ...editProfile,
      autoStart: !!editProfile.autoStart,
      queryPort: launchSettings.queryPort,
      gamePort: launchSettings.gamePort,
      mapName: launchSettings.mapName,
      serverPassword: launchSettings.serverPassword || undefined,
      maxPlayers: launchSettings.maxPlayers,
      modIds: cleanModIds(launchSettings.modIds) || undefined,
      clusterId: launchSettings.clusterId?.trim() || undefined,
      clusterDirOverride: launchSettings.clusterDirOverride?.trim() || undefined,
      parsedCommandline: finalCommandLine
    };

    const newProfiles = profiles.slice();
    if (editingIndex === -1) {
      newProfiles.push(finalProfile);
    } else if (editingIndex !== null) {
      newProfiles[editingIndex] = finalProfile;
    }

    // Check if port or password changed for an existing instance with directory set
    const portOrPasswordChanged =
      editProfile.port !== initialPort || (editProfile.password || '') !== initialPassword;

    if (editProfile.directory && portOrPasswordChanged) {
      if (syncRconToIni) {
        this.wsRequest(
          this.props.wsRef.current,
          {
            type: 'syncRconToIni',
            idx: editingIndex,
            port: editProfile.port,
            password: editProfile.password
          },
          () => {}
        );
      } else {
        // Show confirmation dialog before closing
        this.setState({
          showSyncConfirmModal: true,
          pendingSaveProfiles: newProfiles
        });
        return;
      }
    }

    if (this.props.clearError) this.props.clearError();
    this.props.onSave(newProfiles);
    this.setState({ editingIndex: null, error: null });
  };

  render() {
    const { show, onClose, error: propError, clearError } = this.props;
    const {
      profiles,
      editingIndex,
      editProfile,
      error,
      launchSettings,
      rawCommandLineText,
      showAdvancedCommandLine,
      selectedPresetMap,
      customMapName
    } = this.state;

    if (!show) return null;

    const inputStyle: React.CSSProperties = {
      width: '100%',
      fontSize: '0.92em',
      padding: '7px 9px',
      borderRadius: 4,
      border: '1px solid #444',
      background: '#181a20',
      color: '#eee',
      boxSizing: 'border-box'
    };

    const sectionCardStyle: React.CSSProperties = {
      background: '#1c1f26',
      border: '1px solid #333842',
      borderRadius: 6,
      padding: 12,
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    };

    const labelStyle: React.CSSProperties = {
      display: 'block',
      marginBottom: 3,
      fontSize: '0.85em',
      color: '#bbb',
      fontWeight: 500
    };

    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.55)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <div
          style={{
            background: '#23272e',
            color: '#eee',
            padding: 20,
            borderRadius: 8,
            minWidth: 0,
            maxWidth: 780,
            width: '95vw',
            maxHeight: '92vh',
            overflowY: 'auto',
            boxShadow: '0 4px 24px rgba(0,0,0,0.7)',
            position: 'relative',
            margin: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 14
          }}
        >
          {(error || propError) && (
            <div
              style={{
                background: '#4a1515',
                color: '#ffc8c8',
                padding: '8px 16px',
                textAlign: 'center',
                fontWeight: 600,
                borderRadius: 4,
                border: '1px solid #a00',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <span>{error || propError}</span>
              <button
                onClick={clearError || (() => this.setState({ error: null }))}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#ffc8c8',
                  fontWeight: 700,
                  fontSize: '1.2em',
                  cursor: 'pointer'
                }}
              >
                ×
              </button>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: '1.35em', fontWeight: 600 }}>Manage Server Profiles</h2>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: '#aaa',
                fontSize: '1.4em',
                cursor: 'pointer'
              }}
            >
              ✕
            </button>
          </div>

          <div style={{ overflowX: 'auto', width: '100%' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.92em' }}>
              <thead>
                <tr style={{ color: '#8b949e', borderBottom: '1px solid #30363d', textAlign: 'left' }}>
                  <th style={{ padding: '8px 6px' }}>Name</th>
                  <th style={{ padding: '8px 6px' }}>Host</th>
                  <th style={{ padding: '8px 6px' }}>RCON Port</th>
                  <th style={{ padding: '8px 6px' }}>Game / Query</th>
                  <th style={{ padding: '8px 6px' }}>Auto-Start</th>
                  <th style={{ padding: '8px 6px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((profile, idx) => {
                  const pCmd = parseCommandline(profile.parsedCommandline);
                  const gameP = profile.gamePort ?? pCmd.gamePort ?? '-';
                  const queryP = profile.queryPort ?? pCmd.queryPort ?? '-';
                  return (
                    <tr
                      key={idx}
                      style={{
                        background: editingIndex === idx ? '#2d333b' : 'transparent',
                        borderBottom: '1px solid #282c34'
                      }}
                    >
                      <td style={{ padding: '8px 6px', fontWeight: 600 }}>{profile.name}</td>
                      <td style={{ padding: '8px 6px', color: '#8b949e' }}>{profile.host}</td>
                      <td style={{ padding: '8px 6px' }}>{profile.port}</td>
                      <td style={{ padding: '8px 6px', color: '#bbb' }}>
                        {gameP} / {queryP}
                      </td>
                      <td style={{ padding: '8px 6px' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 12,
                            fontSize: '0.8em',
                            fontWeight: 600,
                            background: profile.autoStart ? '#1f6feb22' : '#30363d',
                            color: profile.autoStart ? '#58a6ff' : '#8b949e',
                            border: profile.autoStart ? '1px solid #1f6feb' : '1px solid #484f58'
                          }}
                        >
                          {profile.autoStart ? 'Auto' : 'Manual'}
                        </span>
                      </td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button
                          onClick={() => this.handleEdit(idx)}
                          style={{
                            marginRight: 6,
                            padding: '4px 10px',
                            background: '#238636',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 4,
                            cursor: 'pointer'
                          }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => this.handleDelete(idx)}
                          style={{
                            padding: '4px 10px',
                            background: '#da3633',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 4,
                            cursor: 'pointer'
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {editingIndex !== null && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderBottom: '1px solid #30363d',
                  paddingBottom: 6
                }}
              >
                <h3 style={{ margin: 0, fontSize: '1.15em', color: '#58a6ff' }}>
                  {editingIndex === -1 ? 'Add Server Profile' : `Edit Server: ${editProfile.name || 'Unnamed'}`}
                </h3>
                <span style={{ fontSize: '0.82em', color: '#8b949e' }}>
                  Changes automatically sync with launch arguments
                </span>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  this.handleSave();
                }}
                style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
              >
                {/* 1. General & Identity */}
                <div style={sectionCardStyle}>
                  <div style={{ fontWeight: 600, fontSize: '0.95em', color: '#58a6ff' }}>
                    1. General & Identity
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    <div style={{ flex: '2 1 180px' }}>
                      <label style={labelStyle}>Server Name *</label>
                      <input
                        name="name"
                        placeholder="e.g. My ASA Server"
                        value={editProfile.name}
                        onChange={this.handleChange}
                        style={inputStyle}
                        required
                      />
                    </div>
                    <div style={{ flex: '1 1 130px' }}>
                      <label style={labelStyle}>Game Type</label>
                      <select
                        name="game"
                        value={editProfile.game || 'ark_sa'}
                        onChange={this.handleChange}
                        style={inputStyle}
                      >
                        <option value="ark_sa">ARK: Survival Ascended</option>
                        <option value="ark_se">ARK: Survival Evolved</option>
                      </select>
                    </div>
                    <div style={{ flex: '1 1 120px' }}>
                      <label style={labelStyle}>Host / IP</label>
                      <input
                        name="host"
                        placeholder="127.0.0.1"
                        value={editProfile.host}
                        onChange={this.handleChange}
                        style={inputStyle}
                      />
                      <ModSelector value={launchSettings.modIds} onChange={(value) => this.handleLaunchSettingChange('modIds', value)} />
                    </div>
                    <div style={{ flex: '3 1 240px' }}>
                      <label style={labelStyle}>Instance Directory Path</label>
                      <input
                        name="directory"
                        placeholder="e.g. G:\ark_server_instances\server1"
                        value={editProfile.directory || ''}
                        onChange={this.handleChange}
                        style={inputStyle}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', marginTop: 4 }}>
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: 6 }}>
                      <input
                        type="checkbox"
                        name="autoStart"
                        checked={!!editProfile.autoStart}
                        onChange={this.handleChange}
                      />
                      <span style={{ fontSize: '0.9em', fontWeight: 600, color: '#e6edf3' }}>
                        Auto-Start Server on Boot / Launch
                      </span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: 6 }}>
                      <input
                        type="checkbox"
                        name="features.currentPlayers.enabled"
                        checked={
                          !!(
                            editProfile.features &&
                            editProfile.features.currentPlayers &&
                            editProfile.features.currentPlayers.enabled
                          )
                        }
                        onChange={this.handleChange}
                      />
                      <span style={{ fontSize: '0.9em', color: '#bbb' }}>Track Active Players</span>
                    </label>

                    {editProfile.features?.currentPlayers?.enabled && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: '0.85em', color: '#8b949e' }}>Interval (s):</span>
                        <input
                          type="number"
                          name="features.currentPlayers.updateInterval"
                          value={editProfile.features.currentPlayers.updateInterval}
                          min={1}
                          onChange={this.handleChange}
                          style={{ ...inputStyle, width: 70, padding: '4px 6px' }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Base Install Association & Update Information */}
                  <div style={{ marginTop: 12, padding: '10px 12px', background: '#21262d', borderRadius: 6, border: '1px solid #30363d' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
                      <div style={{ flex: '2 1 250px' }}>
                        <label style={labelStyle}>Linked Base Install</label>
                        <select
                          name="baseInstallId"
                          value={editProfile.baseInstallId || ''}
                          onChange={this.handleChange}
                          style={inputStyle}
                        >
                          <option value="">-- Automatic / Inherit from Junction --</option>
                          {this.state.baseInstalls.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.id} ({b.path})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div style={{ flex: '1 1 180px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={labelStyle}>Update Status</label>
                        {(() => {
                          const linked = this.state.baseInstalls.find(
                            (b) => b.id === editProfile.baseInstallId || b.path === editProfile.baseInstallPath
                          );
                          const isOutdated = linked?.updateAvailable || editProfile.updateAvailable;
                          if (isOutdated) {
                            return (
                              <span style={{ color: '#fa0', fontWeight: 600, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                ⚠️ Update Available
                                {linked?.latestBuildId ? ` (Build: ${linked.latestBuildId})` : ''}
                              </span>
                            );
                          }
                          if (linked) {
                            return (
                              <span style={{ color: '#4ade80', fontSize: 13 }}>
                                ✓ Up to Date {linked.version ? `(Build ${linked.version})` : ''}
                              </span>
                            );
                          }
                          return <span style={{ color: '#8b949e', fontSize: 13 }}>Auto-detected on boot</span>;
                        })()}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Ports & Passwords */}
                <div style={sectionCardStyle}>
                  <div style={{ fontWeight: 600, fontSize: '0.95em', color: '#58a6ff' }}>
                    2. Ports & Passwords
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    <div style={{ flex: '1 1 110px' }}>
                      <label style={labelStyle}>RCON Port *</label>
                      <input
                        name="port"
                        type="number"
                        placeholder="27020"
                        value={editProfile.port || ''}
                        onChange={this.handleChange}
                        style={inputStyle}
                        required
                      />
                    </div>
                    <div style={{ flex: '1 1 110px' }}>
                      <label style={labelStyle}>Game Port (Port=...)</label>
                      <input
                        type="number"
                        placeholder="7777"
                        value={launchSettings.gamePort ?? ''}
                        onChange={(e) =>
                          this.handleLaunchSettingChange(
                            'gamePort',
                            e.target.value ? parseInt(e.target.value, 10) : undefined
                          )
                        }
                        style={inputStyle}
                      />
                    </div>
                    <div style={{ flex: '1 1 110px' }}>
                      <label style={labelStyle}>Query Port (?QueryPort=...)</label>
                      <input
                        type="number"
                        placeholder="27015"
                        value={launchSettings.queryPort ?? ''}
                        onChange={(e) =>
                          this.handleLaunchSettingChange(
                            'queryPort',
                            e.target.value ? parseInt(e.target.value, 10) : undefined
                          )
                        }
                        style={inputStyle}
                      />
                    </div>
                    <div style={{ flex: '2 1 160px' }}>
                      <label style={labelStyle}>RCON / Admin Password *</label>
                      <input
                        name="password"
                        placeholder="Admin password"
                        value={editProfile.password}
                        onChange={this.handleChange}
                        style={inputStyle}
                      />
                    </div>
                    <div style={{ flex: '2 1 160px' }}>
                      <label style={labelStyle}>Player Join Password (Optional)</label>
                      <input
                        placeholder="Leave blank for public"
                        value={launchSettings.serverPassword || ''}
                        onChange={(e) => this.handleLaunchSettingChange('serverPassword', e.target.value)}
                        style={inputStyle}
                      />
                    </div>
                  </div>

                  {/* Auto-Sync RCON to INI Settings */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6, borderTop: '1px solid #282c34', paddingTop: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                      <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: 8 }}>
                        <input
                          type="checkbox"
                          checked={this.state.syncRconToIni}
                          onChange={(e) => this.setState({ syncRconToIni: e.target.checked })}
                        />
                        <span style={{ fontSize: '0.88em', color: '#e6edf3', fontWeight: 500 }}>
                          Auto-sync RCON settings to GameUserSettings.ini (RCONPort, RCONEnabled=True, ServerAdminPassword)
                        </span>
                      </label>

                      {editProfile.directory && (
                        <button
                          type="button"
                          onClick={this.syncRconToIniNow}
                          disabled={this.state.syncingNow}
                          style={{
                            padding: '4px 12px',
                            fontSize: '0.82em',
                            fontWeight: 600,
                            background: this.state.syncingNow ? '#444' : '#1f6feb',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 4,
                            cursor: this.state.syncingNow ? 'not-allowed' : 'pointer'
                          }}
                        >
                          {this.state.syncingNow ? 'Syncing...' : 'Sync to INI Now'}
                        </button>
                      )}
                    </div>

                    {this.state.syncStatusMsg && (
                      <div
                        style={{
                          fontSize: '0.84em',
                          padding: '6px 10px',
                          borderRadius: 4,
                          background: this.state.syncStatusMsg.type === 'success' ? '#1f6feb22' : '#da363322',
                          color: this.state.syncStatusMsg.type === 'success' ? '#58a6ff' : '#f85149',
                          border: this.state.syncStatusMsg.type === 'success' ? '1px solid #1f6feb55' : '1px solid #da363355'
                        }}
                      >
                        {this.state.syncStatusMsg.text}
                      </div>
                    )}
                  </div>
                </div>

                {/* 3. Map & Server Settings */}
                <div style={sectionCardStyle}>
                  <div style={{ fontWeight: 600, fontSize: '0.95em', color: '#58a6ff' }}>
                    3. Map & Server Settings
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    <div style={{ flex: '2 1 180px' }}>
                      <label style={labelStyle}>Map Selection</label>
                      <select
                        value={selectedPresetMap}
                        onChange={this.handlePresetMapChange}
                        style={inputStyle}
                      >
                        {PRESET_MAPS.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name} ({m.id})
                          </option>
                        ))}
                        <option value="custom">Custom / Other Map...</option>
                      </select>
                    </div>

                    {selectedPresetMap === 'custom' && (
                      <div style={{ flex: '2 1 180px' }}>
                        <label style={labelStyle}>Custom Map Name / WP</label>
                        <input
                          placeholder="e.g. Svartalfheim_WP"
                          value={customMapName}
                          onChange={this.handleCustomMapChange}
                          style={inputStyle}
                        />
                      </div>
                    )}

                    <div style={{ flex: '1 1 100px' }}>
                      <label style={labelStyle}>Max Players</label>
                      <input
                        type="number"
                        placeholder="100"
                        value={launchSettings.maxPlayers ?? 100}
                        onChange={(e) =>
                          this.handleLaunchSettingChange(
                            'maxPlayers',
                            e.target.value ? parseInt(e.target.value, 10) : 100
                          )
                        }
                        style={inputStyle}
                      />
                    </div>
                  </div>
                </div>

                {/* 4. Mods & Clustering */}
                <div style={sectionCardStyle}>
                  <div style={{ fontWeight: 600, fontSize: '0.95em', color: '#58a6ff' }}>
                    4. Mods & Clustering
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div>
                      <label style={labelStyle}>
                        Mod IDs (-mods=...)
                        <span style={{ marginLeft: 8, fontSize: '0.85em', color: '#8b949e', fontWeight: 400 }}>
                          Comma-separated CurseForge mod project IDs
                        </span>
                      </label>
                      <input
                        placeholder="e.g. 928708, 930389, 934401"
                        value={launchSettings.modIds}
                        onChange={(e) => this.handleLaunchSettingChange('modIds', e.target.value)}
                        style={inputStyle}
                      />
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                      <div style={{ flex: '1 1 200px' }}>
                        <label style={labelStyle}>Cluster ID (-clusterID=...)</label>
                        <input
                          placeholder="e.g. mycluster"
                          value={launchSettings.clusterId}
                          onChange={(e) => this.handleLaunchSettingChange('clusterId', e.target.value)}
                          style={inputStyle}
                        />
                      </div>
                      <div style={{ flex: '2 1 260px' }}>
                        <label style={labelStyle}>Cluster Directory Override (-ClusterDirOverride=...)</label>
                        <input
                          placeholder="e.g. G:\ark_server_instances\clusters"
                          value={launchSettings.clusterDirOverride}
                          onChange={(e) =>
                            this.handleLaunchSettingChange('clusterDirOverride', e.target.value)
                          }
                          style={inputStyle}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* 5. Server Launch Flags */}
                <div style={sectionCardStyle}>
                  <div style={{ fontWeight: 600, fontSize: '0.95em', color: '#58a6ff' }}>
                    5. Server Launch Flags
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                      gap: 8
                    }}
                  >
                    {STANDARD_FLAGS.map((flag) => {
                      const isChecked = !!launchSettings.flags[flag.id];
                      return (
                        <label
                          key={flag.id}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 8,
                            padding: '6px 8px',
                            borderRadius: 4,
                            background: isChecked ? '#21262d' : '#16191f',
                            border: isChecked ? '1px solid #388bfd44' : '1px solid #282c34',
                            cursor: 'pointer'
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => this.handleFlagToggle(flag.id, e.target.checked)}
                            style={{ marginTop: 3 }}
                          />
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '0.85em', fontWeight: 600, color: '#e6edf3' }}>
                              {flag.label}
                            </span>
                            <span style={{ fontSize: '0.75em', color: '#8b949e', fontFamily: 'monospace' }}>
                              {flag.id}
                            </span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* 6. Advanced Command-Line Arguments */}
                <div style={sectionCardStyle}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: 'pointer'
                    }}
                    onClick={() =>
                      this.setState((prev) => ({
                        showAdvancedCommandLine: !prev.showAdvancedCommandLine
                      }))
                    }
                  >
                    <div style={{ fontWeight: 600, fontSize: '0.95em', color: '#58a6ff' }}>
                      6. Advanced Command-Line Arguments (parsedCommandline)
                    </div>
                    <button
                      type="button"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#58a6ff',
                        cursor: 'pointer',
                        fontSize: '0.9em'
                      }}
                    >
                      {showAdvancedCommandLine ? '▲ Hide Raw Arguments' : '▼ View & Edit Raw Arguments'}
                    </button>
                  </div>

                  {showAdvancedCommandLine && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <span style={{ fontSize: '0.82em', color: '#8b949e' }}>
                        Each line represents a distinct CLI argument passed to <code>ArkAscendedServer.exe</code>.
                        Edits here will sync with form fields above.
                      </span>
                      <textarea
                        rows={9}
                        value={rawCommandLineText}
                        onChange={this.handleRawCommandLineChange}
                        style={{
                          ...inputStyle,
                          fontFamily: 'monospace',
                          fontSize: '0.82em',
                          lineHeight: 1.4,
                          whiteSpace: 'pre',
                          overflowX: 'auto',
                          resize: 'vertical'
                        }}
                      />
                    </div>
                  )}
                </div>

                {/* Buttons */}
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                  <button
                    type="button"
                    onClick={() => this.setState({ editingIndex: null })}
                    style={{
                      padding: '8px 18px',
                      background: '#30363d',
                      color: '#c9d1d9',
                      border: '1px solid #484f58',
                      borderRadius: 6,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    style={{
                      padding: '8px 24px',
                      background: '#238636',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 6,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Save Profile & Launch Settings
                  </button>
                </div>
              </form>
            </div>
          )}

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
              borderTop: '1px solid #30363d',
              paddingTop: 12
            }}
          >
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={this.handleAdd}
                style={{
                  padding: '8px 16px',
                  background: '#238636',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                + Add Server
              </button>
              <button
                onClick={this.openInstanceInstallModal}
                style={{
                  padding: '8px 16px',
                  background: '#1f6feb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Install New Instance
              </button>
            </div>
            <button
              onClick={onClose}
              style={{
                padding: '8px 20px',
                background: '#30363d',
                color: '#c9d1d9',
                border: '1px solid #484f58',
                borderRadius: 6,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Close
            </button>
          </div>

          <InstanceInstallModal
            show={this.state.showInstanceInstall}
            onClose={this.closeInstanceInstallModal}
            baseInstalls={this.state.baseInstalls}
            onInstall={this.handleInstanceInstall}
            error={this.state.instanceInstallError}
            clearError={() => this.setState({ instanceInstallError: null })}
            installing={this.state.instanceInstalling}
          />

          {/* Sync RCON confirmation dialog */}
          {this.state.showSyncConfirmModal && (
            <div
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0,0,0,0.65)',
                zIndex: 1100,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <div
                style={{
                  background: '#21262d',
                  border: '1px solid #388bfd',
                  borderRadius: 8,
                  padding: 20,
                  maxWidth: 480,
                  width: '90%',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14,
                  boxShadow: '0 8px 32px rgba(0,0,0,0.8)'
                }}
              >
                <div style={{ fontSize: '1.1em', fontWeight: 600, color: '#58a6ff' }}>
                  Sync Settings to INI?
                </div>
                <div style={{ fontSize: '0.9em', color: '#c9d1d9', lineHeight: 1.5 }}>
                  RCON Port or Password was changed. Would you like to sync these changes to <code>GameUserSettings.ini</code>?
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
                  <button
                    type="button"
                    onClick={this.skipSyncAndSave}
                    style={{
                      padding: '7px 16px',
                      background: '#30363d',
                      color: '#c9d1d9',
                      border: '1px solid #484f58',
                      borderRadius: 6,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    No, Skip
                  </button>
                  <button
                    type="button"
                    onClick={this.confirmSyncAndSave}
                    style={{
                      padding: '7px 18px',
                      background: '#238636',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 6,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Yes, Sync
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
}
