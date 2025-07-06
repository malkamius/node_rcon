import React from 'react';

interface ServerProfile {
  name: string;
  host: string;
  port: number;
  password: string;
  game?: string;
  features?: {
    currentPlayers?: {
      enabled: boolean;
      updateInterval: number;
    }
  };
  directory?: string;
}

interface ServerManagementModalProps {
  show: boolean;
  onClose: () => void;
  serverProfiles: ServerProfile[];
  onSave: (profiles: ServerProfile[]) => void;
  error?: string | null;
  clearError?: () => void;
}

interface ServerManagementModalState {
  profiles: ServerProfile[];
  editingIndex: number | null;
  editProfile: ServerProfile;
  error?: string | null;
}

export class ServerManagementModal extends React.Component<ServerManagementModalProps, ServerManagementModalState> {
  constructor(props: ServerManagementModalProps) {
    super(props);
    this.state = {
      profiles: props.serverProfiles,
      editingIndex: null,
      editProfile: { name: '', host: '', port: 25575, password: '', game: '', features: { currentPlayers: { enabled: false, updateInterval: 10 } }, directory: '' },
      error: null,
    };
  }

  componentDidUpdate(prevProps: ServerManagementModalProps) {
    if (prevProps.serverProfiles !== this.props.serverProfiles) {
      this.setState({ profiles: this.props.serverProfiles });
    }
  }

  handleEdit = (idx: number) => {
    this.setState({ editingIndex: idx, editProfile: { ...this.state.profiles[idx] } });
  };

  handleDelete = (idx: number) => {
    const profiles = this.state.profiles.slice();
    profiles.splice(idx, 1);
    this.setState({ profiles });
  };

  handleAdd = () => {
    this.setState({
      editingIndex: -1,
      editProfile: { name: '', host: '', port: 25575, password: '', game: '', features: { currentPlayers: { enabled: false, updateInterval: 10 } }, directory: '' },
    });
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
              ...((prev.editProfile.features && prev.editProfile.features.currentPlayers) || { enabled: false, updateInterval: 10 }),
              [field]: field === 'enabled' ? checked : Number(value)
            }
          }
        }
      }));
    } else {
      this.setState((prev) => ({
        editProfile: {
          ...prev.editProfile,
          [name]: name === 'port' ? Number(value) : value,
        },
      }));
    }
  };

  handleSave = () => {
    const { editingIndex, editProfile, profiles } = this.state;
    // Validation: require name, and either directory OR (host and port)
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
    let newProfiles = profiles.slice();
    if (editingIndex === -1) {
      newProfiles.push(editProfile);
    } else if (editingIndex !== null) {
      newProfiles[editingIndex] = editProfile;
    }
    // Save using parent-provided onSave (which uses WebSocket)
    if (this.props.clearError) this.props.clearError();
    this.props.onSave(newProfiles);
    this.setState({ editingIndex: null, error: null });
  };

  render() {
    const { show, onClose, error: propError, clearError } = this.props;
    const { profiles, editingIndex, editProfile, error } = this.state;
    if (!show) return null;
    return (
      <div style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
        <div
          style={{
            background: '#23272e',
            color: '#eee',
            padding: 16,
            borderRadius: 8,
            minWidth: 0,
            maxWidth: 500,
            width: '95vw',
            boxShadow: '0 2px 16px #0008',
            position: 'relative',
            margin: 8,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {(error || propError) && (
            <div style={{ background: '#ffdddd', color: '#a00', padding: '8px 16px', textAlign: 'center', fontWeight: 600, borderRadius: 4, marginBottom: 12, border: '1px solid #a00', position: 'absolute', left: 0, right: 0, top: -40 }}>
              {error || propError}
              {(error || (() => this.setState({ error: null })) ) && (
                <button onClick={clearError || (() => this.setState({ error: null }))} style={{ marginLeft: 16, background: 'none', border: 'none', color: '#a00', fontWeight: 700, cursor: 'pointer' }}>×</button>
              )}
            </div>
          )}
          <h2 style={{marginTop: 0, fontSize: '1.3em'}}>Manage Servers</h2>
          <div style={{overflowX: 'auto', width: '100%'}}>
            <table style={{width: '100%', marginBottom: 16, fontSize: '0.98em'}}>
              <thead>
                <tr style={{color: '#aaa'}}>
                  <th>Name</th><th>Host</th><th>Port</th><th>Password</th><th></th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((profile, idx) => (
                  <tr key={idx} style={{background: editingIndex === idx ? '#2a2e36' : undefined}}>
                    <td style={{wordBreak: 'break-all'}}>{profile.name}</td>
                    <td style={{wordBreak: 'break-all'}}>{profile.host}</td>
                    <td>{profile.port}</td>
                    <td>{profile.password ? '••••••' : ''}</td>
                    <td>
                      <button onClick={() => this.handleEdit(idx)} style={{marginRight: 4}}>Edit</button>
                      <button onClick={() => this.handleDelete(idx)} style={{marginLeft: 0}}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {editingIndex !== null && (
            <div style={{marginBottom: 16}}>
              <h4 style={{marginTop: 0, fontSize: '1.1em'}}>{editingIndex === -1 ? 'Add Server' : 'Edit Server'}</h4>
              <form
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  width: '100%',
                }}
                onSubmit={e => { e.preventDefault(); this.handleSave(); }}
              >
                <div style={{display: 'flex', flexWrap: 'wrap', gap: 8}}>
                  <div style={{ flex: '1 1 120px', minWidth: 120 }}>
                    <label style={{ display: 'block', marginBottom: 2 }}>Name</label>
                    <input name="name" placeholder="Name" value={editProfile.name} onChange={this.handleChange} style={{ width: '100%', fontSize: '1em', padding: 6, borderRadius: 4, border: '1px solid #444', background: '#181a20', color: '#eee' }} />
                  </div>
                  <div style={{ flex: '1 1 120px', minWidth: 120 }}>
                    <label style={{ display: 'block', marginBottom: 2 }}>Host/IP</label>
                    <input name="host" placeholder="Host/IP" value={editProfile.host} onChange={this.handleChange} style={{ width: '100%', fontSize: '1em', padding: 6, borderRadius: 4, border: '1px solid #444', background: '#181a20', color: '#eee' }} />
                  </div>
                  <div style={{ flex: '1 1 80px', minWidth: 80 }}>
                    <label style={{ display: 'block', marginBottom: 2 }}>Port</label>
                    <input name="port" type="number" placeholder="Port" value={editProfile.port} onChange={this.handleChange} style={{ width: '100%', fontSize: '1em', padding: 6, borderRadius: 4, border: '1px solid #444', background: '#181a20', color: '#eee' }} />
                  </div>
                  <div style={{ flex: '1 1 120px', minWidth: 120 }}>
                    <label style={{ display: 'block', marginBottom: 2 }}>Password</label>
                    <input name="password" placeholder="Password" value={editProfile.password} onChange={this.handleChange} style={{ width: '100%', fontSize: '1em', padding: 6, borderRadius: 4, border: '1px solid #444', background: '#181a20', color: '#eee' }} />
                  </div>
                  <div style={{ flex: '1 1 140px', minWidth: 120 }}>
                    <label style={{ display: 'block', marginBottom: 2 }}>Directory</label>
                    <input name="directory" placeholder="Directory (optional)" value={editProfile.directory || ''} onChange={this.handleChange} style={{ width: '100%', fontSize: '1em', padding: 6, borderRadius: 4, border: '1px solid #444', background: '#181a20', color: '#eee' }} />
                  </div>
                  <div style={{ flex: '1 1 120px', minWidth: 100 }}>
                    <label style={{ display: 'block', marginBottom: 2 }}>Game</label>
                    <select name="game" value={editProfile.game || ''} onChange={this.handleChange} style={{ width: '100%', fontSize: '1em', padding: 6, borderRadius: 4, border: '1px solid #444', background: '#181a20', color: '#eee' }}>
                      <option value="">Select Game</option>
                      <option value="ark_se">ARK: Survival Evolved</option>
                      <option value="ark_sa">ARK: Survival Ascended</option>
                      {/* Add more games as needed */}
                    </select>
                  </div>
                  <div style={{ flex: '1 1 120px', minWidth: 100, display: 'flex', alignItems: 'center', marginTop: 22 }}>
                    <input
                      type="checkbox"
                      name="features.currentPlayers.enabled"
                      checked={!!(editProfile.features && editProfile.features.currentPlayers && editProfile.features.currentPlayers.enabled)}
                      onChange={this.handleChange}
                      style={{ marginRight: 4 }}
                    />
                    <span>Current Players</span>
                  </div>
                  {editProfile.features && editProfile.features.currentPlayers && editProfile.features.currentPlayers.enabled && (
                    <div style={{ flex: '1 1 100px', minWidth: 80 }}>
                      <label style={{ display: 'block', marginBottom: 2 }}>Update Interval (s)</label>
                      <input
                        type="number"
                        name="features.currentPlayers.updateInterval"
                        value={editProfile.features.currentPlayers.updateInterval}
                        min={1}
                        onChange={this.handleChange}
                        style={{ width: '100%', fontSize: '1em', padding: 6, borderRadius: 4, border: '1px solid #444', background: '#181a20', color: '#eee' }}
                        placeholder="Update Interval (s)"
                      />
                    </div>
                  )}
                </div>
                <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="submit" style={{flex: '1 1 100px', minWidth: 100}}>Save</button>
                  <button type="button" onClick={() => this.setState({ editingIndex: null })} style={{flex: '1 1 100px', minWidth: 100}}>Cancel</button>
                </div>
              </form>
            </div>
          )}
          <div style={{display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginTop: 8}}>
            <button onClick={this.handleAdd} style={{flex: '1 1 120px', minWidth: 100}}>Add Server</button>
            <button onClick={onClose} style={{flex: '1 1 120px', minWidth: 100}}>Close</button>
          </div>
        </div>
      </div>
    );
  }
}
