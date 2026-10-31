// What to use instead of well-known extensions that are gone from the Chrome
// Web Store, for the checker's pages. A copy of extension/src/lib/replacements.js,
// which is the source of truth: change that file first, then mirror it here.
// `removed` is the name the extension had, since the store no longer shows it.
const REPLACEMENTS = {
  cjpalhdlnbpafiamejdnhcphjbkeiagm: {
    removed: 'uBlock Origin',
    name: 'uBlock Origin Lite',
    id: 'ddkjiahejlhfcafbddmgiahcphecmpfh',
    why: 'by the same developer, made for Chrome\'s new extension rules.',
  },
  ogfcmafjalglgifnmanfmnieipoejdcf: {
    removed: 'uMatrix',
    name: 'uBlock Origin Lite',
    id: 'ddkjiahejlhfcafbddmgiahcphecmpfh',
    why: 'by the same developer. It blocks less finely than uMatrix did.',
  },
  gcbommkclmclpchllfjekcdonpmejbdp: {
    removed: 'HTTPS Everywhere',
    builtIn: 'Chrome does this itself: Settings → Privacy and security → Security → "Always use secure connections".',
  },
  klbibkeccnjlkjkiokjodocebajanakg: {
    removed: 'The Great Suspender',
    builtIn: 'Chrome does this itself: Settings → Performance → "Memory Saver".',
  },
};

export function replacementFor(id) {
  return REPLACEMENTS[id] ?? null;
}
