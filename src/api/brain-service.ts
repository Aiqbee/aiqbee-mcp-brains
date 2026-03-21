import { ApiClient } from './api-client.js';
import type {
  BrainWithAccessDto,
  BrainCreateDto,
  BrainDto,
  BrainTemplateDto,
} from './types.js';

export class BrainService {
  constructor(private readonly api: ApiClient) {}

  async listBrains(): Promise<BrainWithAccessDto[]> {
    return this.api.get<BrainWithAccessDto[]>('/api/brains/with-access');
  }

  async createBrain(data: BrainCreateDto): Promise<BrainDto> {
    return this.api.post<BrainDto>('/api/brains', {
      ...data,
      allowMCPEditing: data.allowMCPEditing ?? true,
      isPersonal: data.isPersonal ?? true,
    });
  }

  async getBrainTemplates(): Promise<BrainTemplateDto[]> {
    return this.api.get<BrainTemplateDto[]>('/api/brain-templates');
  }
}
