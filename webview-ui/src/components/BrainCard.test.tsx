import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrainCard } from './BrainCard';

describe('BrainCard', () => {
  const defaultProps = {
    name: 'Product Brain',
    accessLevel: 'Owner',
    onAddMcpConnection: vi.fn(),
    onOpenGraph: vi.fn(),
  };

  it('renders brain name and access level badge', () => {
    render(<BrainCard {...defaultProps} />);

    expect(screen.getByText('Product Brain')).toBeInTheDocument();
    expect(screen.getByText('Owner')).toBeInTheDocument();
  });

  it('renders description when provided', () => {
    render(<BrainCard {...defaultProps} description="A test brain" />);

    expect(screen.getByText('A test brain')).toBeInTheDocument();
  });

  it('does not render description when absent', () => {
    const { container } = render(<BrainCard {...defaultProps} />);

    expect(container.querySelector('.brain-row-desc')).toBeNull();
  });

  it('calls onOpenGraph when graph button is clicked', () => {
    render(<BrainCard {...defaultProps} />);

    const graphBtn = screen.getByTitle('View Brain Graph');
    fireEvent.click(graphBtn);

    expect(defaultProps.onOpenGraph).toHaveBeenCalledOnce();
  });

  it('calls onAddMcpConnection when MCP button is clicked', () => {
    render(<BrainCard {...defaultProps} />);

    const mcpBtn = screen.getByTitle('Add MCP Connection');
    fireEvent.click(mcpBtn);

    expect(defaultProps.onAddMcpConnection).toHaveBeenCalledOnce();
  });
});
