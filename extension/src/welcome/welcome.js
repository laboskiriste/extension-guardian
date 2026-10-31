// Lists the other Tinyward extensions from family.js. Plain links: nothing is
// fetched or tracked.
const { family, extensions } = globalThis.TINYWARD;
const others = extensions.filter((e) => e.id !== 'extension-guardian');
const firefox = typeof browser !== 'undefined' && typeof browser.runtime?.getBrowserInfo === 'function';

// Firefox doesn't let one add-on turn another off.
if (firefox) document.getElementById('keep-off').hidden = true;

if (others.length) {
  document.getElementById('family-name').textContent = family;
  document.getElementById('family-list').replaceChildren(...others.map((e) => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = (firefox ? e.firefox : e.chrome) ?? e.website;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = e.name;
    li.append(a, `: ${e.short}`);
    return li;
  }));
  document.getElementById('family').hidden = false;
}
