declare module '@kbs-cloud/shared/auth' {
  export function getAuthServerUrl(): string;
  export function getBackendPort(clientId: string): number;
  export function redirectToSSO(clientId: string, state?: string): void;
}
