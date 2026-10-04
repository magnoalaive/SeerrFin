(() => {
  let busy = false;
  function mount() {
    const route = location.pathname.match(/^\/(movie|tv)\/(\d+)/);
    const mediaType = route?.[1], id = route?.[2];
    const heading = document.querySelector('#modal-headline') ||
      [...document.querySelectorAll('h1,h2,h3,h4')].find(e => /^(Solicitar Filme|Request Movie|Solicitar Série|Solicitar Serie|Request (Series|TV Show))/i.test(e.textContent.trim()));
    if (!id || !heading) return;
    const modal = heading.closest('[role="dialog"]') || heading.parentElement?.parentElement?.parentElement;
    if (!modal || modal.querySelector('#chimi-availability')) return;
    const panel = document.createElement('section');
    panel.id = 'chimi-availability';
    panel.style.cssText = 'margin:12px 0;padding:12px;border:1px solid #636a9a;border-radius:9px;background:#242d40;color:white;font-size:13px';
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = 'Consultar versões disponíveis no ASC';
    button.style.cssText = 'padding:8px 12px;border-radius:7px;background:#4f46a5;color:white';
    const output = document.createElement('div');
    output.style.marginTop = '8px'; output.textContent = 'Consulta somente ao clicar · cache de 15 minutos';
    const seasonInput = document.createElement('input');
    seasonInput.type = 'number'; seasonInput.min = '1'; seasonInput.max = '99'; seasonInput.value = '1';
    seasonInput.style.cssText = 'width:66px;margin:0 8px;padding:7px;border:1px solid #636a9a;border-radius:6px;background:#202936;color:white';
    if (mediaType === 'tv') { const label = document.createElement('label'); label.textContent = 'Temporada '; label.append(seasonInput); panel.append(label); }
    panel.append(button, output);
    heading.parentElement.insertAdjacentElement('afterend', panel);
    button.onclick = async () => {
      if (busy) return;
      if (mediaType === 'tv' && (!Number.isInteger(Number(seasonInput.value)) || Number(seasonInput.value) < 1 || Number(seasonInput.value) > 99)) { output.textContent = 'Informe uma temporada válida.'; return; }
      busy = true; button.disabled = true; button.textContent = 'Consultando...'; output.textContent = '';
      try {
        const response = await fetch('/_chimi/availability?tmdbId=' + id + '&type=' + mediaType + (mediaType === 'tv' ? '&season=' + encodeURIComponent(seasonInput.value) : ''), {credentials:'same-origin'});
        const data = await response.json();
        if (!response.ok) throw Error(data.error || 'Consulta indisponível');
        output.textContent = data.title + ' (' + data.year + ')' + (mediaType === 'tv' ? ' · Temporada ' + data.season : '') + ': ';
        if (!data.releases.length) output.append('Nenhuma versão correspondente encontrada nesta busca.');
        for (const item of data.releases) {
          const line = document.createElement('div');
          line.style.cssText = 'padding:7px 0;border-bottom:1px solid #49536b';
          const strong = document.createElement('strong');
          strong.textContent = item.quality + ' · ' + item.sizeGB + ' GiB · Encontrado';
          const detail = document.createElement('div');
          detail.textContent = item.title; detail.style.color = '#c7d0e1';
          line.append(strong, detail); output.append(line);
        }
        const note = document.createElement('small');
        note.textContent = 'Resultado informativo: o perfil escolhido abaixo continua sendo gerenciado pelo ' + (mediaType === 'tv' ? 'Sonarr.' : 'Radarr.');
        output.append(note);
      } catch (error) {
        output.textContent = 'Não foi possível consultar agora. O pedido normal continua disponível: ' + error.message;
      } finally {
        busy = false; button.disabled = false; button.textContent = 'Atualizar disponibilidade';
      }
    };
  }
  new MutationObserver(mount).observe(document.documentElement, {childList:true,subtree:true});
  mount();
})();
