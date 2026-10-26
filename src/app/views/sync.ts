import qrcode from 'qrcode-generator';
import { t } from '../../i18n';
import { el, svg } from '../dom';
import { formatAge } from '../format';
import type { JoinChoice, SyncStatus } from '../sync';

/*
 * Sync between devices, in Settings: make a sync link, or, while this
 * device syncs, the link as text and as a QR code drawn here (no outside
 * service), Sync now, Stop syncing here and Delete the synced list. And the
 * question a sync link asks when this device has favorites the list lacks.
 */

export const SYNC_CREATE_ID = 'sync-create';
export const SYNC_NOW_ID = 'sync-now';
export const SYNC_SHARE_ID = 'sync-share';
export const SYNC_LINK_ID = 'sync-link';
export const SYNC_STOP_ID = 'sync-stop';
export const SYNC_DELETE_ID = 'sync-delete';
export const SYNC_DELETE_CANCEL_ID = 'sync-delete-cancel';
export const SYNC_TITLE_ID = 'sync-title';
export const JOIN_ID = 'sync-join';

/** What the share button did, as with Share list. */
export type SyncShareStatus = 'copied' | null;

export interface SyncProps {
  /** The sync link while this device syncs, else null. */
  link: string | null;
  status: SyncStatus;
  /** When this device last heard from the server, in ms. */
  lastSynced: number | null;
  now: Date;
  online: boolean;
  share: SyncShareStatus;
  confirmDelete: boolean;
  onCreate: () => void;
  onShare: () => void;
  onSyncNow: () => void;
  onStop: () => void;
  onAskDelete: (ask: boolean) => void;
  onDelete: () => void;
}

/** The link as a QR code: one path of dark squares on a light square, which phone cameras read in either theme. */
export function qrCode(text: string): SVGSVGElement {
  const code = qrcode(0, 'M');
  code.addData(text, 'Byte');
  code.make();
  const count = code.getModuleCount();
  const margin = 4;
  const size = count + margin * 2;
  let path = '';
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (code.isDark(row, col)) path += `M${col + margin} ${row + margin}h1v1h-1z`;
    }
  }
  return svg(
    'svg',
    { class: 'sync-qr', viewBox: `0 0 ${size} ${size}`, role: 'img', 'aria-label': t('sync.qrLabel'), 'shape-rendering': 'crispEdges' },
    svg('rect', { width: size, height: size, fill: '#ffffff' }),
    svg('path', { d: path, fill: '#000000' }),
  );
}

function statusLine({ status, lastSynced, now }: SyncProps): HTMLElement {
  const text =
    status === 'syncing'
      ? t('sync.syncing')
      : status === 'unavailable'
        ? t('sync.unavailable')
        : status === 'gone'
          ? t('sync.gone')
          : lastSynced !== null
            ? t('sync.lastSynced', { age: formatAge(new Date(lastSynced).toISOString(), now) })
            : '';
  const error = status === 'unavailable' || status === 'gone';
  return el('p', { class: error ? 'status error' : 'status', role: 'status' }, text);
}

function deleteRow(props: SyncProps): HTMLElement {
  if (!props.confirmDelete) {
    return el(
      'button',
      { id: SYNC_DELETE_ID, class: 'button button-block', type: 'button', onclick: () => props.onAskDelete(true) },
      t('sync.delete'),
    );
  }
  return el(
    'div',
    { class: 'confirm', role: 'group', 'aria-labelledby': `${SYNC_DELETE_ID}-question` },
    el('p', { id: `${SYNC_DELETE_ID}-question` }, t('sync.deleteQuestion')),
    el(
      'div',
      { class: 'row' },
      el('button', { id: SYNC_DELETE_CANCEL_ID, class: 'button', type: 'button', onclick: () => props.onAskDelete(false) }, t('sync.cancel')),
      el('button', { id: `${SYNC_DELETE_ID}-confirm`, class: 'button button-danger grow', type: 'button', onclick: props.onDelete }, t('sync.deleteConfirm')),
    ),
  );
}

export function syncSection(props: SyncProps): HTMLElement {
  const busy = props.status === 'syncing';
  const offline = !props.online;
  if (props.link === null) {
    return el(
      'div',
      { class: 'sync' },
      el('h2', { id: SYNC_TITLE_ID }, t('sync.title')),
      el('p', {}, t('sync.intro')),
      el(
        'button',
        { id: SYNC_CREATE_ID, class: 'button button-block', type: 'button', disabled: busy || offline, onclick: props.onCreate },
        t('sync.create'),
      ),
      offline && el('p', { class: 'hint' }, t('sync.offline')),
      statusLine(props),
    );
  }
  return el(
    'div',
    { class: 'sync' },
    el('h2', { id: SYNC_TITLE_ID }, t('sync.title')),
    el('p', {}, t('sync.on')),
    statusLine(props),
    el(
      'button',
      { id: SYNC_NOW_ID, class: 'button button-block', type: 'button', disabled: busy || offline, onclick: props.onSyncNow },
      t('sync.now'),
    ),
    el('h3', {}, t('sync.otherDevice')),
    el('p', { class: 'hint' }, t('sync.otherDeviceHint')),
    qrCode(props.link),
    el(
      'div',
      { class: 'field' },
      el('label', { class: 'label', for: SYNC_LINK_ID }, t('sync.linkLabel')),
      el('input', {
        id: SYNC_LINK_ID,
        class: 'input',
        type: 'text',
        readonly: true,
        value: props.link,
        onfocus: (event) => (event.target as HTMLInputElement).select(),
      }),
    ),
    el('button', { id: SYNC_SHARE_ID, class: 'button button-block', type: 'button', onclick: props.onShare }, t('sync.share')),
    props.share === 'copied' && el('p', { class: 'status', role: 'status' }, t('sync.copied')),
    el('p', { class: 'hint' }, t('sync.secret')),
    el('button', { id: SYNC_STOP_ID, class: 'button button-block', type: 'button', onclick: props.onStop }, t('sync.stop')),
    el('p', { class: 'hint' }, t('sync.stopHint')),
    deleteRow(props),
  );
}

/** A sync link on a device with favorites the list lacks: keep them in the list, or let the list replace them. */
export function joinView(choice: JoinChoice, onMerge: () => void, onReplace: () => void, onCancel: () => void): HTMLElement {
  return el(
    'div',
    { id: JOIN_ID, class: 'banner banner-info', tabindex: -1, role: 'group', 'aria-labelledby': `${JOIN_ID}-question` },
    el('p', { id: `${JOIN_ID}-question`, class: 'banner-message' }, t('sync.joinQuestion', { count: choice.extra.length })),
    el('p', {}, choice.extra.map((number) => t('rating.playerNumber', { number })).join(', ')),
    el(
      'div',
      { class: 'stack' },
      el('button', { id: `${JOIN_ID}-merge`, class: 'button button-primary button-block', type: 'button', onclick: onMerge }, t('sync.merge')),
      el('button', { id: `${JOIN_ID}-replace`, class: 'button button-block', type: 'button', onclick: onReplace }, t('sync.replace', { count: choice.extra.length })),
      el('button', { id: `${JOIN_ID}-cancel`, class: 'button button-block', type: 'button', onclick: onCancel }, t('sync.cancel')),
    ),
  );
}
