(() => {
  'use strict';

  const state = { snapshot: null, hiddenLog: false, tourRunning: false };
  const jobsRoot = document.getElementById('job-grid');
  const toast = document.getElementById('lab-toast');

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[character]);
  }

  function showToast(message) {
    toast.textContent = message;
    toast.dataset.show = 'true';
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => { toast.dataset.show = 'false'; }, 2600);
  }

  function actionLabel(event) {
    if (event.action === 3) return event.previousContextId ? `Switched to ${event.label}` : `Clocked into ${event.label}`;
    if (event.action === 4) return `Left ${event.previousLabel || 'the current job'}`;
    if (event.action === 2) return 'Fully clocked out';
    return `Observed action ${event.action}`;
  }

  function render(snapshot) {
    if (!snapshot) return;
    state.snapshot = snapshot;
    const current = snapshot.current;
    const companyClockedIn = snapshot.companyClockedIn;
    const stateLabel = current ? `Running: ${current.label}` : companyClockedIn ? 'Clocked in — no job context' : 'Clocked out';
    document.getElementById('state-label').textContent = stateLabel;
    document.getElementById('state-dot').dataset.active = String(companyClockedIn);
    document.getElementById('metric-state').textContent = current ? 'Running' : companyClockedIn ? 'Between jobs' : 'Clocked out';
    document.getElementById('metric-detail').textContent = current?.label || 'No job selected';
    document.getElementById('metric-actions').textContent = String(snapshot.events.length);
    document.getElementById('metric-jobs').textContent = String(snapshot.jobs.length);
    const tourButton = document.querySelector('[data-lab-action="tour"]');
    if (tourButton) {
      tourButton.disabled = state.tourRunning;
      tourButton.textContent = state.tourRunning ? 'Guided tour running…' : 'Run guided job tour';
    }

    const remaining = document.getElementById('clockin-remaining-time');
    const debug = document.getElementById('clockin-debug');
    remaining.innerHTML = current
      ? `<a href="/project.php?id=${encodeURIComponent(current.projectId)}">${escapeHtml(current.label)}</a>`
      : '';
    debug.innerHTML = '';
    document.getElementById('clockin').hidden = companyClockedIn;
    document.getElementById('clockout').hidden = !companyClockedIn;
    document.querySelectorAll('[data-native-action="4"]').forEach(button => {
      button.disabled = !current || state.tourRunning;
    });
    document.querySelectorAll('[data-native-action="2"]').forEach(button => {
      button.disabled = !companyClockedIn || state.tourRunning;
    });

    const query = document.getElementById('job-search').value.trim().toLowerCase();
    jobsRoot.innerHTML = snapshot.jobs.filter(job => !query || `${job.projectId} ${job.label} ${job.department}`.toLowerCase().includes(query)).map(job => {
      const isCurrent = current?.contextId === job.contextId;
      return `<article class="lab-job-card panel" data-current="${isCurrent}" style="--job-accent:${job.color}">
        <span class="lab-job-number">${escapeHtml(job.projectId === '0' ? 'GENERAL' : job.projectId)}</span>
        <h3>${escapeHtml(job.title)}</h3>
        <p>${escapeHtml(job.department)} · ${escapeHtml(job.summary)}</p>
        <button type="button" data-native-action="3" data-project-id="${escapeHtml(job.projectId)}" data-department="${escapeHtml(job.department)}" ${isCurrent || state.tourRunning ? 'disabled' : ''}>
          ${isCurrent ? 'Currently running' : current ? 'Switch to this job' : 'Clock into fake job'}
        </button>
      </article>`;
    }).join('') || '<p>No fictional jobs match that search.</p>';

    const eventRoot = document.getElementById('event-log');
    if (state.hiddenLog || snapshot.events.length === 0) {
      eventRoot.innerHTML = `<li class="lab-empty">${state.hiddenLog ? 'The visible log was cleared. New actions will appear here.' : 'No fake clock actions yet.'}</li>`;
    } else {
      eventRoot.innerHTML = snapshot.events.slice().reverse().map(event => `<li><time>${new Date(event.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time><span>${escapeHtml(actionLabel(event))}</span></li>`).join('');
    }

    const path = location.pathname;
    const route = path.includes('dashboard') ? 'dashboard' : path.includes('project_designs') ? 'design' : path.includes('project.php') ? 'project' : path.includes('leads') ? 'leads' : path.includes('calendar') ? 'calendar' : 'home';
    const titles = { home: 'Job activity lab', dashboard: 'Fictional dashboard', project: 'Fictional project 910001', design: 'Fictional design workspace', leads: 'Fictional leads', calendar: 'Fictional calendar' };
    document.getElementById('route-title').textContent = titles[route];
    document.querySelectorAll('[data-route]').forEach(link => { link.dataset.active = String(link.dataset.route === route); });
  }

  async function refresh() {
    const response = await fetch('/__companion_lab__/api/state', { cache: 'no-store' });
    if (!response.ok) throw new Error('The local simulator state was unavailable.');
    render(await response.json());
  }

  async function nativeAction(action, payload = {}) {
    if (document.body.dataset.labBusy === 'true') return;
    document.body.dataset.labBusy = 'true';
    const parameters = new URLSearchParams({ action: String(action), ...payload });
    try {
      const response = await fetch('/ajax_time_clock.php', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body: parameters.toString()
      });
      if (!response.ok) throw new Error(`Simulator rejected action ${action}.`);
      state.hiddenLog = false;
      await refresh();
      showToast(actionLabel((await response.json()).event));
    } finally {
      document.body.dataset.labBusy = 'false';
    }
  }

  async function runTour() {
    if (state.tourRunning) return;
    state.tourRunning = true;
    document.body.dataset.labTour = 'true';
    render(state.snapshot);
    showToast('Guided tour started — five fake actions over about 12 seconds.');
    const steps = [
      [3, { project_id: '910001', department: 'Design' }],
      [3, { project_id: '910002', department: 'Fabrication' }],
      [4, {}],
      [3, { project_id: '910003', department: 'Installation' }],
      [2, {}]
    ];
    try {
      for (const [action, payload] of steps) {
        await nativeAction(action, payload);
        await new Promise(resolve => setTimeout(resolve, 2400));
      }
      showToast('Tour complete. Open Companion to inspect totals and history.');
    } finally {
      state.tourRunning = false;
      delete document.body.dataset.labTour;
      render(state.snapshot);
    }
  }

  document.addEventListener('click', event => {
    const nativeButton = event.target.closest('[data-native-action]');
    if (nativeButton) {
      if (state.tourRunning || nativeButton.disabled) return;
      void nativeAction(Number(nativeButton.dataset.nativeAction), {
        ...(nativeButton.dataset.projectId ? { project_id: nativeButton.dataset.projectId } : {}),
        ...(nativeButton.dataset.department ? { department: nativeButton.dataset.department } : {})
      }).catch(error => showToast(error.message));
      return;
    }
    const control = event.target.closest('[data-lab-action]');
    if (!control) return;
    if (control.dataset.labAction === 'tour' && !state.tourRunning) void runTour().catch(error => showToast(error.message));
    if (control.dataset.labAction === 'open-companion') {
      const companion = document.getElementById('ussign-job-timer');
      if (companion?.dataset.protoCollapsed === 'true') {
        companion.querySelector('[data-action="collapse"]')?.click();
      }
      showToast('Companion is in the lower-right corner.');
    }
    if (control.dataset.labAction === 'clear-log') {
      state.hiddenLog = true;
      render(state.snapshot);
    }
  });
  document.querySelector('[data-lab-focus="jobs"]').addEventListener('click', () => document.getElementById('jobs').scrollIntoView({ behavior: 'smooth' }));
  document.getElementById('job-search').addEventListener('input', () => render(state.snapshot));

  function setSidebarCollapsed(collapsed) {
    document.body.classList.toggle('sb-l-m', collapsed);
    const toggle = document.getElementById('toggle_sidemenu_l');
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.setAttribute('aria-label', collapsed ? 'Expand left navigation' : 'Collapse left navigation');
  }
  document.getElementById('toggle_sidemenu_l').addEventListener('click', () => setSidebarCollapsed(!document.body.classList.contains('sb-l-m')));
  document.querySelector('.sidebar-toggle-mini button').addEventListener('click', () => setSidebarCollapsed(false));

  refresh().catch(error => showToast(error.message));
  setInterval(() => refresh().catch(() => {}), 1500);
})();
