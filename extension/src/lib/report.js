// The extension list as plain text, for the popup's "Copy the list". It is
// built on the device and only goes to the clipboard.

// Labels say what was found, never that an extension is safe.
export const RISK_LABEL = { high: 'Attention required', watch: 'Review recommended', low: 'No warning signs' };
// What to do, from risk.js recommend(). Full access is never just "monitor".
export const ACTION_LABEL = { monitor: 'Nothing to do now', review: 'Worth a look', act: 'Act now' };
export function actionText(action, accessLevel) {
  if (action === 'act') return 'Find out why before you keep it. If you are not sure, remove it.';
  if (action === 'monitor') return 'Guardian will warn you if its owner or permissions change.';
  return accessLevel === 'full'
    ? 'It can read or change information on websites you visit. Keep it only if you need it and understand why it needs this access.'
    : 'Check that it still needs what it asks for.';
}
export const ACCESS_LABEL = { full: 'Full access', limited: 'Limited access', basic: 'Basic access' };

// `rows` are { ext, store, risk } as the popup builds them.
export function listAsText(rows, { now = Date.now() } = {}) {
  const on = rows.filter((r) => r.ext.enabled).length;
  const lines = [
    `Extension Guardian: ${rows.length} extension${rows.length === 1 ? '' : 's'}, ${on} turned on (${new Date(now).toISOString().slice(0, 10)})`,
  ];
  for (const { ext, store, risk } of rows) {
    const developer = store?.status === 'ok' ? store.developerName ?? store.offeredBy : null;
    const warnings = risk.reasons.filter((r) => r.kind === 'bad').map((r) => r.title);
    lines.push(
      '',
      `${ext.name} ${ext.version}${ext.enabled ? '' : ' (turned off)'}`,
      `  ${RISK_LABEL[risk.level]} · ${ACCESS_LABEL[risk.access.level]} · ID ${ext.id}`,
      developer && `  Developer: ${developer}`,
      warnings.length > 0 && `  Warnings: ${warnings.join('; ')}`,
    );
  }
  return `${lines.filter((l) => l !== false && l != null).join('\n')}\n`;
}
