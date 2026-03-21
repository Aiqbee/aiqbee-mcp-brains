interface BrainCardProps {
  name: string;
  description?: string;
  accessLevel: string;
  onAddMcpConnection: () => void;
  onOpenGraph: () => void;
}

export function BrainCard({
  name,
  description,
  accessLevel,
  onAddMcpConnection,
  onOpenGraph,
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
      </div>
      <button
        className="btn-icon"
        onClick={onOpenGraph}
        title="View Brain Graph"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="4" cy="4" r="2" />
          <circle cx="12" cy="4" r="2" />
          <circle cx="8" cy="13" r="2" />
          <line x1="5.5" y1="5.2" x2="7" y2="11.3" stroke="currentColor" strokeWidth="1" />
          <line x1="10.5" y1="5.2" x2="9" y2="11.3" stroke="currentColor" strokeWidth="1" />
          <line x1="6" y1="4" x2="10" y2="4" stroke="currentColor" strokeWidth="1" />
        </svg>
      </button>
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
