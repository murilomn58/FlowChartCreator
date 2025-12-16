(() => {
  'use strict';

  const STORAGE_KEY = 'flowchart-creator:v1';

  let state = loadState() || defaultState();
  let selectedNodeId = null;
  let selectedEdgeId = null;
  let draggingNode = null;
  let dragCandidate = null;
  let connecting = null;
  let reconnecting = null;
  const DRAG_THRESHOLD = 8;

  let view = {
    x: state.meta?.view?.x ?? 0,
    y: state.meta?.view?.y ?? 0,
    scale: clamp(state.meta?.view?.scale ?? 1, 0.5, 2)
  };

  const history = [];
  const redoStack = [];
  let lastHistoryTick = 0;

  const board = document.getElementById('board');
  const svg = document.getElementById('svg');
  const canvasWrap = document.getElementById('canvasWrap');
  const toast = document.getElementById('toast');

  const editor = document.getElementById('editor');
  const noneSelected = document.getElementById('noneSelected');
  const nodeName = document.getElementById('nodeName');
  const nodeDesc = document.getElementById('nodeDesc');
  const nodeInPorts = document.getElementById('nodeInPorts');
  const nodeOutPorts = document.getElementById('nodeOutPorts');
  const nodeColor = document.getElementById('nodeColor');
  const nodeOwner = document.getElementById('nodeOwner');
  const nodeDue = document.getElementById('nodeDue');
  const nodeEta = document.getElementById('nodeEta');
  const nodeStatus = document.getElementById('nodeStatus');
  const ownerToggle = document.getElementById('ownerToggle');
  const ownerOtherWrap = document.getElementById('ownerOtherWrap');
  const dupBtn = document.getElementById('dupBtn');
  const delBtn = document.getElementById('delBtn');

  const addNodeBtn = document.getElementById('addNodeBtn');
  const autoLayoutBtn = document.getElementById('autoLayoutBtn');
  const fitBtn = document.getElementById('fitBtn');
  const exportBtn = document.getElementById('exportBtn');
  const exportBtn2 = document.getElementById('exportBtn2');
  const exportPngBtn = document.getElementById('exportPngBtn');
  const exportSvgBtn = document.getElementById('exportSvgBtn');
  const clearBtn = document.getElementById('clearBtn');
  const importBtn = document.getElementById('importBtn');
  const fileInput = document.getElementById('fileInput');
  const edgeDeleteBtn = document.getElementById('edgeDeleteBtn');
  const openPanelBtn = document.getElementById('openPanelBtn');
  const drawerBackdrop = document.getElementById('drawerBackdrop');
  const chipMenu = document.getElementById('chipMenu');
  const addStatusBtn = document.getElementById('addStatusBtn');
  const statusInput = document.getElementById('statusInput');
  const statusList = document.getElementById('statusList');
  const addMemberBtn = document.getElementById('addMemberBtn');
  const memberInput = document.getElementById('memberInput');
  const memberList = document.getElementById('memberList');
  const templateButtons = document.querySelectorAll('button[data-template]');
  const modeSelect = document.getElementById('modeSelect');
  const edgeEditor = document.getElementById('edgeEditor');
  const edgeLabelInput = document.getElementById('edgeLabelInput');
  const edgeOrthoInput = document.getElementById('edgeOrthoInput');
  const edgeExportBtn = document.getElementById('edgeExportBtn');
  const edgeClearBtn = document.getElementById('edgeClearBtn');
  const startHandle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  const endHandle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  startHandle.classList.add('edgeHandle');
  endHandle.classList.add('edgeHandle');
  startHandle.setAttribute('r', '10');
  endHandle.setAttribute('r', '10');
  svg.appendChild(startHandle);
  svg.appendChild(endHandle);

  init();

  function init(){
    pushHistory();
    renderAll();
    attachHandlers();
    scheduleSave();
    setTimeout(() => fitView(), 100);
  }

  function defaultState(){
    const nodes = [
      createNode('Ideação', 'Definir problema e objetivos.', 'Discovery', 100, 120),
      createNode('Pesquisa', 'Coletar insights de usuários.', 'Discovery', 400, 120),
      createNode('Wireframes', 'Criar protótipos visuais.', 'Design', 700, 120),
      createNode('Desenvolvimento', 'Implementar funcionalidades.', 'Dev', 1000, 120),
      createNode('Testes', 'QA e validação.', 'QA', 1300, 120),
      createNode('Lançamento', 'Deploy e monitoramento.', 'Release', 1600, 120),
    ];

    const edges = [];
    for(let i = 0; i < nodes.length - 1; i++){
      edges.push(createEdge(nodes[i].id, nodes[i+1].id, 0, 0));
    }

    return {
      nodes,
      edges,
      meta: {
        createdAt: new Date().toISOString(),
        view: {x:0, y:0, scale:1},
        statuses: ['backlog','doing','testing','bugfix','done'],
        members: ['Murilo','Jean'],
        mode: 'select'
      }
    };
  }

  function createNode(name, desc, label, x, y){
    return {
      id: uid('n'),
      name: name || 'Node',
      desc: desc || '',
      label: label || 'Etapa',
      x, y,
      w: 260,
      h: 130,
      inPorts: 1,
      outPorts: 1,
      color: '#B6F23A',
      owner: '',
      due: '',
      etaDays: 0,
      status: 'backlog'
    };
  }

  function createEdge(from, to, fromPort = 0, toPort = 0, label = ''){
    return { id: uid('e'), from, to, fromPort, toPort, label };
  }

  function loadState(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return null;
      const s = JSON.parse(raw);
      if(!s || !Array.isArray(s.nodes) || !Array.isArray(s.edges)) return null;
      s.meta = s.meta || {};
      s.meta.statuses = Array.isArray(s.meta.statuses) ? s.meta.statuses : ['backlog','doing','testing','bugfix','done'];
      s.meta.members = Array.isArray(s.meta.members) ? s.meta.members : ['Murilo','Jean'];
      s.meta.mode = s.meta.mode || 'select';
      return s;
    }catch{ return null; }
  }

  function saveState(){
    try{
      state.meta = state.meta || {};
      state.meta.view = {...view};
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }catch(e){ console.error('Save failed:', e); }
  }

  let saveQueued = false;
  function scheduleSave(){
    if(saveQueued) return;
    saveQueued = true;
    requestAnimationFrame(() => {
      saveQueued = false;
      saveState();
    });
  }

  function snapshot(){
    return {
      state: JSON.parse(JSON.stringify(state)),
      view: {...view}
    };
  }

  function pushHistory(){
    history.push(snapshot());
    if(history.length > 50) history.shift();
    redoStack.length = 0;
    lastHistoryTick = Date.now();
  }

  function markHistory(thresholdMs = 400){
    const now = Date.now();
    if(now - lastHistoryTick >= thresholdMs) pushHistory();
  }

  function undo(){
    if(!history.length){ showToast('Nada para desfazer'); return; }
    redoStack.push(snapshot());
    const prev = history.pop();
    state = prev.state;
    view = prev.view;
    clearSelection();
    renderAll();
    applyView();
    scheduleSave();
    showToast('Desfeito');
  }

  function redo(){
    if(!redoStack.length){ showToast('Nada para refazer'); return; }
    history.push(snapshot());
    const next = redoStack.pop();
    state = next.state;
    view = next.view;
    clearSelection();
    renderAll();
    applyView();
    scheduleSave();
    showToast('Refeito');
  }

  function renderAll(){
    board.innerHTML = '';
    svg.innerHTML = '';
    applyView();
    for(const n of state.nodes) board.appendChild(renderNode(n));
    updateNodeMetricsFromDOM();
    renderEdges();
    updateEdgeSelectionDOM();
    refreshSelectionUI();
  }

  function renderNode(n){
    const el = document.createElement('div');
    el.className = 'node';
    el.dataset.nodeId = n.id;
    el.dataset.status = (n.status || 'backlog');
    el.style.transform = `translate(${n.x}px, ${n.y}px)`;
    el.style.width = (n.w || 260) + 'px';

    const chipStyle = chipStyleFromColor(n.color || '#B6F23A');

    el.innerHTML = `
      <div class="nodeHeader">
        <span class="statusPill ${statusPillClass(n)}" title="Status">${esc(statusLabelFrom(n.status))}</span>
        <div class="nodeActions">
          <button class="iconBtn" data-action="dup">⎘</button>
          <button class="iconBtn delete" data-action="del">🗑</button>
        </div>
      </div>
      <button class="quickAdd" data-action="quickAdd" title="Conectar etapa (clique e depois selecione o destino) — Shift: criar próxima etapa">＋</button>
      <div class="nodeTitle" contenteditable="true" spellcheck="false">${esc(n.name || 'Node')}</div>
      <div class="nodeDesc" contenteditable="true" spellcheck="false">${esc(n.desc || '')}</div>
      ${renderMeta(n)}
      ${renderPorts(n)}
    `;

    el.addEventListener('pointerdown', (ev) => {
      const target = ev.target;
      const isPort = target?.classList?.contains('port');
      const icon = target?.closest?.('.iconBtn');
      const quick = target?.closest?.('.quickAdd');
      const isEditing = target?.classList?.contains('nodeTitle') || target?.classList?.contains('nodeDesc');
      const isMetaChip = target?.closest?.('.metaChip[data-editable="true"]');

      if(icon){
        const action = icon.getAttribute('data-action');
        if(action === 'del') removeNode(n.id);
        if(action === 'dup') duplicateNode(n.id);
        ev.stopPropagation();
        return;
      }

      if(quick){
        ev.stopPropagation();
        if(ev.shiftKey) return createNextStep(n.id);
        return startConnection(ev, n.id, 0, 'click');
      }

      if(isPort){
        ev.stopPropagation();
        // Conexão apenas via botão "+"
        return;
      }

      if(isMetaChip){
        selectNode(n.id);
        ev.stopPropagation();
        return;
      }

      selectNode(n.id);
      if(!isEditing) startNodeDrag(ev, n.id);
    });

    const titleEl = el.querySelector('.nodeTitle');
    const descEl = el.querySelector('.nodeDesc');

    titleEl.addEventListener('input', () => {
      const node = getNode(n.id);
      if(!node) return;
      markHistory(500);
      node.name = sanitize(titleEl.textContent);
      scheduleSave();
      if(selectedNodeId === n.id) nodeName.value = node.name;
    });

    descEl.addEventListener('input', () => {
      const node = getNode(n.id);
      if(!node) return;
      markHistory(500);
      node.desc = sanitize(descEl.textContent);
      scheduleSave();
      if(selectedNodeId === n.id) nodeDesc.value = node.desc;
    });

    el.addEventListener('dragstart', (e) => e.preventDefault());
    return el;
  }



  function renderMeta(n){
    const status = (n.status || 'backlog');
    const statusLabel = statusLabelFrom(status);

  const due = (n.due || '').trim();
  const dueLabel = due ? fmtDateBR(due) : 'Sem prazo';
  const isOverdue = due && !isDone(status) && (new Date(due + 'T23:59:59').getTime() < Date.now());

  const owner = sanitize(n.owner || '') || 'Sem responsável';
  const eta = Number(n.etaDays || 0) > 0 ? `${Number(n.etaDays)}d` : '';
  const etaHTML = eta ? `<span class="metaChip" data-meta="eta">⏳ <b>${esc(eta)}</b></span>` : '';

  return `
    <div class="nodeMeta">
      <span class="metaChip status ${status}" data-meta="status" data-editable="true">${esc(statusLabel)}</span>
      <span class="metaChip ${isOverdue ? 'overdue' : ''}" data-meta="due" data-editable="true">📅 <b>${esc(dueLabel)}</b></span>
      <span class="metaChip" data-meta="owner" data-editable="true">👤 <b>${esc(owner)}</b></span>
      ${etaHTML}
    </div>
  `;
}

  function renderPorts(n){
    const inCount = clampInt(n.inPorts ?? 2, 1, 6);
    const outCount = clampInt(n.outPorts ?? 2, 1, 6);

    const inHTML = Array.from({length: inCount}, (_,i) =>
      `<div class="port in" data-port="in" data-idx="${i}" title="Entrada ${i+1}"></div>`
    ).join('');

    const outHTML = Array.from({length: outCount}, (_,i) =>
      `<div class="port out" data-port="out" data-idx="${i}" title="Saída ${i+1}"></div>`
    ).join('');

    return `
      <div class="ports">
        <div class="portGroup">${inHTML}</div>
        <div class="portGroup">${outHTML}</div>
      </div>
    `;
  }

  function updateSvgViewBox(){
    // IMPORTANTE:
    // Como pan/zoom é feito via CSS transform (applyView) tanto no #board quanto no #svg,
    // o viewBox NÃO deve “crescer” com o conteúdo. Isso encolhe tudo e deixa as setas minúsculas.
    // Mantemos o viewBox alinhado ao tamanho do viewport.
    svg.setAttribute('viewBox', `0 0 ${canvasWrap.clientWidth} ${canvasWrap.clientHeight}`);
  }

  function renderEdges(){
    updateSvgViewBox();

    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `
      <linearGradient id="edgeGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="rgba(182,242,58,.98)"/>
        <stop offset="50%" stop-color="rgba(111,191,74,.96)"/>
        <stop offset="100%" stop-color="rgba(159,232,112,.98)"/>
      </linearGradient>
      <marker id="arrow" markerUnits="userSpaceOnUse" markerWidth="14" markerHeight="14" refX="11" refY="7" orient="auto">
        <path d="M0,0 L14,7 L0,14 Z" fill="rgba(242,245,243,.92)" />
      </marker>
      <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="2.5" result="blur"/>
        <feColorMatrix in="blur" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 .4 0" result="glow"/>
        <feMerge>
          <feMergeNode in="glow"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    `;
    svg.appendChild(defs);

    for(const e of state.edges){
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.classList.add('edgePath');
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'url(#edgeGrad)');
      path.setAttribute('stroke-width', '2.4');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('marker-end', 'url(#arrow)');
      path.setAttribute('filter', 'url(#glow)');
      path.dataset.edgeId = e.id;
      path.style.pointerEvents = 'stroke';
      path.style.cursor = 'pointer';
      path.addEventListener('pointerdown', (ev) => {
        ev.stopPropagation();
        selectEdge(e.id);
      });
      svg.appendChild(path);
      updateEdgePath(e.id);

      // rótulo opcional
      if(e.label){
        const textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        textEl.setAttribute('class', 'edgeLabel');
        textEl.setAttribute('fill', 'var(--text)');
        textEl.setAttribute('font-size', '12');
        textEl.dataset.edgeId = e.id;
        svg.appendChild(textEl);
        positionEdgeLabel(e.id);
      }
    }

    if(connecting){
      const temp = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      temp.setAttribute('id', connecting.tempId);
      temp.setAttribute('fill', 'none');
      temp.setAttribute('stroke', 'rgba(182,242,58,.98)');
      temp.setAttribute('stroke-width', '2.8');
      temp.setAttribute('stroke-linecap', 'round');
      temp.setAttribute('stroke-dasharray', '6 8');
      temp.setAttribute('filter', 'url(#glow)');
      svg.appendChild(temp);
    }
  }

  function updateEdgePath(edgeId){
    const e = state.edges.find(x => x.id === edgeId);
    const path = svg.querySelector(`path[data-edge-id="${CSS.escape(edgeId)}"]`);
    if(!e || !path) return;

    const a = getNode(e.from);
    const b = getNode(e.to);
    if(!a || !b) return;

    const A = getPortPos(a, 'out', e.fromPort ?? 0);
    const B = getPortPos(b, 'in', e.toPort ?? 0);

    // Curvas Bezier suaves e adaptativas
    const distX = Math.abs(B.x - A.x);
    const distY = Math.abs(B.y - A.y);
    const totalDist = Math.sqrt(distX * distX + distY * distY);
    const baseControl = Math.max(60, totalDist * 0.35);
    const verticalBoost = distY > 100 ? Math.min(distY * 0.25, 80) : 0;
    const dx = baseControl + verticalBoost;

    const c1 = {x: A.x + dx, y: A.y};
    const c2 = {x: B.x - dx, y: B.y};

    if(e.ortho){
      const midX = (A.x + B.x) / 2;
      path.setAttribute('d', `M ${A.x} ${A.y} L ${midX} ${A.y} L ${midX} ${B.y} L ${B.x} ${B.y}`);
    }else{
      path.setAttribute('d', `M ${A.x} ${A.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${B.x} ${B.y}`);
    }

    if(selectedEdgeId === edgeId){
      path.setAttribute('stroke', 'rgba(159,232,112,.98)');
      path.setAttribute('stroke-width', '3.4');
    }else{
      path.setAttribute('stroke', 'url(#edgeGrad)');
      path.setAttribute('stroke-width', '2.4');
    }

    positionEdgeLabel(edgeId);
  }

  function updateTempPath(clientX, clientY){
    if(connecting){
      const temp = svg.querySelector(`#${CSS.escape(connecting.tempId)}`);
      if(!temp) return;

      const p = clientToCanvas(clientX, clientY);
      const A = {x: connecting.fromX, y: connecting.fromY};
      const B = p;

      const distX = Math.abs(B.x - A.x);
      const distY = Math.abs(B.y - A.y);
      const totalDist = Math.sqrt(distX * distX + distY * distY);
      const baseControl = Math.max(60, totalDist * 0.35);
      const verticalBoost = distY > 100 ? Math.min(distY * 0.25, 80) : 0;
      const dx = baseControl + verticalBoost;

      const c1 = {x: A.x + dx, y: A.y};
      const c2 = {x: B.x - dx, y: B.y};

      temp.setAttribute('d', `M ${A.x} ${A.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${B.x} ${B.y}`);
    } else if(reconnecting){
      const temp = svg.querySelector('#reconnect_temp') || (() => {
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('id', 'reconnect_temp');
        p.setAttribute('fill', 'none');
        p.setAttribute('stroke', 'rgba(182,242,58,.9)');
        p.setAttribute('stroke-width', '2.4');
        p.setAttribute('stroke-dasharray', '6 6');
        svg.appendChild(p);
        return p;
      })();
      const fixed = reconnecting.fixedPoint;
      const p = clientToCanvas(clientX, clientY);
      const useOrtho = reconnecting.edge?.ortho;
      if(useOrtho){
        const midX = (fixed.x + p.x) / 2;
        temp.setAttribute('d', `M ${fixed.x} ${fixed.y} L ${midX} ${fixed.y} L ${midX} ${p.y} L ${p.x} ${p.y}`);
      }else{
        temp.setAttribute('d', `M ${fixed.x} ${fixed.y} L ${p.x} ${p.y}`);
      }
    }
  }

  function positionEdgeLabel(edgeId){
    const e = state.edges.find(x => x.id === edgeId);
    if(!e || !e.label) return;
    const textEl = svg.querySelector(`text.edgeLabel[data-edge-id="${CSS.escape(edgeId)}"]`);
    if(!textEl) return;
    const a = getNode(e.from);
    const b = getNode(e.to);
    if(!a || !b) return;
    const A = getPortPos(a, 'out', e.fromPort ?? 0);
    const B = getPortPos(b, 'in', e.toPort ?? 0);
    const mid = { x:(A.x+B.x)/2, y:(A.y+B.y)/2 };
    textEl.setAttribute('x', mid.x);
    textEl.setAttribute('y', mid.y - 8);
    textEl.textContent = e.label;
  }

function getPortPos(n, portType, idx){
  // Preferência: usar o DOM (posição real) — corrige linhas fora do lugar quando o node muda de altura/largura
  const type = portType === 'in' ? 'in' : 'out';
  const count = type === 'in'
    ? clampInt(n.inPorts ?? 2, 1, 6)
    : clampInt(n.outPorts ?? 2, 1, 6);
  const i = clampInt(idx ?? 0, 0, Math.max(0, count - 1));

  const nodeEl = board.querySelector(`.node[data-node-id="${CSS.escape(n.id)}"]`);
  if(nodeEl){
    const portEl = nodeEl.querySelector(`.port[data-port="${type}"][data-idx="${i}"]`);
    if(portEl){
      const r = portEl.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      return clientToCanvas(cx, cy);
    }

    // fallback baseado no rect do node (ainda mais fiel que usar n.h/n.w)
    const nr = nodeEl.getBoundingClientRect();
    const padding = 12;
    const spacing = 22;
    const portRadius = 7;
    const localY = nr.bottom - padding - portRadius;

    const localX = (type === 'in')
      ? (nr.left + padding + portRadius + i * spacing)
      : (nr.right - padding - portRadius - i * spacing);

    return clientToCanvas(localX, localY);
  }

  // fallback matemático (quando ainda não existe DOM — ex.: 1º render)
  const x = n.x, y = n.y, w = n.w || 260, h = n.h || 130;
  const portY = y + h - 19;
  const spacing = 22;
  if(type === 'in') return {x: x + 19 + i * spacing, y: portY};
  return {x: x + w - 19 - i * spacing, y: portY};
}

  function applyView(){
    const t = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
    board.style.transformOrigin = '0 0';
    svg.style.transformOrigin = '0 0';
    board.style.transform = t;
    svg.style.transform = t;
    updateEdgeDeleteBtn();
    updateEdgeHandles();
  }

  function rerenderEdgesOnly(){
    for(const e of state.edges) updateEdgePath(e.id);
    updateEdgeDeleteBtn();
  }

  function setScaleAround(pointX, pointY, newScale){
    const oldScale = view.scale;
    const rect = canvasWrap.getBoundingClientRect();
    const cx = pointX - rect.left;
    const cy = pointY - rect.top;
    view.x = cx - (cx - view.x) * (newScale / oldScale);
    view.y = cy - (cy - view.y) * (newScale / oldScale);
    view.scale = clamp(newScale, 0.4, 2.5);
    applyView();
    rerenderEdgesOnly();
    scheduleSave();
  }

  function refreshSelectionUI(){
  // Highlight selected node
  for(const el of board.querySelectorAll('.node')){
    el.classList.toggle('selected', el.dataset.nodeId === selectedNodeId);
  }

  // Highlight selected edge
  rerenderEdgesOnly();

  // Sidebar editor
  if(selectedNodeId){
    const n = getNode(selectedNodeId);
    if(n){
      noneSelected.style.display = 'none';
      editor.style.display = 'block';
      nodeName.value = n.name || '';
      nodeDesc.value = n.desc || '';
      nodeInPorts.value = String(clampInt(n.inPorts ?? 1, 1, 6));
      nodeOutPorts.value = String(clampInt(n.outPorts ?? 1, 1, 6));
      nodeColor.value = n.color || '#B6F23A';
      updateOwnerUI(n.owner || '');
      nodeDue.value = n.due || '';
      nodeEta.value = String(n.etaDays ?? 0);
      nodeStatus.value = n.status || 'backlog';
      if(isMobile()) openPanel();
    }
  }else{
    noneSelected.style.display = 'block';
    editor.style.display = 'none';
    if(isMobile()) closePanel();
  }
  updateEdgeDeleteBtn();
  renderConfigLists();

  // Edge editor
  if(edgeEditor){
    if(selectedEdgeId){
      const e = state.edges.find(x => x.id === selectedEdgeId);
      if(e){
        edgeEditor.style.display = 'block';
        edgeLabelInput.value = e.label || '';
        edgeOrthoInput.checked = !!e.ortho;
      }else{
        edgeEditor.style.display = 'none';
      }
    }else{
      edgeEditor.style.display = 'none';
    }
  }
}

  function renderConfigLists(){
    if(statusList){
      statusList.innerHTML = '';
      for(const s of (state.meta?.statuses || [])){
        const span = document.createElement('span');
        span.className = 'metaChip';
        span.textContent = s;
        statusList.appendChild(span);
      }
    }
    if(memberList){
      memberList.innerHTML = '';
      for(const m of (state.meta?.members || [])){
        const span = document.createElement('span');
        span.className = 'metaChip';
        span.textContent = m;
        memberList.appendChild(span);
      }
    }
    if(modeSelect){
      modeSelect.value = state.meta?.mode || 'select';
    }
    updateStatusSelect();
  }

  function updateStatusSelect(){
    if(!nodeStatus) return;
    const statuses = state.meta?.statuses || ['backlog','doing','testing','bugfix','done'];
    const current = nodeStatus.value;
    nodeStatus.innerHTML = statuses.map(s => `<option value="${esc(s)}">${esc(statusLabelFrom(s))}</option>`).join('');
    nodeStatus.value = statuses.includes(current) ? current : statuses[0] || 'backlog';
  }

  function applyOwnerToState(ownerVal, nodeId = selectedNodeId){
    const n = getNode(nodeId);
    if(!n) return;
    markHistory(200);
    n.owner = ownerVal;
    syncNodeDOM(n.id);
    scheduleSave();
  }

  function updateOwnerUI(ownerVal){
    const normalized = sanitize(ownerVal || '');
    const buttons = ownerToggle?.querySelectorAll?.('.ownerOption') || [];
    const lower = normalized.toLowerCase();
    const isPreset = lower === 'murilo'.toLowerCase() || lower === 'jean'.toLowerCase();
    const isOutro = !isPreset;

    buttons.forEach(btn => {
      const val = btn.dataset.owner || '';
      btn.classList.toggle('active',
        (isPreset && val.toLowerCase() === lower) ||
        (!isPreset && val === 'Outro'));
    });

    if(ownerOtherWrap) ownerOtherWrap.style.display = isOutro ? 'block' : 'none';
    if(nodeOwner) nodeOwner.value = normalized;
  }

  function isMobile(){ return window.innerWidth <= 980; }

  function openPanel(){ document.body.classList.add('show-panel'); }
  function closePanel(){ document.body.classList.remove('show-panel'); }

  function hideChipMenu(){
    if(chipMenu){
      chipMenu.style.display = 'none';
      chipMenu.innerHTML = '';
    }
  }

  function positionMenu(anchorRect){
    if(!chipMenu) return;
    const margin = 8;
    let x = anchorRect.left;
    let y = anchorRect.bottom + margin;
    const maxX = window.innerWidth - chipMenu.offsetWidth - margin;
    if(x > maxX) x = maxX;
    chipMenu.style.left = `${Math.max(margin, x)}px`;
    chipMenu.style.top = `${y}px`;
  }

  function showStatusMenu(nodeId, anchorRect){
    const n = getNode(nodeId);
    if(!n || !chipMenu) return;
    const statuses = state.meta?.statuses || ['backlog','doing','testing','bugfix','done'];
    chipMenu.innerHTML = `
      <div class="menuSection">Status</div>
      ${statuses.map(s => {
        const label = statusLabelFrom(s);
        return `<button data-value="${s}">${esc(label)}</button>`;
      }).join('')}
    `;
    chipMenu.style.display = 'grid';
    positionMenu(anchorRect);

    chipMenu.querySelectorAll('button[data-value]').forEach(btn => {
      btn.addEventListener('click', () => {
        markHistory();
        n.status = btn.dataset.value;
        syncNodeDOM(n.id);
        refreshSelectionUI();
        scheduleSave();
        hideChipMenu();
      });
    });
  }

  function showOwnerMenu(nodeId, anchorRect){
    const n = getNode(nodeId);
    if(!n || !chipMenu) return;
    const current = sanitize(n.owner || '');
    const members = state.meta?.members || ['Murilo','Jean'];
    chipMenu.innerHTML = `
      <div class="menuSection">Responsável</div>
      ${members.map(o => `<button data-owner="${o}">${o}</button>`).join('')}
      <div class="menuSection">Outro</div>
      <input type="text" id="menuOwnerInput" placeholder="Digite o nome" value="${esc(current)}">
      <button data-owner="__apply">Aplicar</button>
      <button data-owner="__clear">Sem responsável</button>
    `;
    chipMenu.style.display = 'grid';
    positionMenu(anchorRect);

    chipMenu.querySelectorAll('button[data-owner]').forEach(btn => {
      btn.addEventListener('click', () => {
        const v = btn.dataset.owner;
        if(v === '__apply'){
          const input = chipMenu.querySelector('#menuOwnerInput');
          const val = sanitize(input?.value || '');
          applyOwnerToState(val, n.id);
          updateOwnerUI(val);
        }else if(v === '__clear'){
          applyOwnerToState('', n.id);
          updateOwnerUI('');
        }else{
          applyOwnerToState(v, n.id);
          updateOwnerUI(v);
        }
        hideChipMenu();
      });
    });
  }

  function showDueMenu(nodeId, anchorRect){
    const n = getNode(nodeId);
    if(!n || !chipMenu) return;
    const current = n.due || '';
    chipMenu.innerHTML = `
      <div class="menuSection">Prazo</div>
      <input type="date" id="menuDueInput" value="${esc(current)}">
      <button data-due="__apply">Aplicar</button>
      <button data-due="__clear">Sem prazo</button>
    `;
    chipMenu.style.display = 'grid';
    positionMenu(anchorRect);

    const input = chipMenu.querySelector('#menuDueInput');
    input?.addEventListener('change', () => {
      const val = input.value || '';
      applyDue(nodeId, val);
    });

    chipMenu.querySelectorAll('button[data-due]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.due;
        if(action === '__clear'){
          applyDue(nodeId, '');
        }else{
          const val = input?.value || '';
          applyDue(nodeId, val);
        }
        hideChipMenu();
      });
    });
  }

  function applyDue(nodeId, value){
    const n = getNode(nodeId);
    if(!n) return;
    markHistory(150);
    n.due = value || '';
    syncNodeDOM(n.id);
    scheduleSave();
  }

  function attachHandlers(){
    // Captura cliques para o modo "clique-para-conectar" (roda antes dos handlers dos nodes)
    canvasWrap.addEventListener('pointerdown', (ev) => {
      if(connecting && connecting.mode === 'click'){
        ev.preventDefault();
        ev.stopPropagation();
        handleConnectClick(ev);
      }
    }, true);

    canvasWrap.addEventListener('pointerdown', (ev) => {
      if(ev.target === canvasWrap || ev.target === board || ev.target === svg) clearSelection();
      hideChipMenu();
      dragCandidate = null;
    });

    window.addEventListener('resize', () => {
      updateSvgViewBox();
      rerenderEdgesOnly();
      if(!isMobile()) closePanel();
      hideChipMenu();
    });

    window.addEventListener('keydown', (ev) => {
      if(ev.key === 'Escape' && connecting){ cancelConnection(null); return; }
      if(ev.key === 'Delete' || ev.key === 'Backspace'){
        const tag = (document.activeElement?.tagName || '').toLowerCase();
        const isField = tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable;
        if(isField) return;
        if(selectedEdgeId) return removeEdge(selectedEdgeId);
        if(selectedNodeId) return removeNode(selectedNodeId);
      }

      if((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z'){
        ev.preventDefault();
        const tag = (document.activeElement?.tagName || '').toLowerCase();
        const isField = tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable;
        if(isField) return;
        if(ev.shiftKey) redo();
        else undo();
      }

      if((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === '0'){
        ev.preventDefault();
        fitView();
      }
    });

    let inputThrottle = null;
    const throttledInput = (fn, delay = 500) => {
      return () => {
        clearTimeout(inputThrottle);
        inputThrottle = setTimeout(() => { markHistory(100); fn(); }, delay);
        fn();
      };
    };

    nodeName.addEventListener('input', throttledInput(() => {
      const n = getNode(selectedNodeId);
      if(!n) return;
      n.name = nodeName.value;
      syncNodeDOM(n.id);
      scheduleSave();
    }));

    nodeDesc.addEventListener('input', throttledInput(() => {
      const n = getNode(selectedNodeId);
      if(!n) return;
      n.desc = nodeDesc.value;
      syncNodeDOM(n.id);
      scheduleSave();
    }));

    nodeInPorts.addEventListener('input', () => {
      const n = getNode(selectedNodeId);
      if(!n) return;
      markHistory();
      n.inPorts = clampInt(parseInt(nodeInPorts.value || '1', 10), 1, 6);
      renderAll();
      selectNode(n.id);
      scheduleSave();
    });

    nodeOutPorts.addEventListener('input', () => {
      const n = getNode(selectedNodeId);
      if(!n) return;
      markHistory();
      n.outPorts = clampInt(parseInt(nodeOutPorts.value || '1', 10), 1, 6);
      renderAll();
      selectNode(n.id);
      scheduleSave();
    });

    nodeColor.addEventListener('input', throttledInput(() => {
      const n = getNode(selectedNodeId);
      if(!n) return;
      n.color = nodeColor.value;
      syncNodeDOM(n.id);
      scheduleSave();
    }, 200));


nodeOwner.addEventListener('input', throttledInput(() => {
  const n = getNode(selectedNodeId);
  if(!n) return;
  const val = sanitize(nodeOwner.value);
  updateOwnerUI(val);
  applyOwnerToState(val);
}));

    ownerToggle?.addEventListener('click', (ev) => {
      const btn = ev.target.closest?.('.ownerOption');
      if(!btn) return;
      const choice = btn.dataset.owner || '';
      if(choice === 'Outro'){
        const val = sanitize(nodeOwner.value || '');
        updateOwnerUI(val);
        applyOwnerToState(val);
      }else{
        updateOwnerUI(choice);
        applyOwnerToState(choice);
      }
    });

    edgeDeleteBtn?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if(selectedEdgeId) removeEdge(selectedEdgeId);
    });

    openPanelBtn?.addEventListener('click', () => {
      openPanel();
    });
    drawerBackdrop?.addEventListener('click', () => closePanel());

    board.addEventListener('click', (ev) => {
      const chip = ev.target.closest?.('.metaChip[data-editable="true"]');
      if(!chip) return;
      const nodeEl = chip.closest?.('.node');
      const nodeId = nodeEl?.dataset?.nodeId;
      if(!nodeId) return;
      selectNode(nodeId);
      const rect = chip.getBoundingClientRect();
      const meta = chip.dataset.meta;
      hideChipMenu();
      if(meta === 'status') showStatusMenu(nodeId, rect);
      else if(meta === 'owner') showOwnerMenu(nodeId, rect);
      else if(meta === 'due') showDueMenu(nodeId, rect);
      ev.stopPropagation();
    });

    document.addEventListener('pointerdown', (ev) => {
      if(!chipMenu || chipMenu.style.display === 'none') return;
      if(ev.target.closest?.('.chipMenu')) return;
      hideChipMenu();
    });

    nodeDue.addEventListener('change', () => {
      const n = getNode(selectedNodeId);
      if(!n) return;
      markHistory(150);
      n.due = nodeDue.value || '';
  syncNodeDOM(n.id);
  scheduleSave();
});

nodeEta.addEventListener('input', throttledInput(() => {
  const n = getNode(selectedNodeId);
  if(!n) return;
  n.etaDays = clampInt(parseInt(nodeEta.value || '0', 10), 0, 3650);
  syncNodeDOM(n.id);
  scheduleSave();
}, 200));

nodeStatus.addEventListener('change', () => {
  const n = getNode(selectedNodeId);
  if(!n) return;
  markHistory(150);
  n.status = nodeStatus.value || 'backlog';
  syncNodeDOM(n.id);
  scheduleSave();
});

edgeLabelInput?.addEventListener('input', throttledInput(() => {
  const e = state.edges.find(x => x.id === selectedEdgeId);
  if(!e) return;
  e.label = edgeLabelInput.value;
  updateEdgePath(e.id);
  scheduleSave();
}, 200));

edgeOrthoInput?.addEventListener('change', () => {
  const e = state.edges.find(x => x.id === selectedEdgeId);
  if(!e) return;
  markHistory();
  e.ortho = edgeOrthoInput.checked;
  updateEdgePath(e.id);
  scheduleSave();
});

    dupBtn.addEventListener('click', () => { if(selectedNodeId) duplicateNode(selectedNodeId); });
    delBtn.addEventListener('click', () => { if(selectedNodeId) removeNode(selectedNodeId); });

    addNodeBtn.addEventListener('click', addNode);
    autoLayoutBtn.addEventListener('click', autoLayout);
    fitBtn.addEventListener('click', fitView);
    exportBtn.addEventListener('click', exportJSON);
    exportBtn2.addEventListener('click', exportJSON);
    exportPngBtn?.addEventListener('click', exportPNG);
    exportSvgBtn?.addEventListener('click', exportSVG);
    edgeExportBtn?.addEventListener('click', exportSelectionJSON);
    edgeClearBtn?.addEventListener('click', () => { if(selectedEdgeId) removeEdge(selectedEdgeId); });
    startHandle.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); startReconnect('from', ev); });
    endHandle.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); startReconnect('to', ev); });
    clearBtn.addEventListener('click', () => {
      if(confirm('Limpar tudo?')){
        state = defaultState();
        view = {x:0,y:0,scale:1};
        clearSelection();
        renderAll();
        scheduleSave();
        showToast('Canvas limpo');
      }
    });
    importBtn.addEventListener('click', () => fileInput.click());
    modeSelect?.addEventListener('change', () => {
      state.meta = state.meta || {};
      state.meta.mode = modeSelect.value;
      scheduleSave();
    });

    addStatusBtn?.addEventListener('click', () => {
      const val = sanitize(statusInput.value || '');
      if(!val) return;
      state.meta = state.meta || {};
      const list = state.meta.statuses || [];
      if(!list.includes(val)){
        list.push(val);
        state.meta.statuses = list;
        statusInput.value = '';
        renderConfigLists();
        scheduleSave();
      }
    });
    addMemberBtn?.addEventListener('click', () => {
      const val = sanitize(memberInput.value || '');
      if(!val) return;
      state.meta = state.meta || {};
      const list = state.meta.members || [];
      if(!list.includes(val)){
        list.push(val);
        state.meta.members = list;
        memberInput.value = '';
        renderConfigLists();
        scheduleSave();
      }
    });
    templateButtons.forEach(btn => {
      btn.addEventListener('click', () => loadTemplate(btn.dataset.template));
    });

    fileInput.addEventListener('change', async () => {
      const f = fileInput.files && fileInput.files[0];
      if(!f) return;
      try{
        const text = await f.text();
        const s = JSON.parse(text);
        if(!s || !Array.isArray(s.nodes) || !Array.isArray(s.edges)) throw new Error('Invalid');
        state = s;
        view = { x: state.meta?.view?.x ?? 0, y: state.meta?.view?.y ?? 0, scale: clamp(state.meta?.view?.scale ?? 1, 0.5, 2) };
        clearSelection();
        renderAll();
        scheduleSave();
        showToast('Importado');
      } catch {
        showToast('Falha ao importar');
      } finally {
        fileInput.value = '';
      }
    });

    // Pan com botão esquerdo no vazio
    let panning = null;
    canvasWrap.addEventListener('pointerdown', (ev) => {
      if(ev.button !== 0) return;
      const onNode = ev.target.closest && ev.target.closest('.node');
      const onPort = ev.target.closest && ev.target.closest('.port');
      const mode = state.meta?.mode || 'select';
      if(mode === 'hand' || (!onNode && !onPort)){
        panning = { startX: ev.clientX, startY: ev.clientY, x: view.x, y: view.y, pointerId: ev.pointerId };
        try{ canvasWrap.setPointerCapture(ev.pointerId); }catch{}
      }
    });

    window.addEventListener('pointermove', (ev) => {
      if(panning){
        view.x = panning.x + (ev.clientX - panning.startX);
        view.y = panning.y + (ev.clientY - panning.startY);
        applyView();
        scheduleSave();
      }
      if(dragCandidate && dragCandidate.pointerId === ev.pointerId && !draggingNode){
        maybeStartDragging(ev);
      }
      if(connecting) updateTempPath(ev.clientX, ev.clientY);
      if(reconnecting) updateTempPath(ev.clientX, ev.clientY);
      if(draggingNode) moveNodeDuringDrag(ev);
    });

    window.addEventListener('pointerup', (ev) => {
      if(reconnecting){
        finishReconnect(ev);
        reconnecting = null;
      }
      panning = null;
      if(connecting && connecting.mode === 'drag') finishConnection(ev);
      if(draggingNode) stopNodeDrag(ev);
      dragCandidate = null;
    });

    // Zoom com Ctrl+scroll
    canvasWrap.addEventListener('wheel', (ev) => {
      if(!(ev.ctrlKey || ev.metaKey)) return;
      ev.preventDefault();
      const delta = -Math.sign(ev.deltaY) * 0.1;
      const newScale = clamp(view.scale * (1 + delta), 0.5, 2.5);
      if(newScale === view.scale) return;
      setScaleAround(ev.clientX, ev.clientY, newScale);
    }, {passive:false});

    // Double tap para zoom
    let lastTap = 0;
    canvasWrap.addEventListener('pointerdown', (ev) => {
      const now = Date.now();
      if(now - lastTap < 300){
        setScaleAround(ev.clientX, ev.clientY, view.scale * 1.2);
      }
      lastTap = now;
    });

    // Pinch zoom (dois dedos)
    const pinchPointers = new Map();
    canvasWrap.addEventListener('pointerdown', (ev) => {
      pinchPointers.set(ev.pointerId, {x: ev.clientX, y: ev.clientY});
    });
    canvasWrap.addEventListener('pointermove', (ev) => {
      if(!pinchPointers.has(ev.pointerId)) return;
      pinchPointers.set(ev.pointerId, {x: ev.clientX, y: ev.clientY});
      if(pinchPointers.size === 2){
        const pts = Array.from(pinchPointers.values());
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if(!canvasWrap._pinchStart){
          canvasWrap._pinchStart = {dist, scale: view.scale};
        }else{
          const factor = dist / canvasWrap._pinchStart.dist;
          const newScale = clamp(canvasWrap._pinchStart.scale * factor, 0.4, 2.5);
          const midX = (pts[0].x + pts[1].x) / 2;
          const midY = (pts[0].y + pts[1].y) / 2;
          setScaleAround(midX, midY, newScale);
        }
      }
    });
    canvasWrap.addEventListener('pointerup', (ev) => {
      pinchPointers.delete(ev.pointerId);
      if(pinchPointers.size < 2) canvasWrap._pinchStart = null;
    });
    canvasWrap.addEventListener('pointercancel', (ev) => {
      pinchPointers.delete(ev.pointerId);
      canvasWrap._pinchStart = null;
    });
  }

  function startNodeDrag(ev, nodeId){
    const n = getNode(nodeId);
    if(!n) return;
    if((state.meta?.mode || 'select') === 'hand') return; // em modo mão, não arrasta nodes
    const p = clientToCanvas(ev.clientX, ev.clientY);
    dragCandidate = {
      id: nodeId,
      dx: p.x - n.x,
      dy: p.y - n.y,
      pointerId: ev.pointerId,
      startX: ev.clientX,
      startY: ev.clientY
    };
  }

  function maybeStartDragging(ev){
    if(!dragCandidate) return;
    const dist = Math.hypot(ev.clientX - dragCandidate.startX, ev.clientY - dragCandidate.startY);
    if(dist < DRAG_THRESHOLD) return;
    const n = getNode(dragCandidate.id);
    if(!n){ dragCandidate = null; return; }
    markHistory();
    selectedEdgeId = null;
    selectedNodeId = dragCandidate.id;
    refreshSelectionUI();
    draggingNode = { ...dragCandidate };
    try{ canvasWrap.setPointerCapture(dragCandidate.pointerId); }catch{}
  }

  function moveNodeDuringDrag(ev){
    const n = getNode(draggingNode.id);
    if(!n) return;
    const p = clientToCanvas(ev.clientX, ev.clientY);
    n.x = snap(p.x - draggingNode.dx, 10);
    n.y = snap(p.y - draggingNode.dy, 10);
    const el = board.querySelector(`.node[data-node-id="${CSS.escape(n.id)}"]`);
    if(el) el.style.transform = `translate(${n.x}px, ${n.y}px)`;
    rerenderEdgesOnly();
    scheduleSave();
  }

  function stopNodeDrag(ev){
    draggingNode = null;
    dragCandidate = null;
    try{ canvasWrap.releasePointerCapture(ev.pointerId); }catch{}
  }

  function startReconnect(handle, ev){
    const e = state.edges.find(x => x.id === selectedEdgeId);
    if(!e) return;
    reconnecting = {
      edgeId: e.id,
      handle,
      edge: e,
      fixedPoint: handle === 'from'
        ? getPortPos(getNode(e.to), 'in', e.toPort ?? 0)
        : getPortPos(getNode(e.from), 'out', e.fromPort ?? 0)
    };
    updateTempPath(ev.clientX, ev.clientY);
  }

  function finishReconnect(ev){
    const temp = svg.querySelector('#reconnect_temp');
    temp?.remove();
    if(!reconnecting) return;
    const e = state.edges.find(x => x.id === reconnecting.edgeId);
    if(!e) return;
    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    const nodeEl = el?.closest?.('.node');
    if(nodeEl){
      const nodeId = nodeEl.dataset.nodeId;
      const node = getNode(nodeId);
      if(node){
        markHistory();
        if(reconnecting.handle === 'from'){
          e.from = nodeId;
          e.fromPort = 0;
        }else{
          e.to = nodeId;
          e.toPort = 0;
        }
        renderAll();
        selectEdge(e.id);
        scheduleSave();
        showToast('Seta reconectada');
        return;
      }
    }
    showToast('Reconexão cancelada');
  }

function startConnection(ev, fromNodeId, fromPortIdx, mode = 'click'){
  ev.stopPropagation?.();
  const from = getNode(fromNodeId);
  if(!from) return;

  // Clique-para-conectar: clica na saída e depois clica no destino (node ou porta de entrada).
  const A = getPortPos(from, 'out', fromPortIdx);

  connecting = {
    mode,
    fromNodeId,
    fromPort: fromPortIdx ?? 0,
    fromX: A.x,
    fromY: A.y,
    tempId: 'temp_edge'
  };

  renderAll();
  updateTempPath(ev.clientX, ev.clientY);

  if(mode === 'click'){
    showToast('Selecione o destino (clique na etapa). Esc cancela. Shift no “+” cria nova etapa.');
  }
}

function cancelConnection(msg = 'Conexão cancelada'){
  if(!connecting) return;
  connecting = null;
  renderAll();
  if(msg) showToast(msg);
}

function commitEdge(fromId, toId, fromPort = 0, toPort = 0){
  if(!fromId || !toId || fromId === toId){
    showToast('Conexão inválida');
    return;
  }

  if(state.edges.some(e =>
    e.from === fromId &&
    e.to === toId &&
    (e.fromPort ?? 0) === (fromPort ?? 0) &&
    (e.toPort ?? 0) === (toPort ?? 0)
  )){
    showToast('Conexão já existe');
    return;
  }

  markHistory();
  const newEdge = createEdge(fromId, toId, fromPort ?? 0, toPort ?? 0);
  state.edges.push(newEdge);

  selectedEdgeId = newEdge.id;
  selectedNodeId = null;

  renderAll();
  refreshSelectionUI();
  scheduleSave();
  showToast('Conectado');
}

function handleConnectClick(ev){
  if(!connecting || connecting.mode !== 'click') return;

  const target = ev.target;

  // Permite trocar o ponto de saída sem cancelar o modo
  const outPort = target?.closest?.('.port[data-port="out"]');
  if(outPort){
    const nodeEl = outPort.closest?.('.node');
    const fromId = nodeEl?.dataset?.nodeId;
    const idx = parseInt(outPort.getAttribute('data-idx') || '0', 10);
    if(fromId) return startConnection(ev, fromId, idx, 'click');
  }

  const quick = target?.closest?.('.quickAdd');
  if(quick){
    const nodeEl = quick.closest?.('.node');
    const fromId = nodeEl?.dataset?.nodeId;
    if(!fromId) return;
    if(ev.shiftKey){
      cancelConnection(null);
      return createNextStep(fromId);
    }
    return startConnection(ev, fromId, 0, 'click');
  }

  const inPort = target?.closest?.('.port[data-port="in"]');
  if(inPort){
    const nodeEl = inPort.closest?.('.node');
    const toId = nodeEl?.dataset?.nodeId;
    const toPort = parseInt(inPort.getAttribute('data-idx') || '0', 10);
    const ended = connecting;
    connecting = null;
    return commitEdge(ended.fromNodeId, toId, ended.fromPort ?? 0, toPort);
  }

  const nodeEl = target?.closest?.('.node');
  if(nodeEl){
    const toId = nodeEl?.dataset?.nodeId;
    const ended = connecting;
    connecting = null;
    return commitEdge(ended.fromNodeId, toId, ended.fromPort ?? 0, 0);
  }

  cancelConnection();
}

// Mantido caso você queira reativar conexão por arrasto no futuro
function finishConnection(ev){
  const ended = connecting;
  connecting = null;
  if(!ended) return;

  const el = document.elementFromPoint(ev.clientX, ev.clientY);
  const port = el && el.closest && el.closest('.port[data-port="in"]');
  const toPortIdx = parseInt(port?.getAttribute('data-idx') || '0', 10);
  const nodeEl = port && port.closest && port.closest('.node');

  renderAll();

  if(!nodeEl){ showToast('Conexão cancelada'); return; }
  const toId = nodeEl.dataset.nodeId;
  commitEdge(ended.fromNodeId, toId, ended.fromPort ?? 0, toPortIdx);
}

  function selectNode(nodeId){ selectedNodeId = nodeId; selectedEdgeId = null; refreshSelectionUI(); }
  function updateEdgeSelectionDOM(){
    const paths = svg.querySelectorAll('path.edgePath');
    paths.forEach(p => p.classList.toggle('selected', p.dataset.edgeId === selectedEdgeId));
    updateEdgeDeleteBtn();
    updateEdgeHandles();
  }

  function selectEdge(edgeId){ selectedEdgeId = edgeId; selectedNodeId = null; updateEdgeSelectionDOM(); refreshSelectionUI(); hideChipMenu(); }
  function clearSelection(){ selectedNodeId = null; selectedEdgeId = null; updateEdgeSelectionDOM(); refreshSelectionUI(); hideChipMenu(); }

  function updateEdgeDeleteBtn(){
    if(!edgeDeleteBtn) return;
    if(!selectedEdgeId){
      edgeDeleteBtn.style.display = 'none';
      return;
    }
    const e = state.edges.find(x => x.id === selectedEdgeId);
    if(!e){ edgeDeleteBtn.style.display = 'none'; return; }
    const a = getNode(e.from);
    const b = getNode(e.to);
    if(!a || !b){ edgeDeleteBtn.style.display = 'none'; return; }

    const A = getPortPos(a, 'out', e.fromPort ?? 0);
    const B = getPortPos(b, 'in', e.toPort ?? 0);
    const mid = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
    const pos = canvasToViewport(mid.x, mid.y);
    edgeDeleteBtn.style.left = `${pos.x}px`;
    edgeDeleteBtn.style.top = `${pos.y}px`;
    edgeDeleteBtn.style.display = 'block';
  }

  function updateEdgeHandles(){
    if(!startHandle || !endHandle){
      return;
    }
    if(!selectedEdgeId){
      startHandle.style.display = 'none';
      endHandle.style.display = 'none';
      return;
    }
    const e = state.edges.find(x => x.id === selectedEdgeId);
    if(!e){
      startHandle.style.display = 'none';
      endHandle.style.display = 'none';
      return;
    }
    const a = getNode(e.from);
    const b = getNode(e.to);
    if(!a || !b){
      startHandle.style.display = 'none';
      endHandle.style.display = 'none';
      return;
    }
    const A = getPortPos(a, 'out', e.fromPort ?? 0);
    const B = getPortPos(b, 'in', e.toPort ?? 0);
    startHandle.setAttribute('cx', A.x);
    startHandle.setAttribute('cy', A.y);
    endHandle.setAttribute('cx', B.x);
    endHandle.setAttribute('cy', B.y);
    startHandle.style.display = 'block';
    endHandle.style.display = 'block';
    startHandle.dataset.handle = 'from';
    endHandle.dataset.handle = 'to';
  }

  function syncNodeDOM(nodeId){
    const n = getNode(nodeId);
    const el = board.querySelector(`.node[data-node-id="${CSS.escape(nodeId)}"]`);
    if(!n || !el) return;

    const titleEl = el.querySelector('.nodeTitle');
    const descEl = el.querySelector('.nodeDesc');
    const statusEl = el.querySelector('.statusPill');

    if(titleEl && sanitize(titleEl.textContent) !== (n.name || '')) titleEl.textContent = n.name || '';
    if(descEl && sanitize(descEl.textContent) !== (n.desc || '')) descEl.textContent = n.desc || '';
    el.dataset.status = (n.status || 'backlog');
    if(statusEl){
      statusEl.textContent = statusLabelFrom(n.status);
      statusEl.className = 'statusPill ' + statusPillClass(n);
    }

    const metaWrap = el.querySelector('.nodeMeta');
    if(metaWrap){
      metaWrap.outerHTML = renderMeta(n);
      updateEdgeHandles();
    }

    rerenderEdgesOnly();
  }



function createNextStep(fromNodeId){
  const from = getNode(fromNodeId);
  if(!from) return;

  markHistory();

  const nx = (from.x || 0) + (from.w || 260) + 160;
  const ny = (from.y || 0);

  const n = createNode('Nova Etapa', 'Descrição...', 'Etapa', nx, ny);
  state.nodes.push(n);
  state.edges.push(createEdge(fromNodeId, n.id, 0, 0));

  renderAll();
  selectNode(n.id);
  scheduleSave();
  showToast('Próxima etapa criada');
}

  function addNode(){
    markHistory();
    const nextX = 100 + state.nodes.length * 140;
    const nextY = 120 + (state.nodes.length % 3) * 150;
    const n = createNode('Nova Etapa', 'Descrição...', 'Etapa', nextX, nextY);
    state.nodes.push(n);
    renderAll();
    selectNode(n.id);
    scheduleSave();
    showToast('Etapa adicionada');
  }

  function duplicateNode(nodeId){
    const n = getNode(nodeId);
    if(!n) return;
    markHistory();
    const copy = { ...n, id: uid('n'), x: n.x + 30, y: n.y + 30, name: (n.name || 'Node') + ' (cópia)' };
    state.nodes.push(copy);
    renderAll();
    selectNode(copy.id);
    scheduleSave();
    showToast('Duplicado');
  }

  function removeNode(nodeId){
    const idx = state.nodes.findIndex(n => n.id === nodeId);
    if(idx < 0) return;
    markHistory();
    state.nodes.splice(idx, 1);
    state.edges = state.edges.filter(e => e.from !== nodeId && e.to !== nodeId);
    if(selectedNodeId === nodeId) selectedNodeId = null;
    if(selectedEdgeId && !state.edges.some(e => e.id === selectedEdgeId)) selectedEdgeId = null;
    renderAll();
    scheduleSave();
    showToast('Etapa removida');
  }

  function removeEdge(edgeId){
    const idx = state.edges.findIndex(e => e.id === edgeId);
    if(idx < 0) return;
    markHistory();
    state.edges.splice(idx, 1);
    if(selectedEdgeId === edgeId) selectedEdgeId = null;
    renderAll();
    scheduleSave();
    showToast('Conexão removida');
  }

  function autoLayout(){
    markHistory();
    const nodes = [...state.nodes];
    const byId = new Map(nodes.map(n => [n.id, n]));
    const indeg = new Map(nodes.map(n => [n.id, 0]));
    const adj = new Map(nodes.map(n => [n.id, []]));

    for(const e of state.edges){
      if(!byId.has(e.from) || !byId.has(e.to)) continue;
      indeg.set(e.to, (indeg.get(e.to) || 0) + 1);
      adj.get(e.from).push(e.to);
    }

    const q = [];
    for(const [id,d] of indeg){ if(d === 0) q.push(id); }

    const order = [];
    while(q.length){
      const id = q.shift();
      order.push(id);
      for(const v of adj.get(id) || []){
        indeg.set(v, (indeg.get(v) || 0) - 1);
        if(indeg.get(v) === 0) q.push(v);
      }
    }

    const finalOrder = (order.length === nodes.length) ? order : nodes.map(n => n.id);
    const level = new Map(finalOrder.map(id => [id, 0]));

    for(let iter=0; iter<10; iter++){
      for(const e of state.edges){
        const a = level.get(e.from) ?? 0;
        const b = level.get(e.to) ?? 0;
        if(b <= a) level.set(e.to, a + 1);
      }
    }

    const columns = new Map();
    for(const id of finalOrder){
      const l = level.get(id) ?? 0;
      if(!columns.has(l)) columns.set(l, []);
      columns.get(l).push(id);
    }

    const startX = 100, startY = 120, colGap = 320, rowGap = 170;
    for(const [l, ids] of columns.entries()){
      ids.forEach((id, r) => {
        const n = byId.get(id);
        if(!n) return;
        n.x = startX + l * colGap;
        n.y = startY + r * rowGap;
      });
    }

    renderAll();
    scheduleSave();
    showToast('Layout aplicado');
  }

  function exportJSON(){
    const blob = new Blob([JSON.stringify(state, null, 2)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'flowchart.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
    showToast('Exportado');
  }

  function exportSelectionJSON(){
    let data = null;
    if(selectedNodeId){
      const node = getNode(selectedNodeId);
      if(!node) return showToast('Nada selecionado');
      const edges = state.edges.filter(e => e.from === node.id || e.to === node.id);
      const nodes = [node];
      // inclui nós vizinhos para manter referência
      for(const e of edges){
        const otherId = e.from === node.id ? e.to : e.from;
        const o = getNode(otherId);
        if(o && !nodes.some(n => n.id === o.id)) nodes.push(o);
      }
      data = { nodes, edges, meta: { view } };
    } else if(selectedEdgeId){
      const e = state.edges.find(x => x.id === selectedEdgeId);
      if(!e) return showToast('Nada selecionado');
      const a = getNode(e.from);
      const b = getNode(e.to);
      const nodes = [a,b].filter(Boolean);
      data = { nodes, edges:[e], meta:{view} };
    } else {
      return showToast('Selecione um nó ou seta');
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'flowchart-selection.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
    showToast('Seleção exportada');
  }

  function exportSVG(){
    updateNodeMetricsFromDOM();
    renderEdges();
    const clone = svg.cloneNode(true);
    clone.removeAttribute('style');
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(clone);
    const blob = new Blob([source], {type:'image/svg+xml'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'flowchart.svg';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
    showToast('SVG exportado');
  }

  function exportPNG(){
    // Render o SVG em canvas para PNG (inclui apenas edges; nodes via HTML não são capturados).
    // Aviso: esta versão exporta as linhas; para nodes completos seria preciso usar html2canvas/dom-to-image.
    updateNodeMetricsFromDOM();
    renderEdges();
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svg);
    const img = new Image();
    const svgBlob = new Blob([source], {type:'image/svg+xml;charset=utf-8'});
    const url = URL.createObjectURL(svgBlob);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = svg.clientWidth;
      canvas.height = svg.clientHeight;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#0B0F0E';
      ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'flowchart.png';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(a.href);
      });
      URL.revokeObjectURL(url);
    };
    img.src = url;
    showToast('PNG exportado (somente setas)');
  }

  function fitView(){
    if(state.nodes.length === 0){
      view = {x:0,y:0,scale:1};
      applyView();
      scheduleSave();
      return;
    }

    const padding = 80;
    const xs = state.nodes.map(n => n.x);
    const ys = state.nodes.map(n => n.y);
    const xe = state.nodes.map(n => n.x + (n.w || 260));
    const ye = state.nodes.map(n => n.y + (n.h || 130));

    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xe);
    const maxY = Math.max(...ye);

    const w = maxX - minX + padding*2;
    const h = maxY - minY + padding*2;

    const cw = canvasWrap.clientWidth;
    const ch = canvasWrap.clientHeight;

    const s = clamp(Math.min(cw / w, ch / h), 0.5, 1.5);

    view.scale = s;
    view.x = padding * s - minX * s;
    view.y = padding * s - minY * s;

    applyView();
    scheduleSave();
    rerenderEdgesOnly();
    showToast('Enquadrado');
  }

  function getNode(id){ return state.nodes.find(n => n.id === id) || null; }

  function clientToCanvas(clientX, clientY){
    const rect = canvasWrap.getBoundingClientRect();
    const x = (clientX - rect.left - view.x) / view.scale;
    const y = (clientY - rect.top - view.y) / view.scale;
    return {x, y};
  }

  function canvasToViewport(x, y){
    return {
      x: view.x + x * view.scale,
      y: view.y + y * view.scale
    };
  }

  function updateNodeMetricsFromDOM(){
  // Atualiza w/h reais (baseado no DOM), para fitView/layout e viewBox ficarem corretos
  for(const n of state.nodes){
    const el = board.querySelector(`.node[data-node-id="${CSS.escape(n.id)}"]`);
    if(!el) continue;
    const r = el.getBoundingClientRect();
    // Rect inclui escala; converte para coordenadas do canvas
    n.w = Math.round(r.width / view.scale);
    n.h = Math.round(r.height / view.scale);
  }
}

function fmtDateBR(yyyyMmDd){
  const s = String(yyyyMmDd || '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if(!m) return s;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function isDone(status){
  return String(status || '').toLowerCase() === 'done';
}

function chipStyleFromColor(hex){
    const h = String(hex || '').trim().toLowerCase();
    const ok = /^#[0-9a-f]{6}$/.test(h) ? h : '#B6F23A';
    const n = parseInt(ok.slice(1), 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return {
      tx: `rgb(${r},${g},${b})`,
      bd: `rgba(${r},${g},${b},.35)`,
      bg: `rgba(${r},${g},${b},.14)`
    };
  }

  function loadTemplate(name){
    const t = String(name || '').toLowerCase();
    const templates = {
      processo: [
        ['Ideação','Descobrir problema','Backlog'],
        ['Planejar','Planejamento do fluxo','doing'],
        ['Executar','Execução das etapas','testing'],
        ['Validar','Validação e QA','bugfix'],
        ['Finalizar','Entrega','done']
      ],
      kanban: [
        ['To Do','Itens a iniciar','backlog'],
        ['Doing','Itens em andamento','doing'],
        ['Review','Revisão','testing'],
        ['Done','Concluído','done']
      ],
      etl: [
        ['Extract','Extrair dados','backlog'],
        ['Transform','Transformar dados','doing'],
        ['Load','Carregar em destino','testing'],
        ['Monitor','Monitorar pipeline','bugfix']
      ],
      pipeline: [
        ['Ingestão','Captura de fontes','backlog'],
        ['Curadoria','Limpeza/curadoria','doing'],
        ['Modelagem','Modelos e métricas','testing'],
        ['Deploy BI','Publicação dashboards','done']
      ],
      sac: [
        ['Abertura','Registrar chamado','backlog'],
        ['Triagem','Classificar prioridade','doing'],
        ['Atendimento','Resolver solicitação','testing'],
        ['Feedback','Coletar satisfação','done']
      ]
    };
    const list = templates[t];
    if(!list) return;
    markHistory();
    state.nodes = list.map((item, idx) => createNode(item[0], item[1], item[2], 120 + idx*280, 150));
    state.edges = [];
    for(let i=0;i<state.nodes.length-1;i++){
      state.edges.push(createEdge(state.nodes[i].id, state.nodes[i+1].id, 0, 0));
    }
    view = {x:0,y:0,scale:1};
    clearSelection();
    renderAll();
    fitView();
    scheduleSave();
    showToast('Template aplicado');
  }

  function uid(prefix){ return `${prefix}_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`; }
  function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
  function clampInt(v, a, b){ return Math.max(a, Math.min(b, Math.round(Number(v) || a))); }
  function snap(v, step){ return Math.round(v / step) * step; }
  
  function statusLabelFrom(status){
    const s = (status || 'backlog');
    if(['doing','em andamento'].includes(s)) return 'Em andamento';
    if(['testing','teste'].includes(s)) return 'Teste';
    if(['bugfix','correção de bugs'].includes(s)) return 'Correção de bugs';
    if(s === 'done' || s === 'finalizado') return 'Finalizado';
    if(s === 'backlog') return 'Backlog';
    return s;
  }
  function statusPillClass(n){
    const s = (n?.status || 'backlog');
    return 's-' + s;
  }

function esc(str){ return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }
  function sanitize(str){ return String(str || '').replace(/\s+/g,' ').trim(); }

  let toastTimer = null;
  function showToast(msg){
    clearTimeout(toastTimer);
    toast.textContent = msg;
    toast.classList.add('show');
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
  }
})();
