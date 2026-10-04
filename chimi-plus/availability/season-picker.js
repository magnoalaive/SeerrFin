(() => {
  'use strict';

  const TITLE_RE = /^(Solicitar Série|Solicitar Serie|Request Series)( em 4K| in 4K)?$/i;
  const mounted = new WeakSet();

  function getSeasonRows(dialog) {
    return [...dialog.querySelectorAll('tbody tr')].map((row) => {
      const match = row.textContent.match(/(?:Temporada|Season)\s+(\d+)/i);
      const toggle = row.querySelector('[role="checkbox"]');
      return match && toggle ? { row, toggle, season: Number(match[1]) } : null;
    }).filter(Boolean);
  }

  function setSeason(toggle, wanted) {
    const checked = toggle.getAttribute('aria-checked') === 'true';
    if (checked !== wanted) toggle.click();
  }

  function mount(dialog) {
    if (mounted.has(dialog)) return;
    const heading = [...dialog.querySelectorAll('h1,h2,h3,h4')].find((el) =>
      TITLE_RE.test(el.textContent.trim())
    );
    if (!heading) return;
    const table = dialog.querySelector('table');
    if (!table) return;
    mounted.add(dialog);

    const box = document.createElement('div');
    box.id = 'chimi-season-picker';
    box.style.cssText =
      'margin:12px 0 10px;padding:12px 14px;border:1px solid rgb(75 85 99);border-radius:10px;background:rgba(17,24,39,.65);';    const title = document.createElement('div');
    title.textContent = 'Escolha o que baixar';
    title.style.cssText = 'font-weight:700;font-size:14px;color:#fff;margin-bottom:3px';

    const hint = document.createElement('div');
    hint.textContent = 'Marque somente as temporadas que você quer agora. Depois você pode voltar e adicionar as próximas.';
    hint.style.cssText = 'font-size:12px;line-height:1.4;color:#cbd5e1;margin-bottom:10px';

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';

    function makeButton(label, handler, primary = false) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.style.cssText =
        'padding:7px 11px;border-radius:7px;border:1px solid ' +
        (primary ? '#3b82f6' : '#4b5563') +
        ';background:' + (primary ? '#2563eb' : '#1f2937') +
        ';color:#fff;font-size:12px;font-weight:600;cursor:pointer';
      button.addEventListener('click', handler);
      return button;
    }

    actions.append(
      makeButton('Só T1', () => {
        const rows = getSeasonRows(dialog);
        rows.forEach(({ toggle, season }) => setSeason(toggle, season === 1));
      }, true),
      makeButton('Todas', () => {
        const master = dialog.querySelector('thead [role="checkbox"]');
        if (master && master.getAttribute('aria-checked') !== 'true') master.click();
      }),
      makeButton('Limpar seleção', () => {
        getSeasonRows(dialog).forEach(({ toggle }) => setSeason(toggle, false));
      })
    );    box.append(title, hint, actions);
    table.parentElement?.parentElement?.insertAdjacentElement('beforebegin', box);
  }

  function findContainer(heading) {
    const dialog = heading.closest('[role="dialog"]');
    if (dialog?.querySelector('table')) return dialog;
    let node = heading.parentElement;
    while (node && node !== document.body) {
      const table = node.querySelector('table');
      if (table && /(?:Temporada|Season)\s+\d+/i.test(table.textContent)) return node;
      node = node.parentElement;
    }
    return null;
  }

  function scan() {
    [...document.querySelectorAll('h1,h2,h3,h4')].forEach((heading) => {
      if (!TITLE_RE.test(heading.textContent.trim())) return;
      const container = findContainer(heading);
      if (container) mount(container);
    });
  }

  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      scan();
    });
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
    scan();
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      observer.observe(document.body, { childList: true, subtree: true });
      scan();
    }, { once: true });
  }
})();