// Utility to load the ARK settings template JSON
export async function loadArkSettingsTemplate(): Promise<any> {
  const res = await fetch('/ark-settings-template.json');
  if (!res.ok) throw new Error('Failed to load ARK settings template');
  return await res.json();
}
