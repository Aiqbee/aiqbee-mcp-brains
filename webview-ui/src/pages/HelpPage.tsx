import { useState } from 'react';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="faq-section">
      <button className="faq-toggle" onClick={() => setOpen(!open)}>
        <svg
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="currentColor"
          style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}
        >
          <path d="M6 3l5 5-5 5V3z" />
        </svg>
        <span>{title}</span>
      </button>
      {open && <div className="faq-content">{children}</div>}
    </div>
  );
}

export function HelpPage() {
  return (
    <div className="page">
      <div className="page-header">
        <span className="page-title">Help</span>
      </div>

      <Section title="What is an Aiqbee Brain?">
        <p>
          A Brain is a structured knowledge base made up of <strong>neurons</strong> (knowledge
          entries), <strong>neuron types</strong> (categories), and <strong>synapses</strong>{' '}
          (relationships between neurons). Think of it as a living, queryable knowledge graph your
          AI tools can read from and write to.
        </p>
      </Section>

      <Section title="When should I use a brain (and when not)?">
        <p><strong>Use a brain for knowledge that is reusable</strong> across teams, projects, and agents:</p>
        <ul>
          <li><strong>Patterns and practices</strong> — coding conventions, architecture decisions, UI patterns that apply beyond a single repo.</li>
          <li><strong>Lessons learned</strong> — what went wrong, what worked, and the correct approach so others (human or AI) don't repeat mistakes.</li>
          <li><strong>Feature and product descriptions</strong> — enabling developers, product managers, and marketing to stay aligned without reading every line of code.</li>
          <li><strong>Standards and checklists</strong> — code review criteria, deployment procedures, security requirements.</li>
          <li><strong>Cross-project knowledge</strong> — API contracts, shared library usage, integration patterns between services.</li>
        </ul>
        <p><strong>Don't store</strong> things better kept in code or git: implementation details specific to one file, temporary debugging notes, or information that changes with every commit.</p>
        <p><strong>Key advantage — unlimited size, minimal token cost:</strong> Unlike stuffing context into a <code>CLAUDE.md</code> file (which is loaded on every message), a brain can hold thousands of neurons. The AI agent only searches and fetches the specific neurons it needs for the current task, keeping each conversation lean. This means lower token usage, lower cost, and faster responses — while the full knowledge base remains available on demand.</p>
        <p>Think of the brain as your team's shared long-term memory. The <code>CLAUDE.md</code> tells the agent <em>when</em> to look things up; the brain holds <em>what</em> it finds.</p>
      </Section>

      <Section title="What is MCP and how does it connect?">
        <p>
          MCP (Model Context Protocol) lets AI coding assistants — Claude Code, Cursor, Windsurf,
          etc. — communicate with external tools at runtime. When you click{' '}
          <strong>"Add MCP Connection"</strong> on a brain, this extension writes the connection
          config into your project so your assistant can search, read, and update that brain
          directly.
        </p>
      </Section>

      <Section title="How do I add a brain connection?">
        <ol>
          <li>Sign in and find your brain in the <strong>Brains</strong> tab.</li>
          <li>
            Click the <strong>+</strong> button next to the brain. You'll be prompted to choose a
            target file:
            <ul>
              <li>
                <code>.claude/settings.json</code> — for Claude Code
              </li>
              <li>
                <code>.mcp.json</code> — for Cursor, Windsurf, and other MCP-compatible tools
              </li>
            </ul>
          </li>
          <li>The connection is written automatically. No manual editing needed.</li>
        </ol>
      </Section>

      <Section title="Connection not working after setup?">
        <p>
          After adding an MCP connection for the first time, you need to{' '}
          <strong>restart VS Code</strong> or <strong>reload the LLM window</strong> (e.g. type{' '}
          <code>/mcp</code> in Claude Code, or restart Cursor's AI pane) for the assistant to pick
          up the new server. This is a one-time step per new connection.
        </p>
      </Section>

      <Section title="How do I tell my AI assistant to use the brain?">
        <p>
          Add instructions to your project's <code>CLAUDE.md</code> (for Claude Code) or{' '}
          <code>agents.md</code> / <code>.cursorrules</code> (for other tools). For example:
        </p>
        <pre className="faq-code">{`## Brain Search Triggers

Before coding, search the <Brain Name> Brain
for relevant practices:

| When you are...        | Search for             |
|------------------------|------------------------|
| Starting any task      | \`agentic planning\`     |
| Making a UI change     | \`UI pattern\`           |
| Fixing a bug           | \`lesson learned\`       |
| About to commit        | \`code review checklist\`|

## Brain Maintenance

- Bug fixed → update or create a neuron
- Feature added → update the product neuron
- Lesson learned → create a Recipe neuron`}</pre>
        <p>
          Keeping brain instructions in your instructions file means they are loaded once, reducing
          context window usage — the assistant only fetches neurons when it actually needs them.
        </p>
      </Section>

      <Section title="It's a live database — what does that mean?">
        <p>
          Brains are <strong>shared, real-time databases</strong>. When one developer (or AI agent)
          writes a neuron, it is immediately available to every other user and agent with access.
          This means:
        </p>
        <ul>
          <li>Sub-agents in parallel workflows can use the brain to coordinate and share findings.</li>
          <li>Knowledge captured by one team member is instantly searchable by others.</li>
          <li>
            Lessons learned, patterns, and decisions accumulate over time — the brain gets smarter
            as you work.
          </li>
        </ul>
      </Section>

      <Section title="Can I manage users and permissions?">
        <p>
          Basic access can be managed via MCP prompts (see the <strong>Prompts</strong> tab). For
          advanced configuration — adding multiple users, creating teams, managing organisation
          brains — use the full web app:
        </p>
        <p>
          <a
            href="https://app.aiqbee.com"
            className="link"
            style={{ fontSize: 13 }}
            onClick={(e) => {
              e.preventDefault();
              // VS Code webview external link handling
              const vscode = (window as any).acquireVsCodeApi?.() ?? (window as any).__vscode;
              if (vscode) {
                vscode.postMessage({ command: 'openExternal', payload: { url: 'https://app.aiqbee.com' } });
              }
            }}
          >
            Open app.aiqbee.com
          </a>
        </p>
      </Section>

      <Section title="What are service accounts?">
        <p>
          Service accounts (<code>sa:&lt;name&gt;</code>) allow machine-to-machine access to a
          brain without interactive sign-in. Use them for CI/CD pipelines, automated agents, or
          background services that need to read or write brain data. Create and manage them from the
          web app at{' '}
          <a
            href="https://app.aiqbee.com"
            className="link"
            onClick={(e) => {
              e.preventDefault();
              const vscode = (window as any).acquireVsCodeApi?.() ?? (window as any).__vscode;
              if (vscode) {
                vscode.postMessage({ command: 'openExternal', payload: { url: 'https://app.aiqbee.com' } });
              }
            }}
          >
            app.aiqbee.com
          </a>.
        </p>
      </Section>

      <Section title="Available MCP tools">
        <p>Once connected, your AI assistant can use these tools:</p>
        <ul>
          <li><strong>aiqbee_search</strong> — Search neurons by keyword</li>
          <li><strong>aiqbee_fetch</strong> — Read a neuron's full content</li>
          <li><strong>aiqbee_create_neuron</strong> — Add new knowledge</li>
          <li><strong>aiqbee_update_neuron</strong> — Update existing neurons</li>
          <li><strong>aiqbee_list_neurons</strong> — List all neurons (with filtering)</li>
          <li><strong>aiqbee_get_relationships</strong> — View neuron connections</li>
          <li><strong>aiqbee_create_relationship</strong> — Link neurons together</li>
          <li><strong>aiqbee_list_neuron_types</strong> — List categories</li>
          <li><strong>aiqbee_list_users</strong> — See who has access</li>
          <li><strong>aiqbee_grant_access</strong> — Add user permissions</li>
          <li><strong>aiqbee_revoke_access</strong> — Remove user access</li>
          <li><strong>aiqbee_get_brain_info</strong> — Brain metadata</li>
        </ul>
      </Section>
    </div>
  );
}
