// Utility to fetch process status from backend
// Deprecated: Use process status from ServerManagerPage via WebSocket instead of fetch.
// See ServerManagerPage.tsx for status handling.
export async function fetchProcessStatusWS(ws: WebSocket | null): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!ws || ws.readyState !== 1) return reject(new Error('WebSocket not connected'));
    wsRequest(ws, { type: 'getProcessStatus' }, (msg) => {
      if (msg.error) return reject(new Error(msg.error));
      resolve(msg);
    });
  });
}

// --- WebSocket request/response utility (copy from ServerManagerPage) ---
function wsRequest(ws: WebSocket | null, payload: any, cb: (data: any) => void, timeout = 8000) {
  if (!ws || ws.readyState !== 1) {
    cb({ error: 'WebSocket not connected' });
    return;
  }
  const requestId = 'req' + Math.random().toString(36).slice(2);
  payload.requestId = requestId;
  const handleMessage = (event: MessageEvent) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.requestId === requestId) {
        ws.removeEventListener('message', handleMessage);
        cb(msg);
      }
    } catch {}
  };
  ws.addEventListener('message', handleMessage);
  ws.send(JSON.stringify(payload));
  setTimeout(() => {
    ws.removeEventListener('message', handleMessage);
    cb({ error: 'WebSocket request timeout' });
  }, timeout);
}
