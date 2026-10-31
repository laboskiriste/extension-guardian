// The Firefox manifest, made from the Chrome one. Firefox runs the background
// as a module script instead of a service worker, and needs an add-on id and
// a data collection statement.
export function firefoxManifest(chromeManifest) {
  const manifest = structuredClone(chromeManifest);
  delete manifest.minimum_chrome_version;
  // "Keep off on these sites" can't work in Firefox, so it never asks for tabs.
  delete manifest.optional_permissions;
  manifest.description = manifest.description.replace('the Chrome Web Store', 'the store');
  manifest.background = { scripts: [manifest.background.service_worker], type: 'module' };
  manifest.browser_specific_settings = {
    gecko: {
      id: 'extension-guardian@laboskiriste',
      strict_min_version: '140.0',
      // Lookups go straight to addons.mozilla.org; nothing reaches the developer.
      data_collection_permissions: { required: ['none'] },
    },
  };
  return manifest;
}
