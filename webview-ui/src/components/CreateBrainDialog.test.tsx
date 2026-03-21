import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CreateBrainDialog } from './CreateBrainDialog';

// Mock the useVsCode hook
const mockPostMessage = vi.fn();
vi.mock('../hooks/useVsCode', () => ({
  useVsCode: () => ({
    postMessage: mockPostMessage,
    getState: vi.fn(),
    setState: vi.fn(),
  }),
}));

describe('CreateBrainDialog', () => {
  const templates = [
    { id: 't1', name: 'Product Dev', isStandard: true, isDefault: true },
    { id: 't2', name: 'Engineering', isStandard: true, isDefault: false },
  ];

  beforeEach(() => {
    mockPostMessage.mockClear();
  });

  it('renders form fields', () => {
    render(<CreateBrainDialog templates={templates} onClose={vi.fn()} />);

    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Description (optional)')).toBeInTheDocument();
    expect(screen.getByLabelText('Template')).toBeInTheDocument();
  });

  it('selects default template automatically', () => {
    render(<CreateBrainDialog templates={templates} onClose={vi.fn()} />);

    const select = screen.getByLabelText('Template') as HTMLSelectElement;
    expect(select.value).toBe('t1');
  });

  it('disables submit when name is empty', () => {
    render(<CreateBrainDialog templates={templates} onClose={vi.fn()} />);

    const submitBtn = screen.getByText('Create Brain');
    expect(submitBtn).toBeDisabled();
  });

  it('enables submit when name is provided', () => {
    render(<CreateBrainDialog templates={templates} onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'My Brain' } });

    expect(screen.getByText('Create Brain')).not.toBeDisabled();
  });

  it('posts createBrain message on submit', () => {
    render(<CreateBrainDialog templates={templates} onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Test Brain' } });
    fireEvent.submit(screen.getByText('Create Brain'));

    expect(mockPostMessage).toHaveBeenCalledWith({
      command: 'createBrain',
      payload: {
        name: 'Test Brain',
        description: undefined,
        brainTemplateId: 't1',
        isPersonal: true,
        allowMCPEditing: true,
      },
    });
  });

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn();
    render(<CreateBrainDialog templates={templates} onClose={onClose} />);

    fireEvent.click(screen.getByText('Cancel'));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when overlay is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(<CreateBrainDialog templates={templates} onClose={onClose} />);

    const overlay = container.querySelector('.dialog-overlay')!;
    fireEvent.click(overlay);

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not close when dialog content is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(<CreateBrainDialog templates={templates} onClose={onClose} />);

    const dialog = container.querySelector('.dialog')!;
    fireEvent.click(dialog);

    expect(onClose).not.toHaveBeenCalled();
  });
});
