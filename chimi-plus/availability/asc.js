(() => {
  'use strict';
  let all = [], filter = 'Todos';
  const posterCache = new Map();
  const grid = document.querySelector('#grid'), status = document.querySelector('#updated');
  function normalize(s) {
    return (s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  }
  function makeCard(movie) {
    const a=document.createElement('a');
    a.className='card';
    a.href='/search?query='+encodeURIComponent(movie.title);
    a.setAttribute('aria-label','Buscar '+movie.title+' no Chimi+');
    const art=document.createElement('div'); art.className='art';
    const fallback=document.createElement('span');fallback.className='fallback';fallback.textContent=movie.title;
    art.append(fallback);
    const chips=document.createElement('div');chips.className='chips';
    for(const q of movie.qualities) {
      const chip=document.createElement('span');chip.className='chip'+(q==='4K'?' hdr':'');
      chip.textContent=q; chips.append(chip);
    }
    art.append(chips);
    const info=document.createElement('div');info.className='info';
    const name=document.createElement('div');name.className='name';name.textContent=movie.title;
    const meta=document.createElement('div');meta.className='meta';
    meta.textContent=movie.year+' · '+movie.releases+' release'+(movie.releases!==1?'s':'')+' no ASC';
    info.append(name,meta); a.append(art,info);grid.append(a);
    return {movie,art,a};
  }
  function fallbackMessage(art, title) {
    const fallback=art.querySelector('.fallback');
    if (fallback) { fallback.textContent=title; fallback.style.display='block'; }
    art.title='Capa ainda não encontrada no catálogo de imagens';
  }
  async function findPoster(card) {
    const {movie,art,a}=card;
    try {
      const key=movie.title+'|'+movie.year;
      if (!posterCache.has(key)) {
        posterCache.set(key,fetch('/api/v1/search?query='+encodeURIComponent(movie.title),{credentials:'same-origin'})
          .then(r => r.ok ? r.json() : {results:[]}).catch(() => ({results:[]})));
      }
      const data=await posterCache.get(key);
      const results=Array.isArray(data.results)?data.results:[];
      const match=results.find(x => {
        const name=x.originalTitle||x.title||'';
        const year=(x.releaseDate||'').slice(0,4);
        return x.mediaType==='movie' && year===movie.year &&
          (normalize(name)===normalize(movie.title)||normalize(x.title)===normalize(movie.title));
      });
      if (!match) { fallbackMessage(art,movie.title); return; }
      a.href='/movie/'+match.id;
      const artPath=match.posterPath||match.backdropPath;
      if (artPath && /^\/[a-zA-Z0-9/_-]+\.(?:jpg|jpeg|png|webp)$/i.test(artPath)) {
        const img=document.createElement('img');img.loading='lazy';
        img.alt='Pôster de '+movie.title;
        img.src='/imageproxy/tmdb/t/p/w342'+artPath;
        img.onerror=()=>{ img.remove(); fallbackMessage(art, movie.title); };
        art.insertBefore(img,art.firstChild);
      } else fallbackMessage(art,movie.title);
    } catch {}
  }
  function render() {
    grid.replaceChildren();
    const visible=all.filter(x=>filter==='Todos'||x.qualities.includes(filter));
    if (!visible.length) {
      const empty=document.createElement('div');empty.className='empty';
      empty.textContent='Não há novidades nesta qualidade no feed recente do ASC.';
      grid.append(empty);return;
    }
    const cards=visible.map(makeCard);
    // Resolve todos os cards, progressivamente, sem novas buscas no ASC.
    // Limite de duas pesquisas simultâneas no Seerr.
    (async()=> {
      let next=0;
      await Promise.all(Array.from({length:2},async()=>{
        while(next<cards.length) {
          const card=cards[next++];
          if (!grid.contains(card.a)) continue;
          await findPoster(card);
        }
      }));
    })();
  }
  document.querySelector('#filters').addEventListener('click',e=>{
    const button=e.target.closest('button[data-quality]');
    if(!button)return;
    filter=button.dataset.quality;
    for(const b of document.querySelectorAll('button[data-quality]')) b.classList.toggle('active',b===button);
    render();
  });
  (async()=>{
    try {
      const response=await fetch('/_chimi/catalog-data',{credentials:'same-origin'});
      if(response.status===401){location.assign('/login');return;}
      if(!response.ok)throw Error('Feed indisponível no momento');
      const result=await response.json();
      all=result.movies||[];
      status.textContent=all.length+' filmes · ASC · Atualizado '+new Date(result.updatedAt*1000).toLocaleString('pt-BR');
      render();
    }catch(e){status.textContent='Falha ao carregar';grid.textContent='Não foi possível consultar as novidades do ASC agora. Tente novamente mais tarde.';}
  })();
})();
