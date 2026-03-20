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
    <div className="brain-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 4 }}>
        <div className="brain-card-name" title={name}>
          {name}
        </div>
        {accessLevel && <span className="badge">{accessLevel}</span>}
      </div>

      {description && (
        <div className="brain-card-desc" title={description}>
          {description}
        </div>
      )}

      <div className="brain-card-stats">
        {counts ? (
          <>
            <span className="brain-card-stat" title="Neurons">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="4" /></svg>
              {counts.neurons}
            </span>
            <span className="brain-card-stat" title="Neuron Types">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="3" width="10" height="10" rx="2" /></svg>
              {counts.neuronTypes}
            </span>
            <span className="brain-card-stat" title="Synapses">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M3 8h10M10 5l3 3-3 3" stroke="currentColor" strokeWidth="1.5" fill="none" /></svg>
              {counts.synapses}
            </span>
          </>
        ) : (
          <span style={{ opacity: 0.5 }}>Loading counts...</span>
        )}
      </div>

      <div className="brain-card-footer">
        <button className="btn-secondary" onClick={onAddMcpConnection} style={{ fontSize: 11, padding: '4px 8px' }}>
          Add MCP Connection
        </button>
      </div>
    </div>
  );
}
