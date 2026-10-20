/*
 * Packs the hand-off: text, compressed with deflate-raw, encoded as
 * base64url. The bookmarklet bundles this file, so it imports nothing and
 * stays small; the codec checks for compression stream support first.
 */

/** Characters of encoded payload in the URL fragment. */
export const MAX_PAYLOAD = 512 * 1024;

export async function packText(text: string): Promise<string> {
  const compressed = new Response(text).body!.pipeThrough(new CompressionStream('deflate-raw'));
  const bytes = new Uint8Array(await new Response(compressed).arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
