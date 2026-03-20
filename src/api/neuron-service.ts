import { ApiClient } from './api-client.js';
import type { BrainCounts, PaginatedResponse } from './types.js';

export class NeuronService {
  constructor(private readonly api: ApiClient) {}

  async getBrainCounts(brainId: string): Promise<BrainCounts> {
    const [neurons, neuronTypes, synapses] = await Promise.all([
      this.api.get<PaginatedResponse<unknown>>(
        `/api/neurons?brainId=${brainId}&pageSize=1`
      ),
      this.api.get<PaginatedResponse<unknown>>(
        `/api/neuron-types?brainId=${brainId}&pageSize=1`
      ),
      this.api.get<PaginatedResponse<unknown>>(
        `/api/synapses?brainId=${brainId}&pageSize=1`
      ),
    ]);

    return {
      neurons: neurons.totalCount,
      neuronTypes: neuronTypes.totalCount,
      synapses: synapses.totalCount,
    };
  }
}
