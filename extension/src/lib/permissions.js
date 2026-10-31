// Plain-language descriptions and risk weights for extension permissions.
// `weight` applies always; `broadWeight` replaces it when the extension can
// also access every website, because the combination is what makes it dangerous.

export const PERMISSIONS = {
  debugger: {
    weight: 40,
    title: 'Full control of pages through the debugger',
    detail: 'Can inspect and change everything in a tab, including passwords you type.',
  },
  proxy: {
    weight: 30,
    title: 'Can route your traffic through another server',
    detail: 'Everything you browse could pass through a server the developer controls.',
  },
  webAuthenticationProxy: {
    weight: 30,
    title: 'Can answer passkey and security key requests',
    detail: 'Can stand in for your passkeys and security keys when a site asks you to sign in.',
  },
  webRequestAuthProvider: {
    weight: 25,
    title: 'Can answer login prompts',
    detail: 'Can see or supply usernames and passwords for sites that ask for them.',
  },
  nativeMessaging: {
    weight: 25,
    title: 'Can talk to programs on your computer',
    detail: 'Can exchange data with software installed outside the browser.',
  },
  cookies: {
    weight: 5,
    broadWeight: 20,
    title: 'Can read your cookies',
    detail: 'Cookies keep you logged in. Stolen cookies can let someone into your accounts.',
  },
  webRequest: {
    weight: 5,
    broadWeight: 15,
    title: 'Can watch your network requests',
    detail: 'Can see the addresses of pages and resources you load.',
  },
  scripting: {
    weight: 5,
    broadWeight: 10,
    title: 'Can run code inside web pages',
    detail: 'Can add or change content on the pages it has access to.',
  },
  // Firefox and Manifest V2 only.
  webRequestBlocking: {
    weight: 5,
    broadWeight: 15,
    title: 'Can block or change your network requests',
    detail: 'Can stop or change requests to the sites it has access to.',
  },
  userScripts: {
    weight: 5,
    broadWeight: 15,
    title: 'Can run user scripts on web pages',
    detail: 'Can run scripts written by you or others on the pages it has access to.',
  },
  declarativeNetRequestWithHostAccess: {
    weight: 5,
    broadWeight: 10,
    title: 'Can block or redirect requests',
    detail: 'Can block, redirect or change requests to the sites it has access to.',
  },
  history: {
    weight: 15,
    title: 'Can read your browsing history',
    detail: 'Can see every site you have visited.',
  },
  management: {
    weight: 15,
    title: 'Can manage your other extensions',
    detail: 'Can turn other extensions on or off, including security tools.',
  },
  clipboardRead: {
    weight: 15,
    title: 'Can read your clipboard',
    detail: 'Can see anything you copy, such as passwords or card numbers.',
  },
  privacy: {
    weight: 15,
    title: 'Can change your privacy settings',
    detail: 'Can turn browser privacy protections on or off.',
  },
  tabCapture: {
    weight: 15,
    title: 'Can record your tabs',
    detail: 'Can capture the picture and sound of a tab.',
  },
  desktopCapture: {
    weight: 15,
    title: 'Can record your screen',
    detail: 'Can capture your screen or windows.',
  },
  vpnProvider: {
    weight: 20,
    title: 'Can run a VPN',
    detail: 'Can send your traffic through a VPN it controls (ChromeOS).',
  },
  certificateProvider: {
    weight: 15,
    title: 'Can use your security certificates',
    detail: 'Can provide certificates that sign you in to websites and networks (ChromeOS).',
  },
  platformKeys: {
    weight: 15,
    title: 'Can use your security certificates',
    detail: 'Can use certificates stored on your device to sign you in (ChromeOS).',
  },
  'enterprise.platformKeys': {
    weight: 15,
    title: 'Can use your security certificates',
    detail: 'Can use certificates managed by your organization (ChromeOS).',
  },
  sessions: {
    weight: 10,
    title: 'Can see recently closed tabs',
    detail: 'Can see tabs you closed recently and tabs open on your other devices.',
  },
  'identity.email': {
    weight: 10,
    title: 'Can see your email address',
    detail: 'Can read the email address of the account you are signed in to the browser with.',
  },
  browsingData: {
    weight: 10,
    title: 'Can delete browsing data',
    detail: 'Can clear your history, cookies and cache.',
  },
  contentSettings: {
    weight: 10,
    title: 'Can change site permissions',
    detail: 'Can allow sites to use your camera, microphone, location or pop-ups.',
  },
  pageCapture: {
    weight: 10,
    title: 'Can save whole pages',
    detail: 'Can save a copy of any page you open, including private ones.',
  },
  geolocation: {
    weight: 10,
    title: 'Can see your location',
    detail: 'Can find out where you are.',
  },
  webNavigation: {
    weight: 5,
    title: 'Can follow where you go',
    detail: 'Is told every time you open a page.',
  },
  tabs: {
    weight: 5,
    title: 'Can see your open tabs',
    detail: 'Can read the addresses and titles of your tabs.',
  },
  downloads: {
    weight: 5,
    title: 'Can manage your downloads',
    detail: 'Can see, start and open downloads.',
  },
  'downloads.open': {
    weight: 5,
    title: 'Can open downloaded files',
    detail: 'Can open files it downloaded, after you click.',
  },
  readingList: {
    weight: 5,
    title: 'Can read and change your reading list',
    detail: 'Can see and edit pages saved to your reading list.',
  },
  bookmarks: {
    weight: 5,
    title: 'Can read and change bookmarks',
    detail: 'Can see and edit your bookmarks.',
  },
  topSites: {
    weight: 5,
    title: 'Can see your most visited sites',
    detail: 'Can read the list of sites you visit most.',
  },
  identity: {
    weight: 5,
    title: 'Can ask to sign in with your Google account',
    detail: 'Can request access to your Google account (you still have to approve it).',
  },
  declarativeNetRequestFeedback: {
    weight: 5,
    title: 'Can see which requests were blocked',
    detail: 'Learns which pages and resources its rules matched.',
  },
};

export const BROAD_HOST = {
  weight: 30,
  title: 'Can read and change data on all websites',
  detail: 'Can see and edit everything on every page you open, including email, banking and social media.',
};

const BROAD_PATTERNS = new Set(['<all_urls>', '*://*/*', 'http://*/*', 'https://*/*']);

export function isBroadHost(pattern) {
  if (BROAD_PATTERNS.has(pattern)) return true;
  const m = /^(\*|https?|wss?):\/\/([^/]*)\//.exec(pattern);
  return Boolean(m && m[2] === '*');
}

// Turns a match pattern like "https://*.google.com/*" into "google.com".
export function hostLabel(pattern) {
  if (pattern.startsWith('file:')) return 'files on your computer';
  const m = /^[^:]+:\/\/(?:\*\.)?([^/]+)/.exec(pattern);
  return m ? m[1] : pattern;
}

export function describePermission(name) {
  return PERMISSIONS[name]?.title ?? name;
}
