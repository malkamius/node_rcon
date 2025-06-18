// Wrapper for rcon-client to simplify connection and command usage
import { Rcon } from 'rcon-client';

export interface RconConnection {
  key: string;
  rcon: Rcon;
  connected: boolean;
}


export async function createRconConnection(host: string, port: number, password: string): Promise<Rcon> {
  const rcon = new Rcon({ host, port, password });
  try {
    await rcon.connect();
    return rcon;
  } catch (e) {
    try { rcon.end(); } catch {}
    throw e;
  }
}

export function disconnectRcon(rcon: Rcon) {
  try { rcon.end(); } catch {}
}
