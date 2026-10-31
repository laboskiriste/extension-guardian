// The extension list as plain text, for the popup's "Copy the list". It is
// built on the device and only goes to the clipboard.

export const RISK_LABEL = { high: 'High risk', watch: 'Watch', low: 'Low risk' };
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
