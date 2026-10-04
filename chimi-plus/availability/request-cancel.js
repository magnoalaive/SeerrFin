(() => {
  'use strict';

  const ACTIVE_REQUEST_STATUSES = new Set([1, 2, 4]);
  let lastRoute = '';
  let busy = false;

  function routeInfo() {
    const match = location.pathname.match(/^\/(movie|tv)\/(\d+)/);
    return match ? { type: match[1], id: match[2] } : null;
  }

  function findActionAnchor() {
    const candidates = [...document.querySelectorAll('button')];
    return candidates.find((button) => {
      const text = button.textContent.trim();
      return /^(Adicionar|Adicionando|Solicitar|Solicitando)( em 4K)?$/i.test(text);
    }) || null;
  }

  function describeRequest(request, type) {
    if (type !== 'tv') return 'este filme';
    const seasons = (request.seasons || [])
      .map((season) => season.seasonNumber)
      .filter((n) => Number.isInteger(n))
      .sort((a, b) => a - b);
    return seasons.length ? 'T' + seasons.join(', T') : 'esta série';
  }

  async function getRequests(info) {
    const response = await fetch('/api/v1/' + info.type + '/' + info.id, {
      credentials: 'same-origin',
      cache: 'no-store'
    });
    if (!response.ok) return [];
    const data = await response.json();
    return (data?.mediaInfo?.requests || []).filter((request) =>
      !request.is4k && ACTIVE_REQUEST_STATUSES.has(Number(request.status))
    );
  }  async function cancelRequests(info, requests, button) {
    if (busy || !requests.length) return;
    const label = requests.map((request) => describeRequest(request, info.type)).join(' + ');
    const question = requests.length > 1
      ? 'Cancelar as solicitações ativas de ' + label + '?'
      : 'Cancelar a solicitação de ' + label + '?';
    if (!window.confirm(question)) return;

    busy = true;
    const original = button.textContent;
    button.disabled = true;
    button.textContent = 'Cancelando...';

    try {
      for (const request of requests) {
        const response = await fetch('/api/v1/request/' + request.id, {
          method: 'DELETE',
          credentials: 'same-origin'
        });
        if (!response.ok && response.status !== 404) {
          throw new Error('HTTP ' + response.status);
        }
      }
      button.textContent = 'Cancelado';
      setTimeout(() => location.reload(), 350);
    } catch (error) {
      button.disabled = false;
      button.textContent = original;
      window.alert('Não foi possível cancelar a solicitação agora.');
    } finally {
      busy = false;
    }
  }

  async function mount() {
    const info = routeInfo();
    if (!info) return;
    const route = info.type + ':' + info.id;
    if (route !== lastRoute) lastRoute = route;
    if (document.getElementById('chimi-cancel-request')) return;

    const anchor = findActionAnchor();
    if (!anchor?.parentElement) return;

    const requests = await getRequests(info);
    if (!requests.length || document.getElementById('chimi-cancel-request')) return;    const button = document.createElement('button');
    button.id = 'chimi-cancel-request';
    button.type = 'button';
    button.textContent = requests.length > 1 ? 'Cancelar solicitações' : 'Cancelar solicitação';
    button.style.cssText =
      'margin-left:10px;padding:10px 14px;border-radius:8px;border:1px solid rgba(248,113,113,.75);' +
      'background:rgba(127,29,29,.22);color:#fecaca;font-weight:600;cursor:pointer;min-height:40px;';
    button.addEventListener('mouseenter', () => {
      if (!button.disabled) button.style.background = 'rgba(153,27,27,.38)';
    });
    button.addEventListener('mouseleave', () => {
      if (!button.disabled) button.style.background = 'rgba(127,29,29,.22)';
    });
    button.addEventListener('click', () => cancelRequests(info, requests, button));

    anchor.insertAdjacentElement('afterend', button);
  }

  let timer = 0;
  function schedule() {
    clearTimeout(timer);
    timer = window.setTimeout(mount, 120);
  }

  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true
  });
  window.addEventListener('popstate', schedule);
  schedule();
})();