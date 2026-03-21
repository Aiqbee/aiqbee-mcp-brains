import * as vscode from 'vscode';
import { NeuronService } from '../api/neuron-service.js';

const log = vscode.window.createOutputChannel('Aiqbee Brain Graph');

export class BrainGraphPanel {
  public static readonly viewType = 'aiqbee.brainGraph';
  private static panels = new Map<string, BrainGraphPanel>();
  private readonly panel: vscode.WebviewPanel;

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
    private readonly neuronService: NeuronService,
    private readonly brainId: string,
    private readonly brainName: string,
    private readonly canWrite: boolean,
  ) {
    this.panel = panel;
    this.panel.webview.html = this.getHtml();

    this.panel.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'ready':
          await this.sendGraphData();
          break;
        case 'saveNeuron':
          await this.handleSaveNeuron(message);
          break;
      }
    });

    this.panel.onDidDispose(() => {
      BrainGraphPanel.panels.delete(this.brainId);
    });
  }

  static createOrShow(
    extensionUri: vscode.Uri,
    neuronService: NeuronService,
    brainId: string,
    brainName: string,
    canWrite: boolean,
  ): void {
    const existing = BrainGraphPanel.panels.get(brainId);
    if (existing) {
      existing.panel.reveal(vscode.ViewColumn.One);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      BrainGraphPanel.viewType,
      `Brain Graph: ${brainName}`,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'media'),
        ],
      },
    );

    const instance = new BrainGraphPanel(panel, extensionUri, neuronService, brainId, brainName, canWrite);
    BrainGraphPanel.panels.set(brainId, instance);
  }

  private async sendGraphData(): Promise<void> {
    try {
      this.panel.webview.postMessage({ type: 'loading', loading: true });
      log.appendLine(`[${this.brainName}] Starting graph data load...`);

      // Phase 1: Counts (fast — pageSize=1 just to get totals)
      log.appendLine(`[${this.brainName}] Fetching counts...`);
      const counts = await this.neuronService.getBrainCounts(this.brainId);
      log.appendLine(`[${this.brainName}] Counts: ${counts.neurons} neurons, ${counts.neuronTypes} types, ${counts.synapses} synapses`);
      this.panel.webview.postMessage({ type: 'graphCounts', counts });

      // Phase 2: Neuron types (usually small, needed for colors)
      log.appendLine(`[${this.brainName}] Fetching neuron types...`);
      const neuronTypes = await this.neuronService.listNeuronTypes(this.brainId);
      log.appendLine(`[${this.brainName}] Got ${neuronTypes.length} neuron types`);
      this.panel.webview.postMessage({ type: 'graphNeuronTypes', neuronTypes });

      // Phase 3: Neurons (paged, progressive)
      log.appendLine(`[${this.brainName}] Fetching neurons...`);
      const neurons = await this.neuronService.listNeuronsProgressive(this.brainId, (page, items) => {
        log.appendLine(`[${this.brainName}] Neurons page ${page}: ${items.length} items`);
        this.panel.webview.postMessage({ type: 'graphNeuronsPage', neurons: items, page });
      });
      log.appendLine(`[${this.brainName}] Total neurons: ${neurons.length}`);

      // Phase 4: Synapses (paged, progressive)
      log.appendLine(`[${this.brainName}] Fetching synapses...`);
      const synapses = await this.neuronService.listSynapsesProgressive(this.brainId, (page, items) => {
        log.appendLine(`[${this.brainName}] Synapses page ${page}: ${items.length} items`);
        this.panel.webview.postMessage({ type: 'graphSynapsesPage', synapses: items, page });
      });
      log.appendLine(`[${this.brainName}] Total synapses: ${synapses.length}`);

      // Phase 5: Signal complete
      this.panel.webview.postMessage({ type: 'graphComplete' });
      log.appendLine(`[${this.brainName}] Graph data load complete`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.appendLine(`[${this.brainName}] ERROR: ${msg}`);
      if (err instanceof Error && err.stack) {
        log.appendLine(err.stack);
      }
      this.panel.webview.postMessage({ type: 'error', message: msg });
    }
  }

  private async handleSaveNeuron(message: any): Promise<void> {
    try {
      this.panel.webview.postMessage({ type: 'savingNeuron', neuronId: message.neuronId, saving: true });
      await this.neuronService.updateNeuron(message.neuronId, {
        name: message.name,
        content: message.content,
        neuronTypeId: message.neuronTypeId,
      });
      this.panel.webview.postMessage({
        type: 'neuronSaved',
        neuronId: message.neuronId,
        name: message.name,
        content: message.content,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.panel.webview.postMessage({
        type: 'saveError',
        neuronId: message.neuronId,
        message: msg,
      });
    }
  }

  private getHtml(): string {
    const webview = this.panel.webview;
    const mediaUri = vscode.Uri.joinPath(this.extensionUri, 'media');
    const forceGraphUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'force-graph.min.js'));
    const nonce = getNonce();
    const canWriteJs = this.canWrite ? 'true' : 'false';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}' 'unsafe-eval'; font-src ${webview.cspSource};">
  <title>Brain Graph: ${escapeHtml(this.brainName)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: var(--vscode-editor-background, #1e1e1e);
      color: var(--vscode-editor-foreground, #d4d4d4);
      font-family: var(--vscode-font-family, 'Segoe UI', sans-serif);
      font-size: 13px;
      overflow: hidden;
      width: 100vw;
      height: 100vh;
    }

    /* Stats bar */
    #stats-bar {
      position: absolute;
      top: 0; left: 0; right: 0;
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 8px 16px;
      background: var(--vscode-editor-background, rgba(30,30,30,0.92));
      border-bottom: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.08));
      z-index: 20;
      font-size: 12px;
    }
    #stats-bar .brain-title {
      font-weight: 700;
      font-size: 14px;
      margin-right: 8px;
      color: var(--vscode-editor-foreground, #e0e0e0);
    }
    .stat-chip {
      display: flex; align-items: center; gap: 4px;
      padding: 2px 8px;
      background: rgba(255,255,255,0.06);
      border-radius: 3px;
      color: #b0b0b0;
    }
    .stat-chip strong { color: #e0e0e0; }

    /* Graph container */
    #graph-container {
      position: absolute;
      top: 40px; left: 0; right: 0; bottom: 0;
    }

    /* Legend panel */
    #legend-panel {
      position: absolute;
      top: 48px; right: 8px;
      max-width: 200px;
      max-height: calc(100vh - 80px);
      background: rgba(30,30,30,0.94);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 4px;
      z-index: 15;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    #legend-toggle {
      display: flex; align-items: center; gap: 6px;
      padding: 6px 10px;
      cursor: pointer;
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #ccc;
      background: transparent;
      border: none;
      width: 100%;
      text-align: left;
    }
    #legend-toggle:hover { background: rgba(255,255,255,0.05); }
    #legend-toggle svg { transition: transform 0.15s; }
    #legend-body {
      overflow-y: auto;
      padding: 0 10px 8px;
    }
    #legend-body.collapsed { display: none; }
    .legend-item {
      display: flex; align-items: center; gap: 6px;
      padding: 3px 0;
      font-size: 11px;
      color: #b0b0b0;
    }
    .legend-swatch {
      width: 10px; height: 10px;
      border-radius: 2px;
      flex-shrink: 0;
    }

    /* Node detail popup */
    #node-popup-overlay {
      display: none;
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.5);
      z-index: 50;
      align-items: center;
      justify-content: center;
    }
    #node-popup-overlay.visible { display: flex; }
    #node-popup {
      background: #252526;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 6px;
      width: 90%;
      max-width: 500px;
      max-height: 70vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    }
    #node-popup-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 16px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
    }
    #node-popup-header h3 {
      font-size: 15px; font-weight: 600; color: #e0e0e0; margin: 0;
      flex: 1;
    }
    #node-popup-close {
      background: transparent; border: none; color: #999;
      font-size: 18px; cursor: pointer; padding: 2px 6px; border-radius: 3px;
    }
    #node-popup-close:hover { background: rgba(255,255,255,0.08); color: #e0e0e0; }
    #node-popup-meta {
      padding: 8px 16px; font-size: 11px; color: #888;
      border-bottom: 1px solid rgba(255,255,255,0.05);
    }
    #node-popup-meta .type-badge {
      display: inline-block; padding: 1px 6px; border-radius: 2px;
      background: rgba(255,255,255,0.08); color: #ccc; font-weight: 600; margin-left: 4px;
    }
    #node-popup-body {
      padding: 12px 16px;
      overflow-y: auto;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    /* Read-only content */
    .popup-content-readonly {
      font-size: 13px; line-height: 1.6; color: #d4d4d4;
      white-space: pre-wrap; word-break: break-word;
    }

    /* Editable fields */
    .popup-field { display: flex; flex-direction: column; gap: 3px; }
    .popup-field label { font-size: 11px; font-weight: 600; color: #999; text-transform: uppercase; letter-spacing: 0.3px; }
    .popup-field input, .popup-field textarea {
      background: #1e1e1e; color: #d4d4d4; border: 1px solid rgba(255,255,255,0.12);
      border-radius: 3px; padding: 6px 8px; font-family: inherit; font-size: 13px;
      outline: none; width: 100%;
    }
    .popup-field input:focus, .popup-field textarea:focus { border-color: #4FC3F7; }
    .popup-field textarea { resize: vertical; min-height: 120px; line-height: 1.5; }

    /* Popup footer */
    #node-popup-footer {
      padding: 8px 16px 12px;
      display: flex; gap: 8px; justify-content: flex-end; align-items: center;
      border-top: 1px solid rgba(255,255,255,0.05);
    }
    .popup-btn {
      padding: 5px 14px; border-radius: 3px; font-size: 12px;
      font-weight: 600; cursor: pointer; border: none;
    }
    .popup-btn-primary { background: #0e639c; color: #fff; }
    .popup-btn-primary:hover { background: #1177bb; }
    .popup-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
    .popup-btn-secondary { background: rgba(255,255,255,0.08); color: #ccc; }
    .popup-btn-secondary:hover { background: rgba(255,255,255,0.14); }
    .popup-btn-danger { background: transparent; color: #f48771; font-weight: 400; }
    .popup-btn-danger:hover { text-decoration: underline; }

    /* Error banner */
    .popup-error {
      background: rgba(244,135,113,0.12); color: #f48771; padding: 6px 10px;
      border-radius: 3px; font-size: 12px; display: flex; align-items: center;
      gap: 8px; justify-content: space-between;
    }
    .popup-error-msg { flex: 1; }
    .popup-error-actions { display: flex; gap: 6px; flex-shrink: 0; }

    /* Loading */
    #loading-overlay {
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      display: flex; align-items: center; justify-content: center;
      background: var(--vscode-editor-background, rgba(30,30,30,0.9));
      z-index: 30;
      flex-direction: column; gap: 12px;
    }
    /* Compact status bar shown during progressive loading */
    #loading-status {
      display: none;
      position: absolute;
      bottom: 12px; right: 12px;
      padding: 5px 12px;
      background: var(--vscode-editor-background, #1e1e1e);
      border: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.12));
      border-radius: 4px;
      font-size: 11px;
      color: var(--vscode-editor-foreground, #ccc);
      z-index: 25;
      align-items: center;
      gap: 8px;
    }
    .spinner {
      width: 24px; height: 24px;
      border: 2px solid #555; border-top-color: #ddd;
      border-radius: 50%; animation: spin 0.8s linear infinite;
    }
    .spinner-small {
      width: 14px; height: 14px;
      border: 2px solid #555; border-top-color: #ddd;
      border-radius: 50%; animation: spin 0.8s linear infinite;
      display: inline-block;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Zoom controls */
    #zoom-controls {
      position: absolute; bottom: 12px; left: 12px;
      display: flex; gap: 4px; z-index: 15;
    }
    #zoom-controls button {
      width: 28px; height: 28px;
      background: rgba(30,30,30,0.9); color: #ccc;
      border: 1px solid rgba(255,255,255,0.1); border-radius: 3px;
      cursor: pointer; font-size: 14px;
      display: flex; align-items: center; justify-content: center;
    }
    #zoom-controls button:hover { background: rgba(60,60,60,0.9); color: #fff; }
  </style>
</head>
<body>
  <div id="stats-bar">
    <span class="brain-title">${escapeHtml(this.brainName)}</span>
    <span class="stat-chip"><strong id="stat-neurons">-</strong>&nbsp;neurons</span>
    <span class="stat-chip"><strong id="stat-types">-</strong>&nbsp;types</span>
    <span class="stat-chip"><strong id="stat-synapses">-</strong>&nbsp;synapses</span>
  </div>

  <div id="graph-container"></div>

  <div id="legend-panel">
    <button id="legend-toggle">
      <svg id="legend-chevron" width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
        <path d="M6 3l5 5-5 5V3z"/>
      </svg>
      Neuron Types
    </button>
    <div id="legend-body"></div>
  </div>

  <div id="zoom-controls">
    <button id="btn-fit" title="Fit to view">Fit</button>
    <button id="btn-zoom-in" title="Zoom in">+</button>
    <button id="btn-zoom-out" title="Zoom out">&minus;</button>
  </div>

  <div id="node-popup-overlay">
    <div id="node-popup">
      <div id="node-popup-header">
        <h3 id="node-popup-title"></h3>
        <button id="node-popup-close">&times;</button>
      </div>
      <div id="node-popup-meta"></div>
      <div id="node-popup-body"></div>
      <div id="node-popup-footer"></div>
    </div>
  </div>

  <div id="loading-overlay">
    <div class="spinner"></div>
    <span>Loading brain data...</span>
  </div>

  <div id="loading-status">
    <div class="spinner-small"></div>
    <span id="loading-status-text">Loading...</span>
  </div>

  <script nonce="${nonce}" src="${forceGraphUri}"></script>
  <script nonce="${nonce}">
  (function() {
    const vscode = acquireVsCodeApi();
    const CAN_WRITE = ${canWriteJs};

    // --- Theme detection ---
    function isDarkTheme() {
      // VS Code sets body data attribute, or we can check computed background
      const bg = getComputedStyle(document.body).backgroundColor;
      if (bg) {
        const m = bg.match(/\\d+/g);
        if (m && m.length >= 3) {
          const lum = (parseInt(m[0]) * 299 + parseInt(m[1]) * 587 + parseInt(m[2]) * 114) / 1000;
          return lum < 128;
        }
      }
      return true; // default to dark
    }
    const dark = isDarkTheme();

    // Theme-aware colors
    const theme = {
      bg:              dark ? '#1e1e1e' : '#ffffff',
      linkDefault:     dark ? 'rgba(160,170,180,0.45)' : 'rgba(80,90,100,0.35)',
      linkHighlight:   dark ? 'rgba(144,202,249,0.7)' : 'rgba(30,120,220,0.6)',
      linkDimmed:      dark ? 'rgba(100,100,100,0.08)' : 'rgba(160,160,160,0.1)',
      nodeDimmed:      dark ? 'rgba(140,140,140,0.35)' : 'rgba(160,160,160,0.4)',
      nodeHighlight:   dark ? '#ffffff' : '#111111',
      neighborHighlight: dark ? '#90CAF9' : '#1976D2',
      labelDefault:    dark ? 'rgba(220,220,220,0.85)' : 'rgba(30,30,30,0.85)',
      labelHighlight:  dark ? '#ffffff' : '#000000',
    };

    // --- Color palette ---
    const palette = [
      '#4FC3F7', '#AED581', '#FFB74D', '#CE93D8', '#F06292',
      '#4DD0E1', '#FFD54F', '#81C784', '#BA68C8', '#FF8A65',
      '#90CAF9', '#A5D6A7', '#FFCC80', '#B39DDB', '#EF9A9A',
      '#80DEEA', '#FFF176', '#C5E1A5', '#9FA8DA', '#FFAB91',
    ];
    const typeColorMap = {};
    let colorIdx = 0;
    function getTypeColor(typeId) {
      if (!typeColorMap[typeId]) {
        typeColorMap[typeId] = palette[colorIdx % palette.length];
        colorIdx++;
      }
      return typeColorMap[typeId];
    }

    // --- State ---
    let graphData = null;
    let graphInstance = null;
    let highlightedNode = null;
    let highlightedNeighbors = new Set();
    const adjacencyMap = new Map();
    let currentPopupNode = null;
    let pendingSave = null; // { neuronId, name, content, neuronTypeId }

    // Progressive loading state
    let allNeurons = [];
    let allSynapses = [];
    let allNeuronTypes = [];
    let typeMap = {};
    let loadingText = document.querySelector('#loading-overlay span');

    // --- Elements ---
    const container = document.getElementById('graph-container');
    const loadingOverlay = document.getElementById('loading-overlay');
    const legendBody = document.getElementById('legend-body');
    const legendToggle = document.getElementById('legend-toggle');
    const legendChevron = document.getElementById('legend-chevron');
    const popupOverlay = document.getElementById('node-popup-overlay');
    const popupTitle = document.getElementById('node-popup-title');
    const popupMeta = document.getElementById('node-popup-meta');
    const popupBody = document.getElementById('node-popup-body');
    const popupFooter = document.getElementById('node-popup-footer');
    const popupClose = document.getElementById('node-popup-close');
    const loadingStatus = document.getElementById('loading-status');
    const loadingStatusText = document.getElementById('loading-status-text');

    // --- Legend toggle ---
    let legendOpen = true;
    legendToggle.addEventListener('click', () => {
      legendOpen = !legendOpen;
      legendBody.classList.toggle('collapsed', !legendOpen);
      legendChevron.style.transform = legendOpen ? 'rotate(90deg)' : 'rotate(0deg)';
    });
    legendChevron.style.transform = 'rotate(90deg)';

    // --- Popup close ---
    function closePopup() {
      popupOverlay.classList.remove('visible');
      currentPopupNode = null;
      pendingSave = null;
    }
    popupClose.addEventListener('click', closePopup);
    popupOverlay.addEventListener('click', (e) => {
      if (e.target === popupOverlay) closePopup();
    });

    // --- Zoom controls ---
    document.getElementById('btn-fit').addEventListener('click', () => {
      if (graphInstance) graphInstance.zoomToFit(400, 40);
    });
    document.getElementById('btn-zoom-in').addEventListener('click', () => {
      if (graphInstance) graphInstance.zoom(graphInstance.zoom() * 1.4, 300);
    });
    document.getElementById('btn-zoom-out').addEventListener('click', () => {
      if (graphInstance) graphInstance.zoom(graphInstance.zoom() / 1.4, 300);
    });

    // --- Escape HTML ---
    function escHtml(s) {
      const d = document.createElement('div');
      d.textContent = s || '';
      return d.innerHTML;
    }

    // --- Show popup ---
    function showNodePopup(node) {
      currentPopupNode = node;
      popupTitle.textContent = node.label;
      popupMeta.innerHTML = 'Type: <span class="type-badge">' + escHtml(node.typeName) + '</span>' +
        ' &nbsp;|&nbsp; Connections: ' + node.connectionCount;

      if (CAN_WRITE) {
        showEditablePopup(node);
      } else {
        showReadOnlyPopup(node);
      }
      popupOverlay.classList.add('visible');
    }

    function showReadOnlyPopup(node) {
      popupBody.innerHTML = '<div class="popup-content-readonly">' +
        escHtml(node.content || '(No content)') + '</div>';
      popupFooter.innerHTML = '<button class="popup-btn popup-btn-secondary" id="popup-btn-close">Close</button>';
      document.getElementById('popup-btn-close').addEventListener('click', closePopup);
    }

    function showEditablePopup(node) {
      popupBody.innerHTML =
        '<div class="popup-field">' +
          '<label>Name</label>' +
          '<input type="text" id="edit-name" value="' + escHtml(node.label) + '" />' +
        '</div>' +
        '<div class="popup-field">' +
          '<label>Content</label>' +
          '<textarea id="edit-content">' + escHtml(node.content || '') + '</textarea>' +
        '</div>';

      popupFooter.innerHTML =
        '<button class="popup-btn popup-btn-secondary" id="popup-btn-cancel">Cancel</button>' +
        '<button class="popup-btn popup-btn-primary" id="popup-btn-save">Save</button>';

      document.getElementById('popup-btn-cancel').addEventListener('click', closePopup);
      document.getElementById('popup-btn-save').addEventListener('click', () => {
        const nameInput = document.getElementById('edit-name');
        const contentInput = document.getElementById('edit-content');
        const name = nameInput.value.trim();
        const content = contentInput.value;

        if (!name) {
          nameInput.style.borderColor = '#f48771';
          nameInput.focus();
          return;
        }

        pendingSave = {
          neuronId: node.id,
          name: name,
          content: content,
          neuronTypeId: node.neuronTypeId,
        };

        vscode.postMessage({
          type: 'saveNeuron',
          neuronId: node.id,
          name: name,
          content: content,
          neuronTypeId: node.neuronTypeId,
        });
      });
    }

    function showSavingState() {
      const saveBtn = document.getElementById('popup-btn-save');
      const cancelBtn = document.getElementById('popup-btn-cancel');
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span class="spinner-small"></span> Saving...';
      }
      if (cancelBtn) cancelBtn.disabled = true;
      // Remove any existing error
      const existing = popupBody.querySelector('.popup-error');
      if (existing) existing.remove();
    }

    function showSaveError(message) {
      const saveBtn = document.getElementById('popup-btn-save');
      const cancelBtn = document.getElementById('popup-btn-cancel');
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save';
      }
      if (cancelBtn) cancelBtn.disabled = false;

      // Remove any existing error
      const existing = popupBody.querySelector('.popup-error');
      if (existing) existing.remove();

      const errDiv = document.createElement('div');
      errDiv.className = 'popup-error';
      errDiv.innerHTML =
        '<span class="popup-error-msg">' + escHtml(message) + '</span>' +
        '<span class="popup-error-actions">' +
          '<button class="popup-btn popup-btn-primary" id="popup-btn-retry">Retry</button>' +
          '<button class="popup-btn popup-btn-secondary" id="popup-btn-dismiss">Dismiss</button>' +
        '</span>';
      popupBody.appendChild(errDiv);

      document.getElementById('popup-btn-retry').addEventListener('click', () => {
        if (pendingSave) {
          vscode.postMessage({
            type: 'saveNeuron',
            neuronId: pendingSave.neuronId,
            name: pendingSave.name,
            content: pendingSave.content,
            neuronTypeId: pendingSave.neuronTypeId,
          });
        }
      });
      document.getElementById('popup-btn-dismiss').addEventListener('click', () => {
        errDiv.remove();
      });
    }

    // --- Shared graph factory ---
    function createGraph(el, nodes, links) {
      const g = ForceGraph()(el)
        .nodeId('id')
        .nodeVal(node => Math.max(3, Math.sqrt(node.connectionCount + 1) * 4))
        .nodeColor(node => {
          if (highlightedNode) {
            if (node === highlightedNode) return theme.nodeHighlight;
            if (highlightedNeighbors.has(node.id)) return theme.neighborHighlight;
            return theme.nodeDimmed;
          }
          return getTypeColor(node.neuronTypeId);
        })
        .nodeCanvasObjectMode(() => 'after')
        .nodeCanvasObject((node, ctx, globalScale) => {
          const fontSize = Math.max(10, 13 / globalScale);
          let show = false;
          if (node === highlightedNode || highlightedNeighbors.has(node.id)) show = true;
          else if (globalScale > 1.5) show = true;
          else if (node.connectionCount >= 5 && globalScale > 0.8) show = true;
          if (!show) return;
          if (fontSize / globalScale < 2) return;
          ctx.font = fontSize + 'px Sans-Serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const r = Math.max(3, Math.sqrt(node.connectionCount + 1) * 4);
          ctx.fillStyle = node === highlightedNode ? theme.labelHighlight : theme.labelDefault;
          ctx.fillText(node.label, node.x, node.y + r + fontSize * 0.8);
        })
        .linkColor(link => {
          if (highlightedNode) {
            const s = typeof link.source === 'object' ? link.source.id : link.source;
            const t = typeof link.target === 'object' ? link.target.id : link.target;
            if (s === highlightedNode.id || t === highlightedNode.id) return theme.linkHighlight;
            return theme.linkDimmed;
          }
          return theme.linkDefault;
        })
        .linkWidth(1.5)
        .linkDirectionalArrowLength(4)
        .linkDirectionalArrowRelPos(1)
        .backgroundColor(theme.bg)
        .onNodeHover(node => {
          highlightedNode = node || null;
          highlightedNeighbors = new Set();
          if (node) {
            const n = adjacencyMap.get(node.id);
            if (n) highlightedNeighbors = n;
          }
          el.style.cursor = node ? 'pointer' : 'default';
        })
        .onNodeClick(node => { showNodePopup(node); })
        .graphData({ nodes, links });

      g.d3Force('charge')?.strength(-200);
      g.d3Force('link')?.distance(80);
      return g;
    }

    // --- Build adjacency map ---
    function buildAdjacency(synapses) {
      adjacencyMap.clear();
      for (const s of synapses) {
        if (!adjacencyMap.has(s.sourceNeuronId)) adjacencyMap.set(s.sourceNeuronId, new Set());
        if (!adjacencyMap.has(s.targetNeuronId)) adjacencyMap.set(s.targetNeuronId, new Set());
        adjacencyMap.get(s.sourceNeuronId).add(s.targetNeuronId);
        adjacencyMap.get(s.targetNeuronId).add(s.sourceNeuronId);
      }
    }

    // --- Render graph ---
    function renderGraph(data) {
      graphData = data;
      const { neurons, neuronTypes, synapses, counts } = data;

      document.getElementById('stat-neurons').textContent = counts.neurons;
      document.getElementById('stat-types').textContent = counts.neuronTypes;
      document.getElementById('stat-synapses').textContent = counts.synapses;

      const typeMap = {};
      for (const t of neuronTypes) {
        typeMap[t.id] = t;
        getTypeColor(t.id);
      }

      legendBody.innerHTML = neuronTypes.map(t =>
        '<div class="legend-item">' +
          '<span class="legend-swatch" style="background:' + getTypeColor(t.id) + '"></span>' +
          '<span>' + escHtml(t.name) + '</span>' +
        '</div>'
      ).join('');

      buildAdjacency(synapses);

      const nodes = neurons.map(n => ({
        id: n.id,
        label: n.name,
        content: n.content || '',
        neuronTypeId: n.neuronTypeId,
        typeName: typeMap[n.neuronTypeId]?.name || 'Unknown',
        connectionCount: (adjacencyMap.get(n.id)?.size || 0),
      }));

      const nodeIds = new Set(neurons.map(n => n.id));
      const links = synapses
        .filter(s => nodeIds.has(s.sourceNeuronId) && nodeIds.has(s.targetNeuronId))
        .map(s => ({
          source: s.sourceNeuronId,
          target: s.targetNeuronId,
          description: s.linkDescription || '',
        }));

      if (graphInstance) { graphInstance._destructor?.(); }

      graphInstance = createGraph(container, nodes, links);

      setTimeout(() => {
        if (graphInstance) graphInstance.zoomToFit(400, 40);
      }, 1500);

      loadingOverlay.style.display = 'none';
    }

    // --- Progressive graph rendering ---
    function renderProgressiveGraph() {
      const nodeIds = new Set(allNeurons.map(n => n.id));
      buildAdjacency(allSynapses);

      const nodes = allNeurons.map(n => ({
        id: n.id,
        label: n.name,
        content: n.content || '',
        neuronTypeId: n.neuronTypeId,
        typeName: typeMap[n.neuronTypeId]?.name || 'Unknown',
        connectionCount: (adjacencyMap.get(n.id)?.size || 0),
      }));

      const links = allSynapses
        .filter(s => nodeIds.has(s.sourceNeuronId) && nodeIds.has(s.targetNeuronId))
        .map(s => ({
          source: s.sourceNeuronId,
          target: s.targetNeuronId,
          description: s.linkDescription || '',
        }));

      if (!graphInstance && nodes.length > 0) {
        // First render — create the graph
        graphInstance = createGraph(container, nodes, links);
      } else if (graphInstance) {
        // Update existing graph with new data
        graphInstance.graphData({ nodes, links });
      }
    }

    // --- Messages from extension ---
    window.addEventListener('message', (event) => {
      const msg = event.data;
      switch (msg.type) {
        case 'graphData':
          renderGraph(msg.data);
          break;
        case 'graphCounts':
          document.getElementById('stat-neurons').textContent = msg.counts.neurons;
          document.getElementById('stat-types').textContent = msg.counts.neuronTypes;
          document.getElementById('stat-synapses').textContent = msg.counts.synapses;
          if (loadingText) loadingText.textContent = 'Loading neuron types...';
          break;
        case 'graphNeuronTypes':
          allNeuronTypes = msg.neuronTypes;
          typeMap = {};
          for (const t of allNeuronTypes) {
            typeMap[t.id] = t;
            getTypeColor(t.id);
          }
          legendBody.innerHTML = allNeuronTypes.map(t =>
            '<div class="legend-item">' +
              '<span class="legend-swatch" style="background:' + getTypeColor(t.id) + '"></span>' +
              '<span>' + escHtml(t.name) + '</span>' +
            '</div>'
          ).join('');
          if (loadingText) loadingText.textContent = 'Loading neurons...';
          break;
        case 'graphNeuronsPage':
          allNeurons.push(...msg.neurons);
          // Switch from full overlay to compact status bar so graph is visible
          loadingOverlay.style.display = 'none';
          loadingStatus.style.display = 'flex';
          loadingStatusText.textContent = 'Loading neurons... (' + allNeurons.length + ')';
          renderProgressiveGraph();
          break;
        case 'graphSynapsesPage':
          allSynapses.push(...msg.synapses);
          loadingStatusText.textContent = 'Loading synapses... (' + allSynapses.length + ')';
          renderProgressiveGraph();
          break;
        case 'graphComplete':
          loadingOverlay.style.display = 'none';
          loadingStatus.style.display = 'none';
          renderProgressiveGraph();
          setTimeout(() => {
            if (graphInstance) graphInstance.zoomToFit(400, 40);
          }, 500);
          break;
        case 'loading':
          loadingOverlay.style.display = msg.loading ? 'flex' : 'none';
          if (msg.loading && loadingText) loadingText.textContent = 'Loading brain data...';
          break;
        case 'error':
          loadingOverlay.innerHTML = '<span style="color:#f48771">' + escHtml(msg.message) + '</span>';
          break;
        case 'savingNeuron':
          if (msg.saving) showSavingState();
          break;
        case 'neuronSaved': {
          // Update graph node in-place
          const gd = graphInstance?.graphData();
          if (gd) {
            const n = gd.nodes.find(n => n.id === msg.neuronId);
            if (n) {
              n.label = msg.name;
              n.content = msg.content;
              graphInstance.graphData(gd); // re-render
            }
          }
          closePopup();
          break;
        }
        case 'saveError':
          showSaveError(msg.message);
          break;
      }
    });

    vscode.postMessage({ type: 'ready' });
  })();
  </script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
