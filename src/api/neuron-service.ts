import { ApiClient } from './api-client.js';
import type {
  BrainCounts,
  NeuronDto,
  NeuronTypeDto,
  SynapseDto,
  PaginatedResponse,
  BrainGraphData,
} from './types.js';

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
      neurons: neurons?.totalCount ?? 0,
      neuronTypes: neuronTypes?.totalCount ?? 0,
      synapses: synapses?.totalCount ?? 0,
    };
  }

  async listNeurons(brainId: string): Promise<NeuronDto[]> {
    const all: NeuronDto[] = [];
    let page = 1;
    const pageSize = 255;
    while (true) {
      const resp = await this.api.get<PaginatedResponse<NeuronDto>>(
        `/api/neurons?brainId=${brainId}&pageSize=${pageSize}&pageNumber=${page}`
      );
      if (!resp?.items) break;
      all.push(...resp.items);
      if (page >= resp.totalPages) break;
      page++;
    }
    return all;
  }

  async listNeuronTypes(brainId: string): Promise<NeuronTypeDto[]> {
    const resp = await this.api.get<PaginatedResponse<NeuronTypeDto>>(
      `/api/neuron-types?brainId=${brainId}&pageSize=255`
    );
    return resp?.items ?? [];
  }

  async listSynapses(brainId: string): Promise<SynapseDto[]> {
    const all: SynapseDto[] = [];
    let page = 1;
    const pageSize = 255;
    while (true) {
      const resp = await this.api.get<PaginatedResponse<SynapseDto>>(
        `/api/synapses?brainId=${brainId}&pageSize=${pageSize}&pageNumber=${page}`
      );
      if (!resp?.items) break;
      all.push(...resp.items);
      if (page >= resp.totalPages) break;
      page++;
    }
    return all;
  }

  async listNeuronsProgressive(
    brainId: string,
    onPage: (page: number, items: NeuronDto[]) => void,
  ): Promise<NeuronDto[]> {
    const all: NeuronDto[] = [];
    let page = 1;
    const pageSize = 50;
    while (true) {
      const resp = await this.api.get<PaginatedResponse<NeuronDto>>(
        `/api/neurons?brainId=${brainId}&pageSize=${pageSize}&pageNumber=${page}`
      );
      if (!resp?.items || resp.items.length === 0) break;
      all.push(...resp.items);
      onPage(page, resp.items);
      if (page >= resp.totalPages) break;
      page++;
    }
    return all;
  }

  async listSynapsesProgressive(
    brainId: string,
    onPage: (page: number, items: SynapseDto[]) => void,
  ): Promise<SynapseDto[]> {
    const all: SynapseDto[] = [];
    let page = 1;
    const pageSize = 50;
    while (true) {
      const resp = await this.api.get<PaginatedResponse<SynapseDto>>(
        `/api/synapses?brainId=${brainId}&pageSize=${pageSize}&pageNumber=${page}`
      );
      if (!resp?.items || resp.items.length === 0) break;
      all.push(...resp.items);
      onPage(page, resp.items);
      if (page >= resp.totalPages) break;
      page++;
    }
    return all;
  }

  async updateNeuron(neuronId: string, data: { name: string; content: string; neuronTypeId: string }): Promise<NeuronDto> {
    return this.api.put<NeuronDto>(`/api/neurons/${neuronId}`, data);
  }

  async getBrainGraphData(brainId: string, brainName: string): Promise<BrainGraphData> {
    const [neurons, neuronTypes, synapses] = await Promise.all([
      this.listNeurons(brainId),
      this.listNeuronTypes(brainId),
      this.listSynapses(brainId),
    ]);

    return {
      brainId,
      brainName,
      neurons,
      neuronTypes,
      synapses,
      counts: {
        neurons: neurons.length,
        neuronTypes: neuronTypes.length,
        synapses: synapses.length,
      },
    };
  }
}
