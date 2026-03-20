interface BrainCounts {
  neurons: number;
  neuronTypes: number;
  synapses: number;
}

interface BrainCardProps {
  name: string;
  description?: string;
  accessLevel: string;
  counts?: BrainCounts;
  onAddMcpConnection: () => void;
}

export function BrainCard({
  name,
  description,
  accessLevel,
  counts,
  onAddMcpConnection,
}: BrainCardProps) {
  return (
    <div className="brain-row">
      <div className="brain-row-main">
        <div className="brain-row-header">
          <span className="brain-row-name" title={name}>{name}</span>
          {accessLevel && <span className="badge">{accessLevel}</span>}
        </div>
        {description && (
          <div className="brain-row-desc" title={description}>{description}</div>
        )}
        <div className="brain-row-stats">
          {counts ? (
            <>
              <span className="brain-row-stat" title="Neurons">
                <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="4" /></svg>
                {counts.neurons}
              </span>
              <span className="brain-row-stat" title="Neuron Types">
                <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="3" width="10" height="10" rx="2" /></svg>
                {counts.neuronTypes}
              </span>
              <span className="brain-row-stat" title="Synapses">
                <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M3 8h10M10 5l3 3-3 3" stroke="currentColor" strokeWidth="1.5" fill="none" /></svg>
                {counts.synapses}
              </span>
            </>
          ) : (
            <span style={{ opacity: 0.5, fontSize: 10 }}>...</span>
          )}
        </div>
      </div>
      <button
        className="btn-icon"
        onClick={onAddMcpConnection}
        title="Add MCP Connection"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
      </button>
    </div>
  );
}
