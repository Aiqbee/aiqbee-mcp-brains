import { useState, useCallback, useEffect } from 'react';
import { useVsCode, useMessageListener } from '../hooks/useVsCode';
import { BrainCard } from '../components/BrainCard';
import { CreateBrainDialog } from '../components/CreateBrainDialog';

interface BrainWithAccessDto {
  id: string;
  name: string;
  description?: string;
  isPersonal: boolean;
  allowMCPEditing: boolean;
  accessLevel: number;
  canWrite: boolean;
  canManageAccess: boolean;
}

interface BrainCounts {
  neurons: number;
  neuronTypes: number;
  synapses: number;
}

interface BrainTemplateDto {
  id: string;
  name: string;
  description?: string;
  isStandard: boolean;
  isDefault: boolean;
}

interface UserDto {
  id: string;
  givenName: string;
  familyName: string;
  email: string;
}

interface BrainsPageProps {
  user?: UserDto;
  onSignOut: () => void;
}

export function BrainsPage({ user, onSignOut }: BrainsPageProps) {
  const { postMessage } = useVsCode();
  const [brains, setBrains] = useState<BrainWithAccessDto[]>([]);
  const [counts, setCounts] = useState<Record<string, BrainCounts>>({});
  const [templates, setTemplates] = useState<BrainTemplateDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [error, setError] = useState<string>();

  // Listen for messages from extension host
  useMessageListener(
    useCallback((event: MessageEvent) => {
      const message = event.data;
      switch (message.command) {
        case 'brainsLoaded':
          setBrains(message.payload);
          setLoading(false);
          break;
        case 'brainCounts':
          setCounts((prev) => ({
            ...prev,
            [message.payload.brainId]: message.payload.counts,
          }));
          break;
        case 'brainCreated':
          setShowCreateDialog(false);
          // Refresh the brain list
          postMessage({ command: 'listBrains' });
          break;
        case 'brainTemplatesLoaded':
          setTemplates(message.payload);
          break;
        case 'loading':
          if (message.payload.command === 'listBrains') {
            setLoading(message.payload.loading);
          }
          break;
        case 'error':
          setError(message.payload.message);
          setLoading(false);
          break;
      }
    }, [postMessage]),
  );

  // Load brains on mount
  useEffect(() => {
    postMessage({ command: 'listBrains' });
  }, [postMessage]);

  const handleRefresh = useCallback(() => {
    setLoading(true);
    setError(undefined);
    postMessage({ command: 'listBrains' });
  }, [postMessage]);

  const handleCreateBrain = useCallback(() => {
    postMessage({ command: 'getBrainTemplates' });
    setShowCreateDialog(true);
  }, [postMessage]);

  const handleAddMcpConnection = useCallback(
    (brainId: string, brainName: string) => {
      postMessage({ command: 'addMcpConnection', payload: { brainId, brainName } });
    },
    [postMessage],
  );

  const accessLevelLabel = (level: number): string => {
    switch (level) {
      case 0: return 'Read';
      case 1: return 'Read/Write';
      case 2: return 'Owner';
      default: return '';
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <span className="page-title">Your Brains</span>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <button className="btn-icon" onClick={handleCreateBrain} title="New Brain">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.5" fill="none" />
            </svg>
          </button>
          <button className="btn-icon" onClick={handleRefresh} title="Refresh">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M13.45 5.45A6 6 0 1 0 14 8h-1.5a4.5 4.5 0 1 1-.87-2.65L10 7h5V2l-1.55 3.45z" />
            </svg>
          </button>
          <button className="btn-icon" onClick={onSignOut} title="Sign Out">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M11 3v2h-1V4H3v8h7v-1h1v2H2V3h9zm1.5 2.5l3 2.5-3 2.5V9H6V7h6.5V5.5z" />
            </svg>
          </button>
        </div>
      </div>

      {user && (
        <div style={{ fontSize: 12, color: 'var(--vscode-descriptionForeground)' }}>
          {user.givenName} {user.familyName} ({user.email})
        </div>
      )}

      {error && <div className="error-message">{error}</div>}

      {loading ? (
        <div className="loading-container">
          <div className="spinner" />
          <span>Loading brains...</span>
        </div>
      ) : (
        <div className="brain-list">
          {brains.map((brain) => (
            <BrainCard
              key={brain.id}
              name={brain.name}
              description={brain.description}
              accessLevel={accessLevelLabel(brain.accessLevel)}
              counts={counts[brain.id]}
              onAddMcpConnection={() => handleAddMcpConnection(brain.id, brain.name)}
            />
          ))}
        </div>
      )}

      {brains.length === 0 && !loading && !error && (
        <div className="welcome">
          <div className="welcome-desc">
            No brains found. Create your first brain to get started.
          </div>
        </div>
      )}

      {showCreateDialog && (
        <CreateBrainDialog
          templates={templates}
          onClose={() => setShowCreateDialog(false)}
        />
      )}
    </div>
  );
}
