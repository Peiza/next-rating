/* jsdom ships without types. This covers the one part the scripts use. */
declare module 'jsdom' {
  export class JSDOM {
    constructor(html?: string);
    readonly window: { readonly document: Document };
  }
}
