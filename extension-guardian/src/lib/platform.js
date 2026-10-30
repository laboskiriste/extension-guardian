// Chrome, Edge and Brave check extensions against the Chrome Web Store;
// Firefox checks them against addons.mozilla.org. getBrowserInfo exists only
// in Firefox.
export const IS_FIREFOX = typeof browser !== 'undefined' && typeof browser.runtime?.getBrowserInfo === 'function';

export const STORE = IS_FIREFOX
  ? { name: 'Firefox Add-ons', the: 'Firefox Add-ons', owner: 'Mozilla', browser: 'Firefox' }
  : { name: 'Chrome Web Store', the: 'the Chrome Web Store', owner: 'Google', browser: 'Chrome' };
