import { DOCUMENT, inject, Injectable, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';

const CHECK_EVERY_MS = 30 * 60 * 1000;

/**
 * Tells the user when a new version of the app has been downloaded by the service worker,
 * and lets them switch to it. Without this, an open tab (or installed PWA) keeps running the
 * old version until every tab is closed.
 */
@Injectable({ providedIn: 'root' })
export class UpdateService {
  private readonly sw = inject(SwUpdate);
  private readonly document = inject(DOCUMENT);

  /** A newer version is downloaded and ready to use. */
  readonly available = signal(false);

  constructor() {
    if (!this.sw.isEnabled) return; // dev server, unit tests, plain http, unsupported browser

    this.sw.versionUpdates.subscribe((e) => {
      if (e.type === 'VERSION_READY') this.available.set(true);
    });

    // The cached version can no longer be served (e.g. files deleted on the server):
    // the only safe way out is a full reload.
    this.sw.unrecoverable.subscribe(() => this.document.location.reload());

    // The worker only checks on navigation, so long-lived tabs and installed PWAs would
    // never notice a deploy. Check periodically and whenever the app comes back into view.
    const check = () => void this.sw.checkForUpdate().catch(() => undefined);
    setInterval(check, CHECK_EVERY_MS);
    this.document.addEventListener('visibilitychange', () => {
      if (this.document.visibilityState === 'visible') check();
    });
  }

  async reload(): Promise<void> {
    try {
      await this.sw.activateUpdate();
    } finally {
      this.document.location.reload();
    }
  }

  dismiss(): void {
    this.available.set(false);
  }
}
