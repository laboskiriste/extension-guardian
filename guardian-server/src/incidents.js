// Published reports of extensions that turned malicious, for the checker's
// incident pages. IDs are copied from the reports' IoC lists; "acquired" marks
// extensions the attackers bought from their original developers.
export const INCIDENTS = [
  {
    slug: 'superior-2026',
    title: '19 Chrome and Edge extensions that stole wallets and passwords',
    reported: 'August 2026',
    summary: 'Socket researchers found 18 Chrome extensions and one Edge extension that delivered a crypto wallet drainer and credential stealer. The attackers built 14 of them and bought the other 5 from their original developers, then pushed the malware in an update.',
    sources: [
      { name: 'Socket', url: 'https://x.com/SocketSecurity/status/2093019529316020304' },
      { name: 'Cybersecurity News', url: 'https://cybersecuritynews.com/extensions-caught-stealing-crypto-wallets-and-passwords/' },
      { name: 'Gridinsoft', url: 'https://blog.gridinsoft.com/superior-malicious-browser-extensions/' },
    ],
    extensions: [
      { id: 'pkoccklolohdacbfooifnpebakpbeipc', name: 'Enable Right Click & Copy – Smart Unlock + OCR', store: 'chrome', acquired: true },
      { id: 'fegckejpfnlmfgkfjpinlbgmeeijjkel', name: 'RapidLens – Google Lens for Screen Search & Images', store: 'chrome', acquired: true },
      { id: 'kdenlnncndfnhkognokgfpabgkgehodd', name: 'QuickLens – Search Screen with Google Lens', store: 'chrome', acquired: true },
      { id: 'jamminefolhgepgihbmcjjhgldbfcikp', name: 'Password Protect PDF', store: 'chrome', acquired: true },
      { id: 'inmkjedjdhgpknjogbjomhnbgdccckkg', name: 'Allow Copy – Select & Enable Right Click', store: 'edge', acquired: true },
      { id: 'fcgdejjichpgfaaafflplhfijcnieopb', name: 'PixelCheck', store: 'chrome' },
      { id: 'cfpnjdbpojpcongfaefcamjbaolpelcd', name: 'Creative Library – Ad Spy Tool', store: 'chrome' },
      { id: 'aapdalkmclfaahehnmicbglkohkldhne', name: 'Website Traffic Checker: MirrorSphere SEO Stats', store: 'chrome' },
      { id: 'dkdadldmiefjldmegbjbnhhfddnkhlhm', name: 'Site Signal – Website Traffic & SEO Checker', store: 'chrome' },
      { id: 'fjmlhlkccegopebcllcmafahkmeejpph', name: 'SEO Pulse Pro – Website Traffic & SEO Analyzer', store: 'chrome' },
      { id: 'iekoapohahgmogbagegmcgplbkikcgke', name: 'Private Crypto News Reader', store: 'chrome' },
      { id: 'ahpnnnjbnfbhoikhohglpohnoocjcoco', name: 'Blockfolio: Address Monitor', store: 'chrome' },
      { id: 'oeacadlaclegkkkdehjmiifnjhcekclj', name: 'Crypto Rates & Fiat Converter', store: 'chrome' },
      { id: 'jmlgannjlbliikgcaieomgmcnfplglea', name: 'Crypto Alerter: Price Alarms & Volatility Warnings', store: 'chrome' },
      { id: 'lhmcajhgadanidbopgaoobjlldegjmke', name: 'DeFi Pulse Tracker', store: 'chrome' },
      { id: 'gfackggoapepdmnjnkblogdcjpgcjiak', name: 'Crypto Price Badge: Quick Glance', store: 'chrome' },
      { id: 'hfijkbdkpidafdbeebnnkhfccildbcle', name: 'Multi-Chain Explorer', store: 'chrome' },
      { id: 'pcngchfbfgejllcbhmeadjhiebebiome', name: 'LedgerLook: Wallet Checker', store: 'chrome' },
      { id: 'aodkjdeghbjiaienipfjkbpcikkacbcp', name: 'Meta & Facebook Ad Library Spy – Save Ads, Finder, Downloader | FeedX-Ray', store: 'chrome' },
    ],
  },
];

export const incidentPath = (incident) => `/incidents/${incident.slug}`;

export const findIncident = (slug) => INCIDENTS.find((i) => i.slug === slug) ?? null;

// The name a report gave this extension, for when the store no longer lists it.
export const reportedName = (id) => INCIDENTS
  .flatMap((i) => i.extensions).find((e) => e.id === id)?.name ?? null;

// The incident that names this Chrome extension, if any.
export const incidentFor = (id) => INCIDENTS
  .find((i) => i.extensions.some((e) => e.id === id && e.store === 'chrome')) ?? null;
