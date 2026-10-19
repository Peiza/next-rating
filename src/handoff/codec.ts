import { ParseError } from '../parsers/values';
import { validateEnvelope, VersionError, type Envelope } from './envelope';

/*
 * The envelope travels in the URL fragment, which is never sent to any
 * server: JSON, compressed with deflate-raw, encoded as base64url. The
 * fragment is untrusted, so its size is limited before decoding and the
 * decompressed size is counted while streaming, against decompression bombs.
 */

export const FRAGMENT_PREFIX = '#d=';
/** Characters of encoded payload. */
export const MAX_PAYLOAD = 512 * 1024;
/** Bytes of decompressed JSON. */
export const MAX_JSON_BYTES = 4 * 1024 * 1024;

export type HandoffErrorCode = 'too-large' | 'malformed' | 'version' | 'unsupported';

export class HandoffError extends Error {
  readonly code: HandoffErrorCode;

  constructor(code: HandoffErrorCode, message: string) {
    super(message);
    this.name = 'HandoffError';
    this.code = code;
  }
}

const BASE64URL = /^[A-Za-z0-9_-]*$/;

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  if (!BASE64URL.test(text)) throw new HandoffError('malformed', 'payload is not base64url');
  let binary: string;
  try {
    binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  } catch {
    throw new HandoffError('malformed', 'payload is not base64url');
  }
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function supported(): boolean {
  return typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
}

/** Runs bytes through a compression or decompression stream, stopping once the output passes `limit` bytes. */
async function transform(bytes: Uint8Array, stream: TransformStream<BufferSource, Uint8Array>, limit: number) {
  const input = new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(bytes as BufferSource);
      controller.close();
    },
  });
  const reader = input.pipeThrough(stream).getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      reader.cancel().catch(() => {});
      throw new HandoffError('too-large', 'decompressed payload is too large');
    }
    chunks.push(value);
  }
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

/** Compresses and encodes text. Used for the envelope's JSON, and by tests for crafted payloads. */
export async function packText(text: string): Promise<string> {
  if (!supported()) throw new HandoffError('unsupported', 'compression streams are not available');
  const bytes = new TextEncoder().encode(text);
  return toBase64Url(await transform(bytes, new CompressionStream('deflate-raw'), Infinity));
}

/** Decodes and decompresses a payload, stopping as soon as it grows past the limit. */
export async function unpackText(payload: string): Promise<string> {
  if (payload.length > MAX_PAYLOAD) throw new HandoffError('too-large', 'payload is too long');
  if (!supported()) throw new HandoffError('unsupported', 'compression streams are not available');
  const bytes = fromBase64Url(payload);
  let json: Uint8Array;
  try {
    json = await transform(bytes, new DecompressionStream('deflate-raw'), MAX_JSON_BYTES);
  } catch (error) {
    if (error instanceof HandoffError) throw error;
    throw new HandoffError('malformed', 'payload is not valid compressed data');
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(json);
  } catch {
    throw new HandoffError('malformed', 'payload is not UTF-8 text');
  }
}

export async function encodeHandoff(envelope: Envelope): Promise<string> {
  return packText(JSON.stringify(envelope));
}

/** Decodes a payload (the fragment without "#d=") into a validated envelope. Throws HandoffError. */
export async function decodeHandoff(payload: string): Promise<Envelope> {
  const text = await unpackText(payload);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new HandoffError('malformed', 'payload is not JSON');
  }
  try {
    return validateEnvelope(value);
  } catch (error) {
    if (error instanceof VersionError) throw new HandoffError('version', error.message);
    if (error instanceof ParseError) throw new HandoffError(error.code, error.message);
    throw error;
  }
}
