/*
 * Registers the service worker (dist/sw.js, built by
 * scripts/service-worker.ts), so the app works offline after the first load.
 * Only in production builds: the dev server has no sw.js.
 *
 * A new version installs in the background and waits. `onUpdate` lets the
 * app show a notice; `applyUpdate` lets the waiting version take over and
 * reloads once it has.
 */

let waiting: ServiceWorker | null = null;

export function registerServiceWorker(onUpdate: () => void): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const container = navigator.serviceWorker;
  const found = (worker: ServiceWorker | null) => {
    // Without a controller this is the first install, not an update.
    if (!worker || !container.controller) return;
    waiting = worker;
    onUpdate();
  };
  container
    .register('./sw.js', { scope: './' })
    .then((registration) => {
      found(registration.waiting);
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed') found(worker);
        });
      });
    })
    .catch(() => {
      // Without a service worker the app still works, only not offline.
    });
}

export function applyUpdate(): void {
  if (!waiting) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
  waiting.postMessage('skip-waiting');
}
