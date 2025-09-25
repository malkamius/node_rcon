
import fetch from 'node-fetch';

import http from 'http';


/**
 * Sends a command to the elevated service via HTTP POST.
 * @param command The command name (e.g., 'InstallInstance')
 * @param params The parameters for the command
 * @returns The result string or throws on error
 */
export async function sendElevatedCommand(command: string, params: any): Promise<string> {
  const url = 'http://127.0.0.1:12345/api/task';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command, params })
  });
  if (!res.ok) {
    let errMsg = `Elevated service error: ${res.status}`;
    try {
      const errJson = await res.json();
      errMsg += ` - ${errJson.error || JSON.stringify(errJson)}`;
    } catch {}
    throw new Error(errMsg);
  }
  const data = await res.json();
  if (!data.ok) {
    throw new Error(data.error || 'Unknown error from elevated service');
  }
  return data.result;
}

/**
 * Ensures the elevated service is running and listening on port 12345.
 * Resolves if the service is available, otherwise rejects.
 */
export async function ensureSocketServer(timeoutMs = 1000): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port: 12345,
      path: '/api/task',
      method: 'OPTIONS',
      timeout: timeoutMs
    }, res => {
      // Accept any response as a sign the server is up
      res.resume();
      resolve();
    });
    req.on('error', err => {
      reject(new Error('Elevated service is not running or not listening on port 12345'));
    });
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout while checking elevated service on port 12345'));
    });
    req.end();
  });
}