(() => {
  'use strict';

  const STORAGE_KEY = 'flowchart-v2';
  const defaultState = () => ({
    nodes: [
      { id: 'start', x: 100, y: 150, title: 'In?cio', desc: 'Entrada do processo', status: 'doing', type: 'start' },
      { id: 'process', x: 400, y: 150, title: 'Processamento', desc: 'An?lise de dados', status: 'backlog', type: 'process' }
    ],
    edges: [
      { id: 'e1', from: 'start', to: 'process' }
    ],
    meta: { view: { x: 0, y: 0, scale: 1 } }
  });

  let state = loadState() || defaultState();
  let view = { x: state.meta?.view?.x ?? 0, y: state.meta?.view?.y ?? 0, scale: state.meta?.view?.scale ?? 1 };
  let draggingNode = null;
  let connectingStartNode = null;
  let isPanning = false;
  let panStart = { x: 0, y: 0 };
  let selectedNodeId = null;
  let selectedEdgeId = null;

  const board = document.getElementById('board');
  const svg = document.getElementById('svg');
  const canvasWrap = document.getElementById('canvasWrap');
  const editorPanel = document.getElementById('editor');
  const noneSelectedPanel = document.getElementById('noneSelected');

  const inputs = {
    title: document.getElementById('nodeName'),
    desc: document.getElementById('nodeDesc'),
    status: document.getElementById('nodeStatus'),
    color: document.getElementById('nodeColor')
  };

  function init() {
    renderAll();
    setupEvents();
    applyView();
  }

  function renderAll() {
    board.innerHTML = '';
    svg.innerHTML = '';

    state.edges.forEach(edge => {
      const fromNode = state.nodes.find(n => n.id === edge.from);
      const toNode = state.nodes.find(n => n.id === edge.to);
      if (fromNode && toNode) {
        createSvgPath(edge.id, fromNode, toNode, false);
      }
    });

    state.nodes.forEach(renderNode);
    updateSidebar();
  }

  function renderNode(node) {
    const el = document.createElement('div');
    el.className = 
ode ;
    el.dataset.id = node.id;
    el.style.transform = 	ranslate(px, px);

    const styleBorder = node.color ? order-left: 4px solid  : '';

    el.innerHTML = 
      <div class="drag-handle" title="Arraste por aqui"></div>
      <div class="node-content" style="">
        <div class="node-title"></div>
        <div class="node-desc"></div>
        <div class="node-meta">
          <span class="status-pill "></span>
        </div>
      </div>
      <div class="port in" data-type="in"></div>
      <div class="port out" data-type="out"></div>
    ;

    board.appendChild(el);
  }

  function createSvgPath(id, nodeA, nodeB, isTemp) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');

    const x1 = nodeA.x + 100;
    const y1 = nodeA.y + (isTemp ? 0 : 80);
    const x2 = nodeB.x + (isTemp ? 0 : 100);
    const y2 = nodeB.y;

    const distY = Math.abs(y2 - y1);
    const cp1y = y1 + distY * 0.5;
    const cp2y = y2 - distY * 0.5;

    const d = M   C  ,  ,  ;

    path.setAttribute('d', d);
    path.setAttribute('id', isTemp ? 'temp-edge' : edge-);
    if (id === selectedEdgeId) path.classList.add('selected');

    if (!isTemp) {
      path.addEventListener('click', (e) => {
        e.stopPropagation();
        selectedEdgeId = id;
        selectedNodeId = null;
        renderAll();
      });
    }

    svg.appendChild(path);
  }

  function setupEvents() {
    canvasWrap.addEventListener('mousedown', (e) => {
      if (e.button === 1 || (e.button === 0 && e.getModifierState('Space'))) {
        isPanning = true;
        panStart = { x: e.clientX, y: e.clientY };
        canvasWrap.style.cursor = 'grabbing';
        e.preventDefault();
        return;
      }

      if (e.target.classList.contains('port') && e.target.classList.contains('out')) {
        const nodeEl = e.target.closest('.node');
        connectingStartNode = state.nodes.find(n => n.id === nodeEl.dataset.id);
        return;
      }

      const nodeEl = e.target.closest('.node');
      if (nodeEl) {
        const nodeId = nodeEl.dataset.id;
        selectedNodeId = nodeId;
        selectedEdgeId = null;
        updateSidebar();
        renderAll();

        if (e.target.classList.contains('drag-handle') || e.target.closest('.drag-handle')) {
          draggingNode = state.nodes.find(n => n.id === nodeId);
        }
        return;
      }

      selectedNodeId = null;
      selectedEdgeId = null;
      renderAll();
    });

    window.addEventListener('mousemove', (e) => {
      if (isPanning) {
        const dx = e.clientX - panStart.x;
        const dy = e.clientY - panStart.y;
        view.x += dx;
        view.y += dy;
        panStart = { x: e.clientX, y: e.clientY };
        applyView();
        return;
      }

      if (draggingNode) {
        const dx = e.movementX / view.scale;
        const dy = e.movementY / view.scale;
        draggingNode.x += dx;
        draggingNode.y += dy;
        renderAll();
      }

      if (connectingStartNode) {
        const oldTemp = document.getElementById('temp-edge');
        if (oldTemp) oldTemp.remove();

        const mouseX = (e.clientX - canvasWrap.getBoundingClientRect().left - view.x) / view.scale;
        const mouseY = (e.clientY - canvasWrap.getBoundingClientRect().top - view.y) / view.scale;

        createSvgPath('temp', connectingStartNode, { x: mouseX, y: mouseY }, true);
      }
    });

    window.addEventListener('mouseup', (e) => {
      isPanning = false;
      canvasWrap.style.cursor = 'grab';
      draggingNode = null;

      if (connectingStartNode) {
        const targetEl = e.target.closest('.node');
        const oldTemp = document.getElementById('temp-edge');
        if (oldTemp) oldTemp.remove();

        if (targetEl) {
          const targetId = targetEl.dataset.id;
          if (targetId !== connectingStartNode.id) {
            const exists = state.edges.find(ed => ed.from === connectingStartNode.id && ed.to === targetId);
            if (!exists) {
              state.edges.push({ id: 'e_' + Date.now(), from: connectingStartNode.id, to: targetId });
              saveState();
            }
          }
        }
        connectingStartNode = null;
        renderAll();
      }

      saveState();
    });

    canvasWrap.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomIntensity = 0.1;
      const direction = e.deltaY > 0 ? -1 : 1;
      const newScale = Math.min(Math.max(0.2, view.scale + (direction * zoomIntensity)), 3);
      view.scale = newScale;
      applyView();
    }, { passive: false });

    document.getElementById('addNodeBtn').onclick = () => {
      const id = 'node_' + Date.now();
      const centerX = (-view.x + canvasWrap.clientWidth / 2) / view.scale;
      const centerY = (-view.y + canvasWrap.clientHeight / 2) / view.scale;
      state.nodes.push({
        id,
        x: centerX - 100,
        y: centerY - 50,
        title: 'Nova Etapa',
        desc: 'Descri??o...',
        status: 'backlog',
        color: ''
      });
      renderAll();
      saveState();
    };

    document.getElementById('clearBtn').onclick = () => {
      if(confirm('Limpar tudo?')) {
        state = defaultState();
        view = { x: 0, y: 0, scale: 1 };
        renderAll();
        saveState();
      }
    };

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNodeId) {
          state.nodes = state.nodes.filter(n => n.id !== selectedNodeId);
          state.edges = state.edges.filter(ed => ed.from !== selectedNodeId && ed.to !== selectedNodeId);
          selectedNodeId = null;
        } else if (selectedEdgeId) {
          state.edges = state.edges.filter(ed => ed.id !== selectedEdgeId);
          selectedEdgeId = null;
        }
        renderAll();
        saveState();
      }
    });

    const updateNodeData = () => {
      if (!selectedNodeId) return;
      const node = state.nodes.find(n => n.id === selectedNodeId);
      if (node) {
        node.title = inputs.title.value;
        node.desc = inputs.desc.value;
        node.status = inputs.status.value;
        node.color = inputs.color.value;
        renderAll();
        saveState();
      }
    };

    Object.values(inputs).forEach(input => {
      input.addEventListener('input', updateNodeData);
    });
  }

  function applyView() {
    const transform = 	ranslate(px, px) scale();
    board.style.transform = transform;
    svg.style.transform = transform;
    svg.style.transformOrigin = '0 0';

    const gridSize = 20 * view.scale;
    canvasWrap.style.backgroundSize = ${gridSize}px px;
    canvasWrap.style.backgroundPosition = ${view.x}px px;
  }

  function updateSidebar() {
    if (selectedNodeId) {
      editorPanel.style.display = 'block';
      noneSelectedPanel.style.display = 'none';
      const node = state.nodes.find(n => n.id === selectedNodeId);
      if (node) {
        inputs.title.value = node.title;
        inputs.desc.value = node.desc || '';
        inputs.status.value = node.status;
        inputs.color.value = node.color || '#000000';
      }
    } else {
      editorPanel.style.display = 'none';
      noneSelectedPanel.style.display = 'block';
    }
  }

  function escapeHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function saveState() {
    state.meta = { view };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function loadState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  init();

})();
