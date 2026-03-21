import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BrainService } from './brain-service.js';
import { ApiClient } from './api-client.js';

function createMockApiClient() {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  } as unknown as ApiClient;
}

describe('BrainService', () => {
  let api: ApiClient;
  let service: BrainService;

  beforeEach(() => {
    api = createMockApiClient();
    service = new BrainService(api);
  });

  describe('listBrains', () => {
    it('calls correct endpoint', async () => {
      const brains = [{ id: '1', name: 'Brain A', accessLevel: 2, canWrite: true }];
      (api.get as any).mockResolvedValueOnce(brains);

      const result = await service.listBrains();

      expect(api.get).toHaveBeenCalledWith('/api/brains/with-access');
      expect(result).toEqual(brains);
    });
  });

  describe('createBrain', () => {
    it('sends create request with defaults', async () => {
      const created = { id: '2', name: 'New Brain' };
      (api.post as any).mockResolvedValueOnce(created);

      await service.createBrain({ name: 'New Brain' });

      expect(api.post).toHaveBeenCalledWith('/api/brains', {
        name: 'New Brain',
        allowMCPEditing: true,
        isPersonal: true,
      });
    });

    it('respects explicit values over defaults', async () => {
      (api.post as any).mockResolvedValueOnce({});

      await service.createBrain({
        name: 'Org Brain',
        isPersonal: false,
        allowMCPEditing: false,
      });

      expect(api.post).toHaveBeenCalledWith('/api/brains', {
        name: 'Org Brain',
        isPersonal: false,
        allowMCPEditing: false,
      });
    });
  });

  describe('getBrainTemplates', () => {
    it('calls correct endpoint', async () => {
      const templates = [{ id: 't1', name: 'Product Dev', isStandard: true }];
      (api.get as any).mockResolvedValueOnce(templates);

      const result = await service.getBrainTemplates();

      expect(api.get).toHaveBeenCalledWith('/api/brain-templates');
      expect(result).toEqual(templates);
    });
  });
});
