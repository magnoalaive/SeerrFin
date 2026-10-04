/* Complemento de localização pt-BR da interface Seerr; não traduz nomes de obras nem sinopses. */
(() => {
  'use strict';
  document.documentElement.lang = 'pt-BR';
  const exact = new Map(Object.entries({
    'Request':'Solicitar', 'Request 4K':'Solicitar em 4K', 'Trailer':'Trailer',
    'Runtime':'Duração', 'Ends at':'Termina às', 'Language':'Idioma',
    'Release Date':'Data de estreia', 'Release date':'Data de estreia',
    'Original Language':'Idioma original', 'Original Title':'Título original',
    'View Full Cast':'Ver elenco completo', 'View Full Crew':'Ver equipe completa',
    'Cast':'Elenco', 'Crew':'Equipe', 'Overview':'Sinopse',
    'Similar':'Semelhantes', 'Recommended':'Recomendações',
    'Recommendations':'Recomendações', 'Media Info':'Informações',
    'Movie':'Filme', 'TV Show':'Série', 'Movies':'Filmes', 'TV Shows':'Séries',
    'Home':'Início', 'Discover':'Explorar', 'Search':'Pesquisar',
    'Requests':'Solicitações', 'Issues':'Problemas', 'Settings':'Configurações',
    'Profile':'Perfil', 'Sign Out':'Sair', 'Watch Trailer':'Assistir ao trailer',
    'Request Movie':'Solicitar filme', 'Request Series':'Solicitar série',
    'Request TV Show':'Solicitar série', 'Requesting':'Solicitando',
    'Request Now':'Solicitar agora', 'Cancel':'Cancelar', 'Submit':'Confirmar',
    'Advanced':'Avançado', 'Quality Profile':'Perfil de qualidade',
    'Root Folder':'Pasta raiz', 'Select Season(s)':'Selecione a(s) temporada(s)',
    'Choose quality profile':'Escolha o perfil de qualidade',
    'No seasons available to request':'As temporadas disponíveis já foram solicitadas.',
    'Season':'Temporada', 'Seasons':'Temporadas', 'Episodes':'Episódios',
    'Status':'Estado', 'Not Requested':'Não solicitada',
    'Available':'Disponível', 'Pending':'Pendente', 'Processing':'Processando',
    'Loading...':'Carregando...', 'No Results':'Nenhum resultado',
    'Release Date:':'Data de estreia:', 'Language:':'Idioma:',
    'Runtime:':'Duração:', 'Ends at:':'Termina às:', 'View All':'Ver tudo',
    'Watchlist':'Minha lista', 'Popularity':'Popularidade', 'Rating':'Avaliação',
    'Genres':'Gêneros', 'Show More':'Mostrar mais', 'Show Less':'Mostrar menos',
    'No seasons available':'Nenhuma temporada disponível'
  }));
  const patterns = [
    [/^Runtime:\s*/i,'Duração: '],
    [/\bEnds at\s*/i,'Termina às '],
    [/^Language:\s*/i,'Idioma: '],
    [/^Release Date:\s*/i,'Data de estreia: '],
    [/^Original Language:\s*/i,'Idioma original: '],
    [/^View Full Cast\s*$/i,'Ver elenco completo'],
    [/^Request 4K$/i,'Solicitar em 4K']
  ];
  function translate(raw) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.length > 120) return raw;
    let translated = exact.get(trimmed);
    if (translated === undefined) {
      translated = trimmed;
      for (const [regex, replacement] of patterns) translated = translated.replace(regex, replacement);
    }
    if (translated === trimmed) return raw;
    return raw.replace(trimmed, translated);
  }
  function localize(root) {
    if (!root || !root.isConnected) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const changes = [];
    let node;
    while ((node=walker.nextNode())) {
      const parent=node.parentElement;
      if (!parent || parent.closest('script,style,textarea,code,pre,[contenteditable="true"],#chimi-availability')) continue;
      const next=translate(node.nodeValue);
      if (next!==node.nodeValue) changes.push([node,next]);
    }
    for (const [target,value] of changes) target.nodeValue=value;
    for (const element of root.querySelectorAll('button[title],a[title],input[placeholder]')) {
      if (element.hasAttribute('title')) element.title=translate(element.title);
      if (element.hasAttribute('placeholder')) element.placeholder=translate(element.placeholder);
    }
  }
  let scheduled=false;
  const observer=new MutationObserver(() => {
    if (scheduled) return;
    scheduled=true;
    requestAnimationFrame(() => {scheduled=false; localize(document.body);});
  });
  if (document.body) {
    localize(document.body);
    observer.observe(document.body,{childList:true,subtree:true,characterData:true});
  } else document.addEventListener('DOMContentLoaded', () => {
    localize(document.body);
    observer.observe(document.body,{childList:true,subtree:true,characterData:true});
  }, {once:true});
})();
