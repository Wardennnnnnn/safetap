'use strict';

globalThis.SafeTapAssets = (() => {
  const loading = new Map();

  function loadScript(source) {
    if (loading.has(source)) return loading.get(source);
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = source;
      script.dataset.src = source;
      script.onload = resolve;
      script.onerror = () => {
        loading.delete(source);
        script.remove();
        reject(new Error('A browser component could not load. Reconnect and try again.'));
      };
      document.head.append(script);
    });
    loading.set(source, promise);
    return promise;
  }

  return {loadScript};
})();
