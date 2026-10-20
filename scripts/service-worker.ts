/*
 * Writes dist/sw.js from the src/sw.js template once the build is done: the
 * list of built files to cache, and a cache name made from their contents, so
 * every deploy that changes a file gets a new cache and the old one is
 * deleted.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

export const SERVICE_WORKER = 'sw.js';
const TEMPLATE = fileURLToPath(new URL('../src/sw.js', import.meta.url));
const CACHE_PLACEHOLDER = "'__CACHE_NAME__'";
const FILES_PLACEHOLDER = "['__PRECACHE__']";

/** The built files to cache, sorted: everything but the service worker itself and source maps. */
export function precacheList(files: readonly string[]): string[] {
  return files.filter((file) => file !== SERVICE_WORKER && !file.endsWith('.map')).sort();
}

/** "next-rating-" and a hash of the files' paths and contents. */
export function cacheName(files: readonly (readonly [path: string, content: Uint8Array])[]): string {
  const hash = createHash('sha256');
  for (const [path, content] of files) hash.update(`${path}\0${content.length}\0`).update(content);
  return `next-rating-${hash.digest('hex').slice(0, 16)}`;
}

export function fillTemplate(template: string, files: readonly string[], cache: string): string {
  if (!template.includes(CACHE_PLACEHOLDER) || !template.includes(FILES_PLACEHOLDER)) {
    throw new Error('The service worker template has lost a placeholder');
  }
  return template.replace(CACHE_PLACEHOLDER, JSON.stringify(cache)).replace(FILES_PLACEHOLDER, JSON.stringify(files));
}

/** Every file under `dir`, as paths relative to it with "/". */
function listFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split(sep).join('/'));
}

/** Builds the service worker for the files in `outDir`, and returns its source. */
export function buildServiceWorker(outDir: string, template = readFileSync(TEMPLATE, 'utf8')): string {
  const files = precacheList(listFiles(outDir));
  if (!files.includes('index.html')) throw new Error(`No index.html in ${outDir}`);
  const cache = cacheName(files.map((file) => [file, readFileSync(join(outDir, file))] as const));
  return fillTemplate(template, files, cache);
}

/** Runs after the build has written dist/, public files included. Only in builds. */
export function serviceWorker(): Plugin {
  let outDir = 'dist';
  return {
    name: 'service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle(error?: Error) {
      if (error) return;
      writeFileSync(join(outDir, SERVICE_WORKER), buildServiceWorker(outDir));
    },
  };
}
