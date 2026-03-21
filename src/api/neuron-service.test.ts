import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NeuronService } from './neuron-service.js';
import { ApiClient } from './api-client.js';
import type { PaginatedResponse, NeuronDto, NeuronTypeDto, SynapseDto } from './types.js';

function createMockApiClient() {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  } as unknown as ApiClient;
}

function paginated<T>(records: T[], page = 1, totalPages = 1, totalRecords = records.length): PaginatedResponse<T> {
  return { records, totalRecords, page, totalPages };
}

const BRAIN_ID = 'brain-001';

describe('NeuronService', () => {
  let api: ApiClient;
  let service: NeuronService;

  beforeEach(() => {
    api = createMockApiClient();
    service = new NeuronService(api);
  });

  describe('getBrainCounts', () => {
    it('fetches counts from paginated endpoints', async () => {
      (api.get as any)
        .mockResolvedValueOnce({ totalRecords: 42 })
        .mockResolvedValueOnce({ totalRecords: 5 })
        .mockResolvedValueOnce({ totalRecords: 30 });

      const counts = await service.getBrainCounts(BRAIN_ID);

      expect(counts).toEqual({ neurons: 42, neuronTypes: 5, synapses: 30 });
      expect(api.get).toHaveBeenCalledTimes(3);
      // Verify pageSize=1 for count-only queries
      expect((api.get as any).mock.calls[0][0]).toContain('pageSize=1');
    });
  });

  describe('listNeurons', () => {
    it('fetches single page of neurons', async () => {
      const neurons: NeuronDto[] = [
        { id: 'n1', name: 'Test', brainId: BRAIN_ID, neuronTypeId: 'nt1' },
      ];
      (api.get as any).mockResolvedValueOnce(paginated(neurons));

      const result = await service.listNeurons(BRAIN_ID);

      expect(result).toEqual(neurons);
      expect(api.get).toHaveBeenCalledOnce();
    });

    it('paginates across multiple pages', async () => {
      const page1: NeuronDto[] = [{ id: 'n1', name: 'A', brainId: BRAIN_ID, neuronTypeId: 'nt1' }];
      const page2: NeuronDto[] = [{ id: 'n2', name: 'B', brainId: BRAIN_ID, neuronTypeId: 'nt1' }];

      (api.get as any)
        .mockResolvedValueOnce(paginated(page1, 1, 2))
        .mockResolvedValueOnce(paginated(page2, 2, 2));

      const result = await service.listNeurons(BRAIN_ID);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('n1');
      expect(result[1].id).toBe('n2');
      expect(api.get).toHaveBeenCalledTimes(2);
    });
  });

  describe('listNeuronTypes', () => {
    it('returns neuron types from single page', async () => {
      const types: NeuronTypeDto[] = [
        { id: 'nt1', name: 'Practice', brainId: BRAIN_ID, isFileType: false },
      ];
      (api.get as any).mockResolvedValueOnce(paginated(types));

      const result = await service.listNeuronTypes(BRAIN_ID);

      expect(result).toEqual(types);
    });
  });

  describe('listSynapses', () => {
    it('paginates across multiple pages', async () => {
      const page1: SynapseDto[] = [{ id: 's1', sourceNeuronId: 'n1', targetNeuronId: 'n2', brainId: BRAIN_ID }];
      const page2: SynapseDto[] = [{ id: 's2', sourceNeuronId: 'n2', targetNeuronId: 'n3', brainId: BRAIN_ID }];

      (api.get as any)
        .mockResolvedValueOnce(paginated(page1, 1, 2))
        .mockResolvedValueOnce(paginated(page2, 2, 2));

      const result = await service.listSynapses(BRAIN_ID);

      expect(result).toHaveLength(2);
    });
  });

  describe('updateNeuron', () => {
    it('sends PUT with correct data', async () => {
      const updated: NeuronDto = { id: 'n1', name: 'Updated', content: 'new', brainId: BRAIN_ID, neuronTypeId: 'nt1' };
      (api.put as any).mockResolvedValueOnce(updated);

      const result = await service.updateNeuron('n1', {
        name: 'Updated',
        content: 'new',
        neuronTypeId: 'nt1',
      });

      expect(api.put).toHaveBeenCalledWith('/api/neurons/n1', {
        name: 'Updated',
        content: 'new',
        neuronTypeId: 'nt1',
      });
      expect(result).toEqual(updated);
    });
  });

  describe('getBrainGraphData', () => {
    it('assembles graph data from parallel fetches', async () => {
      const neurons: NeuronDto[] = [{ id: 'n1', name: 'A', brainId: BRAIN_ID, neuronTypeId: 'nt1' }];
      const types: NeuronTypeDto[] = [{ id: 'nt1', name: 'Practice', brainId: BRAIN_ID, isFileType: false }];
      const synapses: SynapseDto[] = [{ id: 's1', sourceNeuronId: 'n1', targetNeuronId: 'n1', brainId: BRAIN_ID }];

      (api.get as any)
        // listNeurons page 1
        .mockResolvedValueOnce(paginated(neurons))
        // listNeuronTypes
        .mockResolvedValueOnce(paginated(types))
        // listSynapses page 1
        .mockResolvedValueOnce(paginated(synapses));

      const result = await service.getBrainGraphData(BRAIN_ID, 'Test Brain');

      expect(result.brainId).toBe(BRAIN_ID);
      expect(result.brainName).toBe('Test Brain');
      expect(result.neurons).toEqual(neurons);
      expect(result.neuronTypes).toEqual(types);
      expect(result.synapses).toEqual(synapses);
      expect(result.counts).toEqual({ neurons: 1, neuronTypes: 1, synapses: 1 });
    });
  });
});
