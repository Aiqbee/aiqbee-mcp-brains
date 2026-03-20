import { useState } from 'react';
import { useVsCode } from '../hooks/useVsCode';

interface BrainTemplateDto {
  id: string;
  name: string;
  description?: string;
  isStandard: boolean;
  isDefault: boolean;
}

interface CreateBrainDialogProps {
  templates: BrainTemplateDto[];
  onClose: () => void;
}

export function CreateBrainDialog({ templates, onClose }: CreateBrainDialogProps) {
  const { postMessage } = useVsCode();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [templateId, setTemplateId] = useState(() => {
    const defaultTemplate = templates.find((t) => t.isDefault);
    return defaultTemplate?.id || '';
  });
  const [isPersonal, setIsPersonal] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSubmitting(true);
    postMessage({
      command: 'createBrain',
      payload: {
        name: name.trim(),
        description: description.trim() || undefined,
        brainTemplateId: templateId || undefined,
        isPersonal,
        allowMCPEditing: true,
      },
    });
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">Create New Brain</div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="form-group">
            <label htmlFor="brainName">Name</label>
            <input
              id="brainName"
              type="text"
              placeholder="My Brain"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="brainDesc">Description (optional)</label>
            <textarea
              id="brainDesc"
              placeholder="What is this brain for?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              style={{ resize: 'vertical' }}
            />
          </div>

          {templates.length > 0 && (
            <div className="form-group">
              <label htmlFor="brainTemplate">Template (optional)</label>
              <select
                id="brainTemplate"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
              >
                <option value="">No template</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}{t.isDefault ? ' (default)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="toggle-row">
            <label style={{ fontSize: 12 }}>Personal Brain</label>
            <div
              className={`toggle ${isPersonal ? 'active' : ''}`}
              onClick={() => setIsPersonal(!isPersonal)}
              role="switch"
              aria-checked={isPersonal}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === ' ' || e.key === 'Enter') {
                  e.preventDefault();
                  setIsPersonal(!isPersonal);
                }
              }}
            />
          </div>

          <div className="dialog-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={!name.trim() || submitting}
            >
              {submitting ? 'Creating...' : 'Create Brain'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
