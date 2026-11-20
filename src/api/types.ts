// API DTOs — adapted from platform-brainbuilder/src/renderer/types/

export interface AuthResponseDto {
  state: AuthState | number;  // Backend may return C# enum int (e.g. 3 = Active)
  accessToken?: string;
  refreshToken?: string;
  user?: UserDto;
  tenant?: TenantDto;
  message?: string;
}

export type AuthState =
  | 'Active'
  | 'SignUpRequired'
  | 'PendingApproval'
  | 'Disabled';

export interface UserDto {
  id: string;
  givenName: string;
  familyName: string;
  email: string;
  tenantId: string;
  organisationId: string;
  enableMCP: boolean;
  permissions: string[];
  hasCompletedOnboarding: boolean;
}

export interface TenantDto {
  id: string;
  name: string;
  plan: string;
}

export interface BrainWithAccessDto {
  id: string;
  name: string;
  description?: string;
  isPersonal: boolean;
  allowMCPEditing: boolean;
  accessLevel: BrainAccessLevel;
  canWrite: boolean;
  canManageAccess: boolean;
}

export enum BrainAccessLevel {
  Read = 0,
  ReadWrite = 1,
  Owner = 2,
}

export interface BrainCreateDto {
  name: string;
  description?: string;
  brainTemplateId?: string;
  isPersonal?: boolean;
  allowMCPEditing?: boolean;
}

export interface BrainDto {
  id: string;
  name: string;
  description?: string;
  isPersonal: boolean;
  isDefault: boolean;
  allowMCPEditing: boolean;
  createdDate?: string;
  modifiedDate?: string;
}

export interface BrainTemplateDto {
  id: string;
  tenantId?: string;
  name: string;
  description?: string;
  isStandard: boolean;
  isDefault: boolean;
}

export interface PaginatedResponse<T> {
  records: T[];
  totalRecords: number;
  page: number;
  totalPages: number;
}

export interface BrainCounts {
  neurons: number;
  neuronTypes: number;
  synapses: number;
}

export interface EmailSignInDto {
  email: string;
  password: string;
}

// Graph data types
export interface NeuronDto {
  id: string;
  name: string;
  content?: string;
  brainId: string;
  neuronTypeId: string;
  neuronTypeName?: string;
  createdDate?: string;
  modifiedDate?: string;
}

export interface NeuronTypeDto {
  id: string;
  name: string;
  description?: string;
  brainId: string;
  isFileType: boolean;
}

export interface SynapseDto {
  id: string;
  sourceNeuronId: string;
  targetNeuronId: string;
  linkDescription?: string;
  brainId: string;
}

export interface BrainGraphData {
  brainId: string;
  brainName: string;
  neurons: NeuronDto[];
  neuronTypes: NeuronTypeDto[];
  synapses: SynapseDto[];
  counts: BrainCounts;
}

// Message types for webview ↔ extension host communication.
// Every message that touches a server carries its serverId.

export type ServerStatusView =
  | 'signedOut' | 'signingIn' | 'connected' | 'authExpired' | 'offline' | 'unsupportedAuth' | 'error';

/** What the Account view needs to show one server. */
export interface ServerViewModel {
  id: string;
  kind: 'cloud' | 'hive';
  label: string;
  baseUrl: string;
  status: ServerStatusView;
  statusMessage?: string;
  /** A sign-in is stored for this server (it may still be offline). */
  signedIn: boolean;
  user?: Pick<UserDto, 'givenName' | 'familyName' | 'email'>;
  authProviders: string[];
  /** A user-added Hive Server (removable from the UI). */
  removable: boolean;
  /** Managed by the aiqbee.servers setting. */
  managed: boolean;
  /** Sign-up page, cloud only. */
  signUpUrl?: string;
}

export type SignInProviderId = 'entra' | 'google';

export type WebviewMessage =
  | { command: 'ready' }
  | { command: 'signIn'; payload: { serverId: string; provider: SignInProviderId } }
  | { command: 'signInEmail'; payload: { serverId: string } & EmailSignInDto }
  | { command: 'cancelSignIn'; payload: { serverId: string } }
  | { command: 'signOut'; payload: { serverId: string } }
  | { command: 'addServer'; payload: { url: string } }
  | { command: 'removeServer'; payload: { serverId: string } }
  | { command: 'openExternal'; payload: { url: string } };

export type ExtensionMessage =
  | { command: 'serversChanged'; payload: { servers: ServerViewModel[]; environment: string } }
  | { command: 'showEmailSignIn'; payload: { serverId: string } }
  | { command: 'authActionRequired'; payload: { serverId: string; state: string; message: string; signUpUrl?: string } }
  | { command: 'error'; payload: { message: string; serverId?: string } };
