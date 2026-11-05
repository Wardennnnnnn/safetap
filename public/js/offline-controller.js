'use strict';

// The controller owns device persistence and uploads. UI callbacks keep it
// independent of page markup, NFC hardware and the database implementation.
globalThis.SafeTapOffline = {create({state, device, directory, api, ui}) {
  const {toast, showResult, updateConnectionUI, refresh, render, stopReaders, login} = ui;
  const localSet = device.set;
  const UPLOAD_DELAY = 5000;
  let uploadTimer;

  const students = () => state.pack?.userId === state.user?.id ? state.pack.students : [];
  function event() {
    if (state.online) return state.data?.active?.event || null;
    return state.pack?.userId === state.user?.id ? state.pack?.event || null : null;
  }

  async function updateQueue(change) {
    state.queue = await device.update('queue', rows => change(rows || []));
    return state.queue;
  }

  function scheduleUpload() {
    if (uploadTimer || !state.online || !navigator.onLine) return;
    uploadTimer = setTimeout(() => {
      uploadTimer = null;
      syncQueue().catch(error => toast(error.message));
    }, UPLOAD_DELAY);
  }

  async function record(input) {
    if (state.busy) return;
    state.busy = true;
    try {
      const activeEvent = event();
      if (!activeEvent) throw new Error('Connect and download an active event before scanning.');
      if (!state.pack || state.pack.userId !== state.user.id) throw new Error('Connect once to save student IDs on this phone before scanning.');
      const student = directory.resolve(students(), input);
      if (!student) throw new Error('ID not found in the downloaded student list. Update the list while connected.');
      if (state.data?.active?.event.id === activeEvent.id && state.data.active.people.some(person => person.studentId === student.id && person.safe)) {
        showResult('Already recorded · counted once', '', student.name);
        return;
      }
      const scan = {
        ...input,
        studentId: student.id,
        submissionId: crypto.randomUUID(),
        eventId: activeEvent.id,
        capturedAt: new Date().toISOString(),
        ownerId: state.user.id,
        name: student.name
      };
      let duplicate = false;
      try {
        await updateQueue(rows => {
          if (rows.some(row => row.ownerId !== state.user.id)) throw new Error('Sign in with the account that saved these records.');
          duplicate = rows.some(row => row.eventId === scan.eventId && row.studentId === student.id && !row.error);
          return duplicate ? rows : [...rows, scan];
        });
      } catch (error) {
        throw new Error(`This phone could not save the scan. ${error.message || 'Allow site storage and try again.'}`);
      }
      showResult(duplicate ? 'Already recorded on this phone · counted once' : 'Saved on this device', 'pending', student.name);
      scheduleUpload();
    } catch (error) {
      showResult(error.message, 'error');
    } finally {
      state.busy = false;
      ui.updateQueueUI();
      updateConnectionUI();
    }
  }

  async function syncQueue() {
    if (syncQueue.running || !state.user || !navigator.onLine) return;
    syncQueue.running = true;
    clearTimeout(uploadTimer);
    uploadTimer = null;
    const ownerId = state.user.id;
    let accepted = 0, rejected = 0, review = 0;
    try {
      await updateQueue(rows => rows);
      if (!state.queue.length) return;
      // Refresh cookie/CSRF once per upload cycle, never once per scanned ID.
      const auth = await api('/me');
      if (auth.user.id !== ownerId) throw Object.assign(new Error('Sign in with the account that saved these records.'), {status: 401});
      state.csrf = auth.csrf;
      await updateQueue(rows => rows.map(row => {
        if (row.ownerId === ownerId && (/^Session verification failed\./.test(row.error || '') ||
          row.error === 'Please refresh and sign in again. Your saved scans will stay on this phone.')) {
          const {error, ...retry} = row;
          return retry;
        }
        return row;
      }));
      while (state.user?.id === ownerId) {
        const scans = state.queue.filter(row => row.ownerId === ownerId && !row.error).slice(0, 100);
        if (!scans.length) break;
        const {results} = await api('/sync', {scans});
        const sentIds = new Set(scans.map(scan => scan.submissionId));
        const acknowledged = new Map(results.filter(result => sentIds.has(result.submissionId) &&
          ['confirmed', 'duplicate', 'review', 'rejected'].includes(result.status)).map(result => [result.submissionId, result]));
        if (!acknowledged.size) throw new Error('Upload was not confirmed. Saved records will retry with the same IDs.');
        await updateQueue(rows => rows.flatMap(row => {
          const result = acknowledged.get(row.submissionId);
          if (!result) return [row];
          return result.status === 'rejected' ? [{...row, error: result.error || 'Record needs review.'}] : [];
        }));
        accepted += [...acknowledged.values()].filter(result => result.status !== 'rejected').length;
        rejected += [...acknowledged.values()].filter(result => result.status === 'rejected').length;
        review += [...acknowledged.values()].filter(result => result.status === 'review').length;
        // A partial response is retried on the next cycle, avoiding a tight loop.
        if (acknowledged.size < scans.length) break;
      }
      if (accepted || rejected) {
        if (state.page !== 'scanner') showResult(`${accepted} saved to server or already recorded · ${review} waiting for administrator approval · ${rejected} need attention.`, rejected ? 'error' : '');
        toast(`Sync: ${accepted} saved or already recorded · ${review} awaiting review · ${rejected} need attention.`);
        // A failed dashboard refresh must not turn an acknowledged upload into
        // an apparent failure or put committed records back into the queue.
        await refresh(false).catch(() => {});
        if (state.user && state.page !== 'scanner') render();
      }
    } catch (error) {
      if (error.status === 401) {
        state.csrf = null;
        state.user = null;
        await stopReaders();
        login();
        toast('Sign in again to upload. Saved scans are still on this phone.');
      } else if (error.status === 403) state.csrf = null;
      throw error;
    } finally {
      syncQueue.running = false;
      ui.updateQueueUI();
      updateConnectionUI();
    }
  }

  async function saveOfflinePack() {
    if (!state.user || !state.online) return;
    const ownerId = state.user.id;
    const version = state.data.offlineDirectoryVersion || state.data.directoryVersion;
    let pack;
    if (state.pack?.userId === ownerId && version && state.pack.version === version) {
      // Headcounts change often; the full student download changes only when
      // names, blocks, active status or credentials change.
      const currentEvent = state.data.active?.event || null;
      if (JSON.stringify(state.pack.event) === JSON.stringify(currentEvent)) {
        cacheOfflineAssets().catch(error => { state.offlineError = error.message; updateConnectionUI(); });
        return;
      }
      pack = {...state.pack, event: currentEvent};
    } else {
      const knownVersion = state.pack?.userId === ownerId ? state.pack.version : null;
      const downloaded = await api('/offline' + (knownVersion ? '?version=' + encodeURIComponent(knownVersion) : ''));
      pack = downloaded.unchanged ? {...state.pack, ...downloaded} : downloaded;
    }
    if (state.user?.id !== ownerId || pack.userId !== ownerId) return;
    await localSet('pack', pack);
    state.pack = pack;
    state.offlineError = '';
    updateConnectionUI();
    cacheOfflineAssets().catch(error => { state.offlineError = error.message; updateConnectionUI(); });
  }

  async function prepare() {
    await saveOfflinePack();
    await cacheOfflineAssets();
    toast('Student IDs and scanner assets saved on this phone.' + (state.pack?.event ? ' Event ready for offline scanning.' : 'Connect again when an event starts.'));
    render();
  }
  async function cacheOfflineAssets() {
    if (state.offlineAssets) return;
    if (cacheOfflineAssets.running) return cacheOfflineAssets.running;
    cacheOfflineAssets.running = (async () => {
      if (!('serviceWorker' in navigator) || !window.isSecureContext) throw new Error('Offline preparation requires HTTPS (or localhost) and service-worker support.');
      await navigator.serviceWorker.register('/sw.js');
      await Promise.race([navigator.serviceWorker.ready, new Promise((_, reject) => setTimeout(() => reject(new Error('Offline shell is not ready. Reload on a secure connection and retry.')), 10000))]);
      if (state.config.qrAvailable) {
        const response = await fetch('/vendor/manifest.json');
        if (!response.ok) throw new Error('Vendor manifest missing. Run npm run vendor on the server.');
        const files = await response.json();
        const cache = await caches.open('safetap-vendor-v1');
        for (const file of files) if (!await cache.match(file)) await cache.add(file);
      }
      state.offlineAssets = true;
      state.offlineError = '';
      if (navigator.storage?.persist) await navigator.storage.persist().catch(() => {});
      updateConnectionUI();
    })();
    try { await cacheOfflineAssets.running; } finally { cacheOfflineAssets.running = null; }
  }

  return {record, syncQueue, updateQueue, saveOfflinePack, cacheOfflineAssets, prepare, students, event};
}};
