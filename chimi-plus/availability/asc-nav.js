/* Chimi+ ASC releases navigation and homepage preview, no automatic per-title indexer search. */
(() => {
  'use strict';
  let homepageRequested=false, scheduled=false;
  function addNav() {
    // Independent of Seerr header markup: a persistent catalogue shortcut.
    if(!document.getElementById('chimi-asc-nav')) {
      const link=document.createElement('a');
      link.id='chimi-asc-nav';
      link.href='/_chimi/asc';
      link.textContent='✦ Novidades ASC';
      link.title='Lançamentos disponíveis no Amigos Share Club';
      link.style.cssText='position:fixed;right:22px;bottom:22px;z-index:10000;display:inline-flex;align-items:center;gap:8px;white-space:nowrap;padding:13px 17px;border:1px solid #56a8e6;border-radius:13px;box-shadow:0 8px 30px #0009;background:#15466b;color:#f0f8ff;font-size:14px;font-weight:750;text-decoration:none';
      document.body.append(link);
    }
  }
  async function preview() {
    if(location.pathname!=='/'||homepageRequested)return;
    const main=document.querySelector('main');
    if(!main || document.getElementById('chimi-asc-preview'))return;
    homepageRequested=true;
    const box=document.createElement('section');box.id='chimi-asc-preview';
    box.style.cssText='margin:12px 16px 24px;padding:20px;border:1px solid #355675;border-radius:14px;background:linear-gradient(110deg,#17283a,#182330 72%);color:#edf4fa';
    const head=document.createElement('div');head.style.cssText='display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:13px';
    const label=document.createElement('div');label.innerHTML='<b style="font-size:19px">Novidades no ASC</b><br><small style="color:#9cb3c9">Lançamentos anunciados no seu tracker, com qualidades reais</small>';
    const action=document.createElement('a');action.href='/_chimi/asc';action.textContent='Ver todos →';
    action.style.cssText='color:#9bd2ff;font-size:13px;font-weight:700';
    head.append(label,action);box.append(head);
    const entries=document.createElement('div');entries.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:10px';
    box.append(entries);
    main.insertBefore(box,main.firstChild);
    try {
      const res=await fetch('/_chimi/catalog-data',{credentials:'same-origin'});
      if(!res.ok)throw Error();
      const data=await res.json();
      for(const item of (data.movies||[]).slice(0,6)) {
        const a=document.createElement('a');a.href='/search?query='+encodeURIComponent(item.title);
        a.style.cssText='display:flex;flex-direction:column;justify-content:space-between;min-height:113px;padding:12px;border:1px solid #344657;border-radius:9px;background:#1e3040;text-decoration:none;color:#f0f5fa';
        const name=document.createElement('b');name.textContent=item.title;
        name.style.cssText='font-size:13px;line-height:1.35';
        const details=document.createElement('small');details.textContent=item.year+' · '+item.qualities.join(' / ');
        details.style.cssText='color:#9dc9e8;font-size:11px;margin-top:9px';
        a.append(name,details);entries.append(a);
      }
    }catch{entries.textContent='Não foi possível atualizar as novidades agora. Use “Ver todos” para tentar novamente.';}
  }
  function mount(){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(()=>{
      scheduled=false;
      if(location.pathname.startsWith('/login')||location.pathname.startsWith('/setup'))return;
      addNav();preview();
    });
  }
  new MutationObserver(mount).observe(document.documentElement,{childList:true,subtree:true});
  mount();
})();
