import net from 'net';
import path from 'path';
import { spawn } from 'child_process';

const SOCKET_PORT = 12345;
const SOCKET_HOST = '127.0.0.1';

const REGISTER_SCRIPT = path.join(__dirname, 'Register-ArkAdminSocketServerTask.ps1');

function tryConnectSocket(timeoutMs = 1000): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const client = net.createConnection({ port: SOCKET_PORT, host: SOCKET_HOST }, () => resolve(client));
    client.on('error', reject);
    setTimeout(() => {
      client.destroy();
      reject(new Error('Socket connect timeout'));
    }, timeoutMs);
  });
}

export async function ensureSocketServer(): Promise<boolean> {
  try {
    const client = await tryConnectSocket(500);
    client.destroy();
    return true;
  } catch (err) {
    // Try to launch the registration script (auto-elevates)
    await new Promise<void>((resolve) => {
      spawn('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', REGISTER_SCRIPT
      ], { detached: false, stdio: 'ignore' }).on('close', resolve);
    });
    // Wait and retry
    for (let i = 0; i < 10; ++i) {
      try {
        const client = await tryConnectSocket(1000);
        client.destroy();
        return true;
      } catch (inner_er) {}
      await new Promise(r => setTimeout(r, 500));
    }
    throw new Error('Could not start ArkAdminSocketServer');
  }
}

export async function sendAdminSocketCommand(scriptName: string, args?: string[]): Promise<string> {
  await ensureSocketServer();
  return new Promise((resolve, reject) => {
    const client = net.createConnection({ port: SOCKET_PORT, host: SOCKET_HOST }, () => {
      // Send a JSON string with script and args
      const payload = JSON.stringify({ script: scriptName, args: args || [] });
      client.write(payload + '\n');
    });
    let result = '';
    client.on('data', (data) => {
      result += data.toString();
    });
    client.on('end', () => resolve(result));
    client.on('error', reject);
  });
}