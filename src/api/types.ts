// API DTOs — adapted from platform-brainbuilder/src/renderer/types/

export interface AuthResponseDto {
  state: AuthState;
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

// Message types for webview ↔ extension host communication
export type WebviewMessage =
  | { command: 'signInMicrosoft' }
  | { command: 'signInGoogle' }
  | { command: 'signInEmail'; payload: EmailSignInDto }
  | { command: 'signOut' }
  | { command: 'getAuthState' }
  | { command: 'listBrains' }
  | { command: 'createBrain'; payload: BrainCreateDto }
  | { command: 'getBrainCounts'; payload: { brainId: string } }
  | { command: 'getBrainTemplates' }
  | { command: 'addMcpConnection'; payload: { brainId: string; brainName: string } }
  | { command: 'openBrainGraph'; payload: { brainId: string; brainName: string; canWrite: boolean } }
  | { command: 'openExternal'; payload: { url: string } }
  | { command: 'connectToHive'; payload: { url: string } }
  | { command: 'disconnectHive' }
  | { command: 'cancelSignIn' }
  | { command: 'ready' };

export type ExtensionMessage =
  | { command: 'authStateChanged'; payload: { authenticated: boolean; user?: UserDto } }
  | { command: 'brainsLoaded'; payload: BrainWithAccessDto[] }
  | { command: 'brainCreated'; payload: BrainDto }
  | { command: 'brainCounts'; payload: { brainId: string; counts: BrainCounts } }
  | { command: 'brainTemplatesLoaded'; payload: BrainTemplateDto[] }
  | { command: 'error'; payload: { message: string; command?: string } }
  | { command: 'loading'; payload: { loading: boolean; command?: string } }
  | { command: 'connectionChanged'; payload: { backendType: 'cloud' | 'hive'; label: string; authProviders: string[]; webAppUrl?: string } }
  | { command: 'authActionRequired'; payload: { state: string; message: string; webAppUrl: string } }
  | { command: 'subscriptionLimitReached'; payload: { errorCode: string; message: string; currentCount: number; maxAllowed: number; isHive: boolean } };
