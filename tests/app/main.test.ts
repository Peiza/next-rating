// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEY } from '../../src/app/storage';
import { encodeHandoff } from '../../src/handoff';
import { envelope, rawDetailsRow, rawPlayer } from '../handoff/raw';

/** Loads the app as a fresh page load would. */
async function start(url: string): Promise<void> {
  history.replaceState(null, '', url);
  document.body.replaceChildren(Object.assign(document.createElement('div'), { id: 'app' }));
  vi.resetModules();
  await import('../../src/app/main');
}

const details = [
  rawDetailsRow({ round: '1', rating: '950' }),
  rawDetailsRow({ round: '2', roundLabel: '2', rating: '970' }),
];

describe('app start', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  });

  it('imports a hand-off, removes the fragment and keeps the data after a reload', async () => {
    const payload = await encodeHandoff(envelope({ player: rawPlayer(), details }));
    await start(`/next-rating/#d=${payload}`);
    expect(location.hash).toBe('');
    await vi.waitFor(() => expect(document.getElementById('import-banner')).not.toBeNull());
    expect(document.activeElement?.id).toBe('import-banner');
    expect(document.getElementById('predicted')!.textContent).toBe('960');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).lastImport.details).toHaveLength(2);

    await start('/next-rating/');
    expect(document.getElementById('import-banner')).toBeNull();
    expect(document.getElementById('predicted')!.textContent).toBe('960');
  });

  it('shows an error for a broken hand-off and stores nothing', async () => {
    await start('/next-rating/#d=not-a-hand-off');
    expect(location.hash).toBe('');
    await vi.waitFor(() => expect(document.getElementById('import-banner')).not.toBeNull());
    expect(document.getElementById('import-banner')!.getAttribute('role')).toBe('alert');
    expect(document.getElementById('open-import')).not.toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
