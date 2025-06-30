// Utility to fetch process status from backend
export async function fetchProcessStatus() {
  const res = await fetch('/api/process-status');
  if (!res.ok) throw new Error('Failed to fetch process status');
  return res.json();
}
