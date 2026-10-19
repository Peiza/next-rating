import en from './locales/en.json';
import { pickLanguage, translate, type Catalog, type Params, type PluralCategory } from './translator';

/*
 * Every JSON file in locales/ is a language, named by its code, so adding a
 * language needs no code changes. English is the default and the fallback
 * for missing keys.
 */

export const DEFAULT_LANGUAGE = 'en';

const modules = import.meta.glob<Catalog>('./locales/*.json', { eager: true, import: 'default' });

const catalogs = new Map<string, Catalog>(
  Object.entries(modules).map(([path, catalog]) => [/([\w-]+)\.json$/.exec(path)![1]!, catalog]),
);

type EnglishKey = Extract<keyof typeof en, string>;
type PluralBase<K> = K extends `${infer Base}.${PluralCategory}` ? Base : never;

/** A key of the English catalog, or the base key of a plural message. */
export type MessageKey = EnglishKey | PluralBase<EnglishKey>;

let active = DEFAULT_LANGUAGE;

export interface Language {
  code: string;
  /** The language's name in that language, such as "Svenska". */
  name: string;
}

export function languages(): Language[] {
  return [...catalogs]
    .map(([code, catalog]) => ({ code, name: catalog['language.name'] ?? code }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

/** The language for the device settings and the user's override, if any. */
export function resolveLanguage(preferred: readonly string[], override: string | null): string {
  return pickLanguage(preferred, [...catalogs.keys()], override, DEFAULT_LANGUAGE);
}

export function activeLanguage(): string {
  return active;
}

/** Makes a language active and sets <html lang> to it. */
export function setLanguage(code: string): void {
  active = catalogs.has(code) ? code : DEFAULT_LANGUAGE;
  if (typeof document !== 'undefined') document.documentElement.lang = active;
}

export function t(key: MessageKey, params?: Params): string {
  const chain: [string, Catalog][] = [[active, catalogs.get(active) ?? en]];
  if (active !== DEFAULT_LANGUAGE) chain.push([DEFAULT_LANGUAGE, en]);
  return translate(chain, key, params);
}
