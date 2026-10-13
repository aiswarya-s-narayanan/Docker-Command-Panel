/* ================================================================
   Docker Command Panel — app.js
   Handles: live data fetching, command execution, UI state
   ================================================================ */

const API = '';   // same origin

// ─── DOM Refs ──────────────────────────────────────────────────
const commandSelect    = document.getElementById('commandSelect');
const containerSelect  = document.getElementById('containerSelect');
const imageSelect      = document.getElementById('imageSelect');
const manualImageInput = document.getElementById('manualImageInput');
const manualImageLabel = document.getElementById('manualImageLabel');
const buildContextInput= document.getElementById('buildContextInput');

const containerField   = document.getElementById('containerField');
const imageField       = document.getElementById('imageField');
const manualImageField = document.getElementById('manualImageField');
const buildContextField= document.getElementById('buildContextField');

const commandPreview   = document.getElementById('commandPreview');
const executeBtn       = document.getElementById('executeBtn');

const terminalBody     = document.getElementById('terminalBody');
const terminalTitle    = document.getElementById('terminalTitle');
const clearBtn         = document.getElementById('clearBtn');

const containerBadge   = document.getElementById('containerBadge');
const imageBadge       = document.getElementById('imageBadge');
const containerTableBody = document.getElementById('containerTableBody');
const imageTableBody   = document.getElementById('imageTableBody');

const modalOverlay     = document.getElementById('modalOverlay');
const modalTitle       = document.getElementById('modalTitle');
const modalBody        = document.getElementById('modalBody');
const modalIcon        = document.getElementById('modalIcon');
const cancelBtn        = document.getElementById('cancelBtn');
const confirmBtn       = document.getElementById('confirmBtn');

const refreshBtn       = document.getElementById('refreshBtn');

// ─── State ─────────────────────────────────────────────────────
let containers = [];
let images     = [];
let pendingAction = null;

// ─── Data Fetching ──────────────────────────────────────────────

async function fetchContainers() {
  try {
    const res = await fetch(`${API}/api/containers`);
    containers = await res.json();
    renderContainerTable();
    populateContainerSelect();
    containerBadge.textContent = containers.length;
  } catch (e) {
    logLine('error', `[Error] Could not fetch containers: ${e.message}`);
  }
}

async function fetchImages() {
  try {
    const res = await fetch(`${API}/api/images`);
    images = await res.json();
    renderImageTable();
    populateImageSelect();
    imageBadge.textContent = images.length;
  } catch (e) {
    logLine('error', `[Error] Could not fetch images: ${e.message}`);
  }
}

async function refreshAll() {
  refreshBtn.classList.add('spinning');
  await Promise.all([fetchContainers(), fetchImages()]);
  setTimeout(() => refreshBtn.classList.remove('spinning'), 400);
}

// ─── Populate Selects ───────────────────────────────────────────

function populateContainerSelect() {
  const prev = containerSelect.value;
  containerSelect.innerHTML = '<option value="">— Select container —</option>';
  containers.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.name;
    opt.textContent = `${c.name}  (${c.image})`;
    opt.dataset.image = c.image;
    containerSelect.appendChild(opt);
  });
  if (prev) containerSelect.value = prev;
}

function populateImageSelect() {
  const prev = imageSelect.value;
  imageSelect.innerHTML = '<option value="">— Select image —</option>';
  images.forEach(img => {
    const opt = document.createElement('option');
    const tag = img.tag === '<none>' ? '' : `:${img.tag}`;
    const fullName = `${img.repository}${tag}`;
    opt.value = fullName === ':' ? img.id : fullName;
    opt.textContent = `${img.repository}:${img.tag}  (${img.size})`;
    imageSelect.appendChild(opt);
  });
  if (prev) imageSelect.value = prev;
}

// ─── Render Tables ──────────────────────────────────────────────

function statusPill(status = '') {
  const lower = status.toLowerCase();
  let cls = 'other';
  if (lower.startsWith('up')) cls = 'running';
  else if (lower.startsWith('exited')) cls = 'exited';
  else if (lower.includes('pause')) cls = 'paused';
  return `<span class="status-pill ${cls}">${status || 'unknown'}</span>`;
}

function renderContainerTable() {
  if (!containers.length) {
    containerTableBody.innerHTML = '<tr><td colspan="4" class="empty-cell">No containers found</td></tr>';
    return;
  }
  containerTableBody.innerHTML = containers.map(c => {
    const isRunning = c.status && c.status.toLowerCase().startsWith('up');
    const quickBtn = isRunning
      ? `<button class="quick-btn stop-btn" data-target="${c.name}" data-action="stop">⏹ Stop</button>`
      : `<button class="quick-btn start-btn" data-target="${c.name}" data-action="start">▶ Start</button>`;
    const logBtn = `<button class="quick-btn log-btn" data-target="${c.name}" data-action="logs" style="margin-left:6px">📜 Logs</button>`;
    return `<tr>
      <td><strong style="color:var(--text-primary)">${c.name || c.id}</strong></td>
      <td>${c.image}</td>
      <td>${statusPill(c.status)}</td>
      <td>${quickBtn}${logBtn}</td>
    </tr>`;
  }).join('');

  containerTableBody.querySelectorAll('.quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      const target = btn.dataset.target;
      executeDockerCommand(action, target, null);
    });
  });
}

function renderImageTable() {
  if (!images.length) {
    imageTableBody.innerHTML = '<tr><td colspan="4" class="empty-cell">No images found</td></tr>';
    return;
  }
  imageTableBody.innerHTML = images.map(img =>
    `<tr>
      <td><strong style="color:var(--text-primary)">${img.repository}</strong></td>
      <td><code style="color:var(--accent);font-family:var(--font-mono);font-size:0.78rem">${img.tag}</code></td>
      <td>${img.size}</td>
      <td style="color:var(--text-muted)">${img.created}</td>
    </tr>`
  ).join('');
}

// ─── Command UI Logic ───────────────────────────────────────────

function updateUI() {
  const cmd = commandSelect.value;

  // Field visibility
  containerField.classList.add('hidden');
  imageField.classList.add('hidden');
  manualImageField.classList.add('hidden');
  buildContextField.classList.add('hidden');

  switch (cmd) {
    case 'remove':
      containerField.classList.remove('hidden');
      imageField.classList.remove('hidden');
      break;
    case 'remove-container':
      containerField.classList.remove('hidden');
      break;
    case 'remove-image':
      imageField.classList.remove('hidden');
      break;
    case 'start':
    case 'stop':
    case 'restart':
    case 'logs':
      containerField.classList.remove('hidden');
      break;
    case 'pull':
      manualImageField.classList.remove('hidden');
      manualImageLabel.textContent = 'Image to pull (e.g. nginx:latest)';
      break;
    case 'build':
      manualImageField.classList.remove('hidden');
      buildContextField.classList.remove('hidden');
      manualImageLabel.textContent = 'Image tag (e.g. myapp:latest)';
      break;
  }

  updatePreview();
  updateExecuteBtn();
}

function updatePreview() {
  const cmd = commandSelect.value;
  if (!cmd) { commandPreview.textContent = 'Select a command to begin…'; commandPreview.classList.remove('active'); return; }

  let preview = 'docker ';
  const container = containerSelect.value;
  const image     = imageSelect.value;
  const manual    = manualImageInput.value.trim();
  const context   = buildContextInput.value.trim();

  switch (cmd) {
    case 'remove':
      preview += `stop ${container || '<container>'} && docker rm -f ${container || '<container>'} && docker rmi -f ${image || '<image>'}`;
      break;
    case 'remove-container':
      preview += `stop ${container || '<container>'} && docker rm -f ${container || '<container>'}`;
      break;
    case 'remove-image':
      preview += `rmi -f ${image || '<image>'}`;
      break;
    case 'start':   preview += `start ${container || '<container>'}`;   break;
    case 'stop':    preview += `stop ${container || '<container>'}`;    break;
    case 'restart': preview += `restart ${container || '<container>'}`;break;
    case 'logs':    preview += `logs --tail 100 ${container || '<container>'}`;break;
    case 'pull':    preview += `pull ${manual || '<image:tag>'}`;       break;
    case 'build':   preview += `build -t ${manual || '<tag>'} ${context || '<context>'}`;break;
  }

  commandPreview.textContent = preview;
  commandPreview.classList.add('active');
}

function updateExecuteBtn() {
  const cmd     = commandSelect.value;
  const container = containerSelect.value;
  const image   = imageSelect.value;
  const manual  = manualImageInput.value.trim();
  const context = buildContextInput.value.trim();

  let ready = false;
  switch (cmd) {
    case 'remove':           ready = !!container;              break;
    case 'remove-container': ready = !!container;              break;
    case 'remove-image':     ready = !!image;                  break;
    case 'start':
    case 'stop':
    case 'restart':
    case 'logs':    ready = !!container;              break;
    case 'pull':    ready = !!manual;                 break;
    case 'build':   ready = !!(manual && context);   break;
  }

  executeBtn.disabled = !ready;

  if (cmd === 'remove' || cmd === 'remove-container' || cmd === 'remove-image') {
    executeBtn.classList.add('danger');
  } else {
    executeBtn.classList.remove('danger');
  }
}

// ─── Terminal Output ────────────────────────────────────────────

function clearTerminal() {
  terminalBody.innerHTML = `<div class="terminal-placeholder">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <polyline points="4 17 10 11 4 5"/>
      <line x1="12" y1="19" x2="20" y2="19"/>
    </svg>
    <p>Command output will appear here</p>
  </div>`;
}

function logLine(type, text) {
  // Remove placeholder if present
  const placeholder = terminalBody.querySelector('.terminal-placeholder');
  if (placeholder) placeholder.remove();

  const div = document.createElement('div');
  div.className = `terminal-line ${type}`;
  div.textContent = text;
  terminalBody.appendChild(div);
  terminalBody.scrollTop = terminalBody.scrollHeight;
}

function logOutput(rawText, commandName) {
  terminalTitle.textContent = `Output — docker ${commandName}`;
  const lines = rawText.split('\n');
  lines.forEach(line => {
    if (!line.trim()) return;
    let type = '';
    if (/error|failed|denied/i.test(line)) type = 'error';
    else if (/warning/i.test(line)) type = 'muted';
    else if (/successfully|complete|pulled|started|stopped|removed/i.test(line)) type = 'success';
    else if (line.startsWith('Step') || line.startsWith('#')) type = 'info';
    logLine(type, line);
  });
}

// ─── Execute Command ────────────────────────────────────────────

async function executeDockerCommand(cmd, target, imageTag) {
  executeBtn.disabled = true;
  executeBtn.classList.add('loading');
  executeBtn.querySelector('.btn-icon').textContent = '⏳';

  logLine('info', `\n▶ docker ${cmd} ${target}${imageTag ? ' (image: ' + imageTag + ')' : ''}`);
  logLine('muted', new Date().toLocaleTimeString());

  try {
    const res = await fetch(`${API}/api/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: cmd, target, imageTag })
    });
    const data = await res.json();

    if (data.error) {
      logLine('error', `[Error] ${data.error}`);
    } else {
      logOutput(data.output || '(no output)', cmd);
      logLine('success', `✓ Command completed`);
    }
  } catch (e) {
    logLine('error', `[Network Error] ${e.message}`);
  } finally {
    executeBtn.classList.remove('loading');
    executeBtn.querySelector('.btn-icon').textContent = '⚡';
    updateExecuteBtn();
    setTimeout(refreshAll, 1500); // refresh tables after action
  }
}

// ─── Modal ──────────────────────────────────────────────────────

function showConfirm({ icon, title, body, onConfirm }) {
  modalIcon.textContent  = icon;
  modalTitle.textContent = title;
  modalBody.textContent  = body;
  pendingAction = onConfirm;
  modalOverlay.classList.remove('hidden');
}

function hideModal() {
  modalOverlay.classList.add('hidden');
  pendingAction = null;
}

// ─── Event Listeners ────────────────────────────────────────────

commandSelect.addEventListener('change', updateUI);
containerSelect.addEventListener('change', () => { updatePreview(); updateExecuteBtn(); });
imageSelect.addEventListener('change',     () => { updatePreview(); updateExecuteBtn(); });
manualImageInput.addEventListener('input', () => { updatePreview(); updateExecuteBtn(); });
buildContextInput.addEventListener('input',() => { updatePreview(); updateExecuteBtn(); });

clearBtn.addEventListener('click', clearTerminal);

refreshBtn.addEventListener('click', refreshAll);

cancelBtn.addEventListener('click', hideModal);
modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) hideModal(); });

confirmBtn.addEventListener('click', () => {
  if (pendingAction) pendingAction();
  hideModal();
});

executeBtn.addEventListener('click', () => {
  const cmd       = commandSelect.value;
  const container = containerSelect.value;
  const image     = imageSelect.value;
  const manual    = manualImageInput.value.trim();
  const context   = buildContextInput.value.trim();

  if (!cmd) return;

  if (cmd === 'remove') {
    showConfirm({
      icon: '🗑️',
      title: 'Remove Container & Image?',
      body: `This will permanently stop and remove the container "${container}" and image "${image || container}". This cannot be undone.`,
      onConfirm: () => executeDockerCommand('remove', container, image || null)
    });
    return;
  }

  if (cmd === 'remove-container') {
    showConfirm({
      icon: '📦',
      title: 'Remove Container?',
      body: `This will stop and permanently remove the container "${container}". This cannot be undone.`,
      onConfirm: () => executeDockerCommand('remove-container', container, null)
    });
    return;
  }

  if (cmd === 'remove-image') {
    showConfirm({
      icon: '🖼️',
      title: 'Remove Image?',
      body: `This will permanently remove the image "${image}". This cannot be undone.`,
      onConfirm: () => executeDockerCommand('remove-image', image, null)
    });
    return;
  }

  if (cmd === 'pull') {
    executeDockerCommand('pull', manual, null);
    return;
  }

  if (cmd === 'build') {
    executeDockerCommand('build', context, manual);
    return;
  }

  // All other container commands
  if (cmd === 'stop' || cmd === 'restart') {
    showConfirm({
      icon: cmd === 'stop' ? '⏹️' : '🔄',
      title: `${cmd.charAt(0).toUpperCase() + cmd.slice(1)} Container?`,
      body: `Are you sure you want to ${cmd} the container "${container}"?`,
      onConfirm: () => executeDockerCommand(cmd, container, null)
    });
    return;
  }

  executeDockerCommand(cmd, container, null);
});

// ─── Init ───────────────────────────────────────────────────────

(async () => {
  await refreshAll();
  updateUI();
})();
