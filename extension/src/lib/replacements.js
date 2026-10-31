// What to use instead of well-known extensions that are gone from the Chrome
// Web Store, mostly Manifest V2 ones removed in 2026. Only replacements we
// trust: a maintained extension by the same developer, or a setting built
// into Chrome. Checked against the store on 2026-10-31.
const REPLACEMENTS = {
  // uBlock Origin
  cjpalhdlnbpafiamejdnhcphjbkeiagm: {
    name: 'uBlock Origin Lite',
    id: 'ddkjiahejlhfcafbddmgiahcphecmpfh',
    why: 'by the same developer, made for Chrome\'s new extension rules.',
  },
  // uMatrix
  ogfcmafjalglgifnmanfmnieipoejdcf: {
    name: 'uBlock Origin Lite',
    id: 'ddkjiahejlhfcafbddmgiahcphecmpfh',
    why: 'by the same developer. It blocks less finely than uMatrix did.',
  },
  // HTTPS Everywhere
  gcbommkclmclpchllfjekcdonpmejbdp: {
    builtIn: 'Chrome does this itself: Settings → Privacy and security → Security → "Always use secure connections".',
  },
  // The Great Suspender
  klbibkeccnjlkjkiokjodocebajanakg: {
    builtIn: 'Chrome does this itself: Settings → Performance → "Memory Saver".',
  },
};

export function replacementFor(id) {
  return REPLACEMENTS[id] ?? null;
}
