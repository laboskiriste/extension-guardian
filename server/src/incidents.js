// Published reports of extensions that turned malicious, for the checker's
// incident pages, newest first. IDs are copied from the reports' IoC lists;
// "acquired" marks extensions the attackers bought from their original
// developers, and "wallets" adds the crypto wallet advice to the page.
export const INCIDENTS = [
  {
    slug: 'superior-2026',
    title: '19 Chrome and Edge extensions that stole wallets and passwords',
    reported: 'August 2026',
    wallets: true,
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
  {
    slug: 'reddirection-2025',
    title: '18 Chrome and Edge extensions that hijacked browsers after years of good behavior',
    reported: 'July 2025',
    summary: 'Koi Security found 18 extensions, 10 in the Chrome Web Store and 8 in Edge Add-ons, with about 2.3 million installs. They worked as advertised for years, some with Featured or Verified badges, until updates added code that reported every page visited and could send the browser to sites the attackers chose.',
    sources: [
      { name: 'The Register', url: 'https://www.theregister.com/2025/07/08/browser_hijacking_campaign/' },
      { name: 'Infosecurity Magazine', url: 'https://www.infosecurity-magazine.com/news/18-malicious-chrome-edge-extensions/' },
    ],
    extensions: [
      { id: 'eokjikchkppnkdipbiggnmlkahcdkikp', name: 'Color Picker, Eyedropper — Geco colorpick', store: 'chrome' },
      { id: 'kgmeffmlnkfnjpgmdndccklfigfhajen', name: 'Emoji keyboard online — copy&past your emoji.', store: 'chrome' },
      { id: 'dpdibkjjgbaadnnjhkmmnenkmbnhpobj', name: 'Free Weather Forecast', store: 'chrome' },
      { id: 'gaiceihehajjahakcglkhmdbbdclbnlf', name: 'Video Speed Controller — Video manager', store: 'chrome' },
      { id: 'mlgbkfnjdmaoldgagamcnommbbnhfnhf', name: 'Unlock Discord — VPN Proxy to Unblock Discord Anywhere', store: 'chrome' },
      { id: 'eckokfcjbjbgjifpcbdmengnabecdakp', name: 'Dark Theme — Dark Reader for Chrome', store: 'chrome' },
      { id: 'mgbhdehiapbjamfgekfpebmhmnmcmemg', name: 'Volume Max — Ultimate Sound Booster', store: 'chrome' },
      { id: 'cbajickflblmpjodnjoldpiicfmecmif', name: 'Unblock TikTok — Seamless Access with One-Click Proxy', store: 'chrome' },
      { id: 'pdbfcnhlobhoahcamoefbfodpmklgmjm', name: 'Unlock YouTube VPN', store: 'chrome' },
      { id: 'ihbiedpeaicgipncdnnkikeehnjiddck', name: 'Weather', store: 'chrome' },
      { id: 'jjdajogomggcjifnjgkpghcijgkbcjdi', name: 'Unlock TikTok', store: 'edge' },
      { id: 'mmcnmppeeghenglmidpmjkaiamcacmgm', name: 'Volume Booster — Increase your sound', store: 'edge' },
      { id: 'ojdkklpgpacpicaobnhankbalkkgaafp', name: 'Web Sound Equalizer', store: 'edge' },
      { id: 'lodeighbngipjjedfelnboplhgediclp', name: 'Header Value', store: 'edge' },
      { id: 'hkjagicdaogfgdifaklcgajmgefjllmd', name: 'Flash Player — games emulator', store: 'edge' },
      { id: 'gflkbgebojohihfnnplhbdakoipdbpdm', name: 'Youtube Unblocked', store: 'edge' },
      { id: 'kpilmncnoafddjpnbhepaiilgkdcieaf', name: 'SearchGPT — ChatGPT for Search Engine', store: 'edge' },
      { id: 'caibdnkmpnjhjdfnomfhijhmebigcelo', name: 'Unlock Discord', store: 'edge' },
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
