import { useState } from 'react';

interface Prompt {
  label: string;
  text: string;
}

const prompts: Prompt[] = [
  {
    label: 'Scan project and capture knowledge',
    text: 'Scan the current project and add best patterns, practices and any lessons learned to the <Brain Name> brain. Create neurons for each pattern, categorise by neuron type, and link related neurons with synapses.',
  },
  {
    label: 'Search brain before starting work',
    text: 'Before starting this task, search the <Brain Name> brain for any relevant practices, lessons learned, or prior decisions that should inform the approach. Summarise what you find.',
  },
  {
    label: 'Record a lesson learned',
    text: 'Create a "Lesson Learned" neuron in the <Brain Name> brain documenting what just happened: the problem, what didn\'t work, and the correct approach. Link it to any related neurons.',
  },
  {
    label: 'List who has access to a brain',
    text: 'Use the <Brain Name> brain to list all users and service accounts that currently have access, including their access levels (Read, ReadWrite, Owner).',
  },
  {
    label: 'Grant a user access',
    text: 'Grant ReadWrite access to user@example.com on the <Brain Name> brain. Confirm the access was added by listing current users afterward.',
  },
  {
    label: 'Run a brain health check',
    text: 'Run a health check on the <Brain Name> brain: identify orphaned neurons (no relationships), neurons with empty content, weak connections, and suggest improvements.',
  },
  {
    label: 'Create a knowledge map',
    text: 'Create a structured knowledge map of the <Brain Name> brain. List all neuron types with their neuron counts, show key relationships, and identify any gaps in coverage.',
  },
  {
    label: 'Document a new API or feature',
    text: 'Create neurons in the <Brain Name> brain documenting the API/feature I just built. Include endpoint details, usage examples, design decisions, and link to related neurons.',
  },
  {
    label: 'Review and update stale neurons',
    text: 'Search the <Brain Name> brain for neurons that may be outdated based on recent code changes in this project. List candidates and suggest updates or deletions.',
  },
  {
    label: 'Add code review checklist',
    text: 'Search the <Brain Name> brain for our code review checklist. If one doesn\'t exist, create a comprehensive "Code Review Checklist" neuron covering our key quality standards, common mistakes, and required checks.',
  },
  {
    label: 'Bootstrap a new project from brain knowledge',
    text: 'I\'m starting a new project. Search the <Brain Name> brain for all relevant patterns, practices, architecture decisions, and standards. Create a project setup plan that applies these patterns, including folder structure, coding conventions, CI/CD setup, and any boilerplate based on what the brain recommends.',
  },
  {
    label: 'Apply brain standards to existing project',
    text: 'Review the current project structure and code against patterns and standards stored in the <Brain Name> brain. Identify gaps where the project doesn\'t follow documented practices and suggest specific changes to bring it into alignment.',
  },
  {
    label: 'Optimise brain structure and linkages',
    text: 'Analyse the <Brain Name> brain for structural improvements. Review neuron types — merge duplicates, rename unclear ones, add missing categories. Check all neurons are correctly typed. Identify neurons that should be linked but aren\'t, and create missing synapses. Remove redundant or broken relationships. Summarise all changes made.',
  },
  {
    label: 'Migrate project instructions to a development brain',
    text: 'I want to move project knowledge out of my agent instructions file (CLAUDE.md, AGENTS.md, or equivalent) and into the <Brain Name> brain so it can be shared, versioned, and queried by any AI assistant via MCP. Follow these steps:\n\n1. Read the current agent instructions file (check for CLAUDE.md, AGENTS.md, or similar) in this repository.\n2. For each distinct topic (coding standards, architecture decisions, development practices, common patterns, lessons learned, environment setup, CI/CD rules, review checklists), create a neuron in the <Brain Name> brain with the appropriate neuron type.\n3. Create synapses (relationships) between related neurons — e.g. link a coding standard to the lesson learned that motivated it.\n4. After all neurons are created, replace the instructions file with a slim version that only contains: (a) the product name, (b) a one-line description, (c) essential build/run commands, and (d) an instruction to search the <Brain Name> brain before starting any task.\n5. Show me a summary of neurons created, relationships added, and the proposed slim instructions file before applying changes.',
  },
];

export function PromptsPage() {
  const [copied, setCopied] = useState<number | null>(null);

  const handleCopy = (index: number, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(index);
      setTimeout(() => setCopied(null), 1500);
    });
  };

  return (
    <div className="page">
      <div className="page-header">
        <span className="page-title">Prompts</span>
      </div>
      <p style={{ fontSize: 12, color: 'var(--vscode-descriptionForeground)', margin: 0 }}>
        Copy these prompts into your AI assistant. Replace <code>&lt;Brain Name&gt;</code> with
        your brain's MCP connector name.
      </p>

      <div className="prompt-list">
        {prompts.map((p, i) => (
          <div key={i} className="prompt-item">
            <div className="prompt-item-main">
              <div className="prompt-item-label">{p.label}</div>
              <div className="prompt-item-text">{p.text}</div>
            </div>
            <button
              className="btn-icon prompt-copy-btn"
              title="Copy to clipboard"
              onClick={() => handleCopy(i, p.text)}
            >
              {copied === i ? (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M6 11.5L2.5 8l1-1L6 9.5l6.5-6.5 1 1L6 11.5z" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M4 4v10h8V4H4zm-1-1h10v12H3V3zm2-2h8v1H5V1zm-1 0v1H4V1a1 1 0 011-1h8a1 1 0 011 1v1h-1V1H5z" />
                </svg>
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
