import { TestBed } from '@angular/core/testing';
import { SwUpdate, VersionEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { UpdateService } from './update.service';

const setup = (isEnabled: boolean) => {
  const versionUpdates = new Subject<VersionEvent>();
  const sw = {
    isEnabled,
    versionUpdates,
    unrecoverable: new Subject(),
    checkForUpdate: () => Promise.resolve(false),
    activateUpdate: () => Promise.resolve(true),
  };
  TestBed.configureTestingModule({ providers: [{ provide: SwUpdate, useValue: sw }] });
  return { service: TestBed.inject(UpdateService), versionUpdates };
};

const version = { hash: 'x', appData: {} };

describe('UpdateService', () => {
  it('flags an update when a new version is ready', () => {
    const { service, versionUpdates } = setup(true);
    versionUpdates.next({ type: 'VERSION_DETECTED', version });
    expect(service.available()).toBe(false);
    versionUpdates.next({ type: 'VERSION_READY', currentVersion: version, latestVersion: { ...version, hash: 'y' } });
    expect(service.available()).toBe(true);
    service.dismiss();
    expect(service.available()).toBe(false);
  });

  it('does nothing when the service worker is disabled', () => {
    const { service, versionUpdates } = setup(false);
    versionUpdates.next({ type: 'VERSION_READY', currentVersion: version, latestVersion: version });
    expect(service.available()).toBe(false);
  });
});
