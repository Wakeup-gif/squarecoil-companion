// ==UserScript==
// @name         US Sign - SquareCoil Quick Clock
// @namespace    us-sign-local-tools
// @version      0.2.0
// @description  Designer-focused SquareCoil quick clock modal plus one-click project Design/CAD clock buttons.
// @match        https://ussignandmill.squarecoil.net/*
// @run-at       document-idle
// @noframes
// @homepageURL  https://github.com/Wakeup-gif/test_repo
// @source       https://github.com/Wakeup-gif/test_repo/blob/main/tampermonkey/US-Sign-SquareCoil-Quick-Clock.user.js
// @updateURL    https://raw.githubusercontent.com/Wakeup-gif/test_repo/main/tampermonkey/US-Sign-SquareCoil-Quick-Clock.user.js
// @downloadURL  https://raw.githubusercontent.com/Wakeup-gif/test_repo/main/tampermonkey/US-Sign-SquareCoil-Quick-Clock.user.js
// ==/UserScript==

(() => {
  'use strict';

  const VERSION = '0.2.0';
  const ROOT_ID = 'us-sign-quick-clock';
  const OPEN_ID = 'us-sign-quick-clock-open';
  const PROJECT_HOST_ID = 'us-sign-project-quick-clock';
  const STYLE_ID = 'us-sign-quick-clock-style';
  const PREF_KEY = 'us-sign-quick-clock-preferences-v1';
  const ENDPOINT = '/ajax_time_clock.php';
  const NOTES_ENDPOINT = '/ajax_time_clock_notes.php';

  const MODES = Object.freeze({
    design: { label: 'Design', department: '47', requiresJob: true, note: '', verify: /\bdesign\b/i },
    cad: { label: 'CAD / Shop Drawings', department: '29', requiresJob: true, note: '', verify: /file writing|cad|shop drawing/i },
    switching: { label: 'Switching Jobs', department: 'labor_code_7', requiresJob: false, note: 'Switching between jobs' },
    assets: { label: 'Asset Creation', department: 'labor_code_7', requiresJob: false, note: 'Asset creation & organization' },
    research: { label: 'Research', department: 'labor_code_7', requiresJob: false, note: 'Research' },
    productionCheck: { label: 'Production Check', department: 'labor_code_7', requiresJob: false, note: 'Checking production progress on the shop floor' },
    meeting: { label: 'Meeting', department: 'labor_code_5', requiresJob: false, note: '' },
    training: { label: 'Training', department: 'labor_code_6', requiresJob: false, note: '' }
  });

  const state = {
    open: false,
    submitting: false,
    selectedMode: 'cad',
    materialEntered: true,
    currentContext: null,
    currentProjectId: '',
    modalRoot: null
  };

  const clean = value => String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function readPrefs() {
    try {
      const pref = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
      if (MODES[pref.selectedMode]) state.selectedMode = pref.selectedMode;
      if (typeof pref.materialEntered === 'boolean') state.materialEntered = pref.materialEntered;
    } catch (_) {}
  }

  function writePrefs() {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify({
        selectedMode: state.selectedMode,
        materialEntered: state.materialEntered
      }));
    } catch (_) {}
  }

  function currentProjectId(nativeButton = null) {
    const buttonId = nativeButton?.dataset?.id;
    if (/^\d{5,}$/.test(buttonId || '')) return buttonId;
    const urlId = new URL(location.href).searchParams.get('id');
    if (/^\d{5,}$/.test(urlId || '')) return urlId;
    const hidden = document.querySelector('#plt-project-id')?.value;
    if (/^\d{5,}$/.test(hidden || '')) return hidden;
    return clean(document.querySelector('#pmlt')?.innerText).match(/\b(\d{6})\b/)?.[1] || '';
  }

  async function post(data, endpoint = ENDPOINT) {
    const response = await fetch(endpoint, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: new URLSearchParams(Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v ?? '')])))
    });
    return { ok: response.ok, status: response.status, text: await response.text() };
  }

  function parseClockContext(html) {
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    const label = clean(doc.body?.textContent);
    const href = [...doc.querySelectorAll('a[href]')]
      .map(a => a.getAttribute('href') || '')
      .find(value => /project\.php\?id=\d+/i.test(value));
    const projectId = href?.match(/project\.php\?id=(\d+)/i)?.[1] || '';

    if (/Production\s*\(General\)/i.test(label)) return { type: 'general', general: 'production-general', label };
    if (/\bMeeting\b/i.test(label)) return { type: 'general', general: 'meeting', label };
    if (/\bTraining\b/i.test(label)) return { type: 'general', general: 'training', label };
    if (projectId && projectId !== '0') return { type: 'job', projectId, label };

    const clockIn = document.querySelector('#clockin');
    const clockOut = document.querySelector('#clockout');
    const clockInVisible = clockIn && getComputedStyle(clockIn).display !== 'none';
    const clockOutVisible = clockOut && getComputedStyle(clockOut).display !== 'none';
    if (clockInVisible && !clockOutVisible) return { type: 'clocked-out', label: 'Clocked out' };
    return { type: 'unknown', label: label || 'Unknown' };
  }

  async function readCurrentContext() {
    const result = await post({ action: 7 });
    if (!result.ok) throw new Error('Couldn’t read current clock state');
    state.currentContext = parseClockContext(result.text);
    return state.currentContext;
  }

  async function validateTarget(target) {
    const result = await post({
      action: 15,
      project: target.requiresJob ? target.project : '',
      department: target.department
    });
    if (!result.ok) throw new Error('Validation failed');
    const code = clean(result.text);
    if (code !== '1') throw new Error(code === '2' ? 'Job # is required or not valid' : `SquareCoil blocked this clock-in (${code || 'unknown'})`);
  }

  async function saveNotes(note) {
    if (!note) return;
    const result = await post({ action: 1, notes: note }, NOTES_ENDPOINT);
    if (!result.ok) throw new Error('Couldn’t save clock-in note');
  }

  async function sendClockIn(target) {
    const result = await post({
      action: 3,
      project: target.requiresJob ? target.project : '',
      department: target.department,
      notes: target.note || ''
    });
    if (!result.ok) throw new Error('Clock-in request failed');
  }

  function contextMatchesTarget(context, target) {
    if (!context || !target) return false;
    if (target.requiresJob) {
      return context.type === 'job' &&
        String(context.projectId) === String(target.project) &&
        target.verify.test(clean(context.label));
    }
    if (target.department === 'labor_code_7') return context.type === 'general' && context.general === 'production-general';
    if (target.department === 'labor_code_5') return context.type === 'general' && context.general === 'meeting';
    if (target.department === 'labor_code_6') return context.type === 'general' && context.general === 'training';
    return false;
  }

  async function verifyTarget(target) {
    for (let i = 0; i < 8; i++) {
      if (i) await sleep(250);
      const context = await readCurrentContext();
      if (contextMatchesTarget(context, target)) return context;
    }
    throw new Error('Couldn’t verify clock-in');
  }

  function makeTarget(mode, jobValue) {
    const base = MODES[mode];
    if (!base) throw new Error('Choose a clock target');
    const project = base.requiresJob ? clean(jobValue) : '';
    if (base.requiresJob && !/^\d{5,}$/.test(project)) throw new Error('Enter a job #');
    return { ...base, project };
  }

  async function executeClockIn(target, status) {
    const before = await readCurrentContext();
    if (contextMatchesTarget(before, target)) return 'already';
    await validateTarget(target);
    if (!state.materialEntered && before?.type === 'job') throw new Error('Material entry is not complete');
    if (target.note) await saveNotes(target.note);
    if (status) status('Clocking…');
    await sendClockIn(target);
    if (status) status('Verifying…');
    const after = await verifyTarget(target);
    state.currentContext = after;
    return 'clocked';
  }

  function renderCurrentContext() {
    const el = state.modalRoot?.querySelector('.us-qc-current');
    if (!el) return;
    const c = state.currentContext;
    if (!c) return void (el.textContent = 'Reading current clock…');
    if (c.type === 'job') return void (el.textContent = `${c.projectId} · ${clean(c.label).slice(0, 72)}`);
    el.textContent = c.label || 'Clocked out';
  }

  function setModalBusy(value) {
    const root = state.modalRoot;
    if (!root) return;
    root.querySelectorAll('button,input').forEach(el => {
      if (!el.classList.contains('us-qc-close')) el.disabled = value;
    });
    const submit = root.querySelector('[data-action="clock-in"]');
    if (submit) submit.textContent = value ? 'Clocking…' : 'Clock In';
  }

  async function modalClockIn() {
    if (state.submitting || !state.modalRoot) return;
    const root = state.modalRoot;
    const status = root.querySelector('.us-qc-status');
    let target;
    try {
      target = makeTarget(state.selectedMode, root.querySelector('#us-qc-job')?.value);
    } catch (error) {
      status.textContent = error.message;
      return;
    }
    state.submitting = true;
    setModalBusy(true);
    try {
      status.textContent = 'Checking…';
      const result = await executeClockIn(target, text => { status.textContent = text; });
      status.textContent = result === 'already' ? 'Already clocked in' : 'Clocked in';
      renderCurrentContext();
      writePrefs();
      if (result === 'clocked') setTimeout(closeModal, 650);
    } catch (error) {
      console.error('[Quick Clock]', error);
      status.textContent = error?.message || 'Clock-in failed';
    } finally {
      state.submitting = false;
      setModalBusy(false);
    }
  }

  async function modalClockOut() {
    if (state.submitting || !state.modalRoot) return;
    const root = state.modalRoot;
    const button = root.querySelector('[data-action="clock-out"]');
    const status = root.querySelector('.us-qc-status');
    if (button.dataset.confirm !== '1') {
      button.dataset.confirm = '1';
      button.textContent = 'Confirm Out';
      status.textContent = 'Confirm full clock out';
      return;
    }
    state.submitting = true;
    setModalBusy(true);
    try {
      status.textContent = 'Clocking out…';
      const result = await post({ action: 2 });
      if (!result.ok) throw new Error('Clock-out request failed');
      await sleep(200);
      const context = await readCurrentContext();
      if (context.type !== 'clocked-out') throw new Error('Couldn’t verify clock-out');
      status.textContent = 'Clocked out';
      renderCurrentContext();
      setTimeout(closeModal, 650);
    } catch (error) {
      console.error('[Quick Clock]', error);
      status.textContent = error?.message || 'Clock-out failed';
    } finally {
      button.dataset.confirm = '0';
      button.textContent = 'Clock Out';
      state.submitting = false;
      setModalBusy(false);
    }
  }

  function updateModalUI() {
    const root = state.modalRoot;
    if (!root) return;
    root.querySelectorAll('[data-mode]').forEach(btn => btn.setAttribute('aria-pressed', String(btn.dataset.mode === state.selectedMode)));
    root.querySelectorAll('[data-material]').forEach(btn => btn.setAttribute('aria-pressed', String((btn.dataset.material === 'yes') === state.materialEntered)));
    const job = root.querySelector('#us-qc-job');
    const needsJob = MODES[state.selectedMode].requiresJob;
    job.disabled = !needsJob;
    if (needsJob && !job.value) job.value = state.currentProjectId || '';
  }

  function buildModal() {
    const overlay = document.createElement('div');
    overlay.id = ROOT_ID;
    overlay.innerHTML = `<section class="us-qc-panel" role="dialog" aria-modal="true"><div class="us-qc-head"><div><div class="us-qc-title">Quick Clock</div><div class="us-qc-current">Reading current clock…</div></div><button class="us-qc-close" type="button">×</button></div><div class="us-qc-grid"><button class="us-qc-target" data-mode="design">Design</button><button class="us-qc-target" data-mode="cad">CAD / Shop Drawings</button></div><div class="us-qc-section"><div class="us-qc-section-label">Production</div><div class="us-qc-grid"><button class="us-qc-target" data-mode="switching">Switching Jobs</button><button class="us-qc-target" data-mode="assets">Asset Creation</button><button class="us-qc-target" data-mode="research">Research</button><button class="us-qc-target" data-mode="productionCheck">Production Check</button></div></div><div class="us-qc-section us-qc-grid"><button class="us-qc-target" data-mode="meeting">Meeting</button><button class="us-qc-target" data-mode="training">Training</button></div><div class="us-qc-bottom"><label>Job #</label><input id="us-qc-job" inputmode="numeric" autocomplete="off"><div class="us-qc-material"><span>Material entered</span><div><button data-material="yes">Yes</button><button data-material="no">No</button></div></div><div class="us-qc-footer"><button data-action="cancel">Cancel</button><button data-action="clock-in">Clock In</button><button data-action="clock-out">Clock Out</button></div><div class="us-qc-status"></div></div></section>`;
    document.body.appendChild(overlay);
    state.modalRoot = overlay;
    state.currentProjectId = currentProjectId();
    const job = overlay.querySelector('#us-qc-job');
    if (state.currentProjectId) job.value = state.currentProjectId;
    overlay.querySelector('.us-qc-close').onclick = closeModal;
    overlay.querySelector('[data-action="cancel"]').onclick = closeModal;
    overlay.querySelector('[data-action="clock-in"]').onclick = modalClockIn;
    overlay.querySelector('[data-action="clock-out"]').onclick = modalClockOut;
    overlay.querySelectorAll('[data-mode]').forEach(btn => btn.onclick = () => {
      state.selectedMode = btn.dataset.mode;
      writePrefs();
      updateModalUI();
    });
    overlay.querySelectorAll('[data-material]').forEach(btn => btn.onclick = () => {
      state.materialEntered = btn.dataset.material === 'yes';
      writePrefs();
      updateModalUI();
    });
    overlay.onmousedown = e => { if (e.target === overlay) closeModal(); };
    updateModalUI();
  }

  async function openModal() {
    if (state.open) return;
    state.open = true;
    buildModal();
    try {
      await readCurrentContext();
      renderCurrentContext();
    } catch (error) {
      state.modalRoot.querySelector('.us-qc-status').textContent = 'Couldn’t read current clock';
    }
  }

  function closeModal() {
    state.open = false;
    state.submitting = false;
    state.modalRoot?.remove();
    state.modalRoot = null;
  }

  function findProjectClockButton() {
    const exact = document.querySelector('#time-clock-clock-in-to-project-from-project');
    if (exact) return exact;
    const rail = document.querySelector('#pmlt') || document.querySelector('#sidebar_left');
    if (!rail) return null;
    return [...rail.querySelectorAll('a,button')].find(el => clean(el.textContent).toUpperCase() === 'CLOCK IN') || null;
  }

  function flashProjectButton(button, text, error = false) {
    const original = button.dataset.original || button.textContent;
    button.dataset.original = original;
    button.textContent = text;
    button.classList.toggle('us-qc-error', error);
    setTimeout(() => {
      if (!button.isConnected) return;
      button.textContent = original;
      button.classList.remove('us-qc-error');
    }, 1400);
  }

  async function projectQuickClock(mode, button, nativeButton) {
    if (state.submitting) return;
    const project = currentProjectId(nativeButton);
    if (!project) return flashProjectButton(button, 'NO JOB #', true);
    const target = makeTarget(mode, project);
    state.submitting = true;
    const host = document.getElementById(PROJECT_HOST_ID);
    host?.querySelectorAll('button').forEach(b => b.disabled = true);
    button.textContent = 'CLOCKING…';
    try {
      const result = await executeClockIn(target);
      flashProjectButton(button, result === 'already' ? 'ALREADY CLOCKED' : 'CLOCKED IN');
    } catch (error) {
      console.error('[Quick Clock Project]', error);
      flashProjectButton(button, clean(error?.message || 'FAILED').toUpperCase(), true);
    } finally {
      state.submitting = false;
      host?.querySelectorAll('button').forEach(b => b.disabled = false);
    }
  }

  function installProjectButtons() {
    if (document.getElementById(PROJECT_HOST_ID)) return;
    const native = findProjectClockButton();
    if (!native || !currentProjectId(native)) return;
    const host = document.createElement('div');
    host.id = PROJECT_HOST_ID;
    [['design','DESIGN CLOCK IN'],['cad','FILE WRITE / CAD']].forEach(([mode,label]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'us-qc-project-btn';
      button.textContent = label;
      button.dataset.original = label;
      button.onclick = e => {
        e.preventDefault();
        e.stopPropagation();
        projectQuickClock(mode, button, native);
      };
      host.appendChild(button);
    });
    native.insertAdjacentElement('afterend', host);
    native.style.setProperty('display', 'none', 'important');
  }

  function installOpenButton() {
    if (document.getElementById(OPEN_ID)) return;
    const anchor = document.querySelector('#clockout') || document.querySelector('#clockin') || document.querySelector('.timeclock-container');
    if (!anchor) return;
    const button = document.createElement('button');
    button.id = OPEN_ID;
    button.type = 'button';
    button.textContent = 'Quick Clock';
    button.onclick = openModal;
    anchor.insertAdjacentElement('afterend', button);
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${OPEN_ID}{margin-left:8px!important;height:34px!important;padding:0 11px!important;border:1px solid rgba(185,205,220,.18)!important;border-radius:8px!important;background:rgba(7,13,18,.34)!important;color:rgba(232,239,244,.9)!important;backdrop-filter:blur(12px)!important;font:600 12px/1 Manrope,"Segoe UI",Arial,sans-serif!important;cursor:pointer!important}
      #${PROJECT_HOST_ID}{display:grid!important;grid-template-columns:1fr!important;gap:6px!important;width:100%!important;margin-top:8px!important}
      #${PROJECT_HOST_ID} .us-qc-project-btn{width:100%!important;min-height:36px!important;padding:7px 10px!important;border:1px solid rgba(180,204,222,.18)!important;border-radius:7px!important;background:rgba(8,15,21,.52)!important;color:rgba(230,239,245,.92)!important;backdrop-filter:blur(12px)!important;font:700 11px/1.15 Manrope,"Segoe UI",Arial,sans-serif!important;cursor:pointer!important}
      #${PROJECT_HOST_ID} .us-qc-project-btn:hover{background:rgba(255,255,255,.052)!important;border-color:rgba(195,216,230,.28)!important}#${PROJECT_HOST_ID} .us-qc-project-btn.us-qc-error{border-color:rgba(189,105,105,.35)!important;color:rgba(239,194,194,.92)!important}
      #${ROOT_ID}{position:fixed!important;inset:0!important;z-index:2147483000!important;display:grid!important;place-items:center!important;padding:20px!important;background:rgba(2,7,11,.44)!important;backdrop-filter:blur(8px)!important}#${ROOT_ID} *{box-sizing:border-box!important}
      #${ROOT_ID} .us-qc-panel{width:min(520px,calc(100vw - 28px))!important;padding:14px!important;border:1px solid rgba(190,211,228,.24)!important;border-radius:15px!important;background:linear-gradient(180deg,rgba(255,255,255,.025),rgba(255,255,255,.006)),rgba(10,17,23,.74)!important;color:rgba(239,245,249,.94)!important;box-shadow:0 22px 70px rgba(0,0,0,.34)!important;backdrop-filter:blur(22px) saturate(118%)!important;font-family:Manrope,"Segoe UI",Arial,sans-serif!important}
      #${ROOT_ID} .us-qc-head{display:flex!important;justify-content:space-between!important;gap:12px!important;margin-bottom:10px!important}#${ROOT_ID} .us-qc-title{font-size:17px!important;font-weight:700!important}#${ROOT_ID} .us-qc-current{margin-top:3px!important;max-width:410px!important;overflow:hidden!important;white-space:nowrap!important;text-overflow:ellipsis!important;color:rgba(205,220,230,.62)!important;font-size:10.5px!important}#${ROOT_ID} .us-qc-close{width:30px!important;height:30px!important;border:1px solid rgba(190,211,228,.15)!important;border-radius:8px!important;background:rgba(255,255,255,.022)!important;color:rgba(210,223,232,.68)!important;font-size:18px!important}
      #${ROOT_ID} .us-qc-grid{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:6px!important}#${ROOT_ID} .us-qc-section{margin-top:9px!important}#${ROOT_ID} .us-qc-section-label{display:flex!important;align-items:center!important;gap:8px!important;margin:0 0 5px!important;color:rgba(205,219,230,.52)!important;font-size:9px!important;font-weight:700!important;letter-spacing:.09em!important;text-transform:uppercase!important}#${ROOT_ID} .us-qc-section-label:after{content:""!important;height:1px!important;flex:1!important;background:rgba(190,211,228,.10)!important}
      #${ROOT_ID} .us-qc-target{min-height:38px!important;padding:7px 10px!important;border:1px solid rgba(190,211,228,.13)!important;border-radius:8px!important;background:rgba(2,7,11,.38)!important;color:rgba(233,241,246,.9)!important;text-align:left!important;font-size:11.5px!important;font-weight:650!important}#${ROOT_ID} .us-qc-target[aria-pressed="true"]{background:rgba(112,157,188,.12)!important;border-color:rgba(152,191,216,.40)!important}
      #${ROOT_ID} .us-qc-bottom{margin-top:11px!important;padding-top:10px!important;border-top:1px solid rgba(190,211,228,.11)!important}#${ROOT_ID} .us-qc-bottom>label{display:block!important;margin-bottom:4px!important;font-size:10px!important;font-weight:650!important}#${ROOT_ID} #us-qc-job{width:100%!important;height:38px!important;padding:0 10px!important;border:1px solid rgba(190,211,228,.15)!important;border-radius:8px!important;background:rgba(0,5,9,.42)!important;color:rgba(240,246,249,.94)!important;font-size:14px!important}
      #${ROOT_ID} .us-qc-material{height:38px!important;margin-top:6px!important;padding:4px 5px 4px 10px!important;display:flex!important;align-items:center!important;justify-content:space-between!important;border:1px solid rgba(190,211,228,.12)!important;border-radius:8px!important;background:rgba(255,255,255,.016)!important;color:rgba(211,223,231,.70)!important;font-size:10.5px!important}#${ROOT_ID} .us-qc-material button{min-width:48px!important;height:27px!important;border:1px solid transparent!important;border-radius:6px!important;background:transparent!important;color:rgba(204,217,227,.62)!important;font-size:10px!important;font-weight:700!important}#${ROOT_ID} .us-qc-material button[aria-pressed="true"]{border-color:rgba(147,194,166,.24)!important;background:rgba(130,171,149,.11)!important;color:rgba(224,239,230,.92)!important}
      #${ROOT_ID} .us-qc-footer{display:grid!important;grid-template-columns:.8fr 1.25fr .9fr!important;gap:6px!important;margin-top:8px!important}#${ROOT_ID} .us-qc-footer button{height:38px!important;border:1px solid rgba(190,211,228,.14)!important;border-radius:8px!important;background:rgba(255,255,255,.016)!important;color:rgba(230,239,245,.88)!important;font-size:11px!important;font-weight:700!important}#${ROOT_ID} [data-action="clock-in"]{background:rgba(112,151,177,.14)!important;border-color:rgba(142,182,207,.26)!important}#${ROOT_ID} [data-action="clock-out"]{background:rgba(161,88,88,.075)!important;border-color:rgba(183,111,111,.19)!important;color:rgba(232,198,198,.87)!important}#${ROOT_ID} .us-qc-status{min-height:14px!important;margin-top:5px!important;text-align:center!important;color:rgba(202,216,226,.58)!important;font-size:9px!important}
    `;
    document.head.appendChild(style);
  }

  function init() {
    readPrefs();
    installStyles();
    installOpenButton();
    installProjectButtons();
    const observer = new MutationObserver(() => {
      installOpenButton();
      installProjectButtons();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.__usSignQuickClock = Object.freeze({ version: VERSION, open: openModal, close: closeModal });
  }

  init();
})();
