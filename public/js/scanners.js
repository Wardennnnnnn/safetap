'use strict';

// Hardware and vendor libraries stay here; scanned arrivals go through the
// offline controller, exactly like manual confirmation.
globalThis.SafeTapScanners = {create({state, currentEvent, record, ui}) {
  const {$, icon, showResult} = ui;
  const {loadScript} = SafeTapAssets;
  async function stopReaders() {
    state.nfcController?.abort();
    state.nfcController = null;
    state.nfcState = 'idle';
    updateNfcUI();
    if (state.scanner) {
      try {
        await state.scanner.stop();
        state.scanner.clear();
      } catch {}
      state.scanner = null;
    }
  }
  async function startQr() {
    await stopReaders();
    await loadScript('/vendor/html5-qrcode.min.js');
    state.scanner = new Html5Qrcode('camera');
    let last = '',
      time = 0;
    await state.scanner.start({
      facingMode: 'environment'
    }, {
      fps: 8,
      qrbox: {
        width: 220,
        height: 220
      }
    }, value => {
      if (value === last && Date.now() - time < 4000) return;
      last = value;
      time = Date.now();
      record({
        method: 'qr',
        credential: value
      });
    }, () => {});
  }
  function updateNfcUI() {
    const start = $('[data-action="nfc"]');
    const stop = $('#stop-reader');
    if (start) {
      start.hidden = state.nfcState === 'reading';
      start.disabled = state.nfcState !== 'idle' || !(currentEvent());
      start.innerHTML = icon('nfc') + (state.nfcState === 'starting' ? 'Starting reader…' : state.nfcState === 'reading' ? 'NFC reader is on' : 'Start NFC scan');
    }
    if (stop) {
      stop.hidden = state.nfcState === 'idle';
      stop.disabled = state.nfcState === 'idle';
    }
    const status = $('#reader-status');
    if (status) status.textContent = state.nfcState === 'reading' ? 'NFC reader on' : state.nfcState === 'starting' ? 'Starting NFC…' : 'NFC reader off';
  }
  async function startNfc() {
    if (!('NDEFReader' in window)) return showResult('NFC scanning is not available in this browser. Use Android Chrome with NFC switched on, or choose QR code or Search.', 'error');
    if (!(currentEvent())) return showResult('Start an evacuation or download an active event before scanning.', 'error');
    await stopReaders();
    const controller = new AbortController();
    state.nfcController = controller;
    state.nfcState = 'starting';
    updateNfcUI();
    try {
      const reader = new NDEFReader();
      let lastUid = '', lastReadAt = 0;
      reader.onreading = event => {
        if (controller.signal.aborted || state.page !== 'scanner' || state.method !== 'nfc') return;
        const uid = String(event.serialNumber || '').replace(/[:\s-]/g, '').toUpperCase();
        if (!uid || !/^[0-9A-F]{4,40}$/.test(uid) || uid.length % 2 !== 0) return showResult('The phone could not read this ID number. Try again, or use QR code or Search.', 'error');
        if (uid === lastUid && Date.now() - lastReadAt < 2000) return;
        lastUid = uid;
        lastReadAt = Date.now();
        record({method:'nfc', credential:uid});
      };
      reader.onreadingerror = () => {
        if (!controller.signal.aborted) showResult('Could not read the ID. Hold it still near the phone and try again.', 'error');
      };
      await reader.scan({signal: controller.signal});
      if (controller.signal.aborted) return;
      state.nfcState = 'reading';
      updateNfcUI();
    } catch (e) {
      if (controller.signal.aborted) return;
      state.nfcController = null;
      state.nfcState = 'idle';
      updateNfcUI();
      showResult(e.name === 'NotAllowedError' ? 'NFC permission was denied. Allow NFC for this site, then try again.' : 'The NFC reader could not start. Check that NFC is switched on and try again.', 'error');
    }
  }
  return {stopReaders, startQr, startNfc, updateNfcUI};
}};
