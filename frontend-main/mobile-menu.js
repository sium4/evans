// Mobile menu behavior: open/close, collapsibles, search, routing
(function(){
  let toggle, menu, backdrop, closeBtn, searchInput, searchBtn;

  function queryElements(){
    toggle = document.getElementById('mobileMenuToggle');
    menu = document.getElementById('mobileMenu');
    backdrop = document.getElementById('mobileMenuBackdrop');
    closeBtn = document.getElementById('mobileMenuClose');
    searchInput = document.getElementById('mobileSearchInput');
    searchBtn = document.getElementById('mobileSearchBtn');
  }

  function debugState(){
    try{
      console.log('[mobile-menu] init — elements:', {
        toggle: !!toggle,
        menu: !!menu,
        backdrop: !!backdrop,
        closeBtn: !!closeBtn,
        searchInput: !!searchInput,
        searchBtn: !!searchBtn
      });
    }catch(e){}
  }

  function showBackdrop(){ if(!backdrop) return; backdrop.hidden = false; requestAnimationFrame(()=>{ backdrop.style.opacity = '1'; }); }
  function hideBackdrop(){ if(!backdrop) return; backdrop.style.opacity = '0'; setTimeout(()=>{ backdrop.hidden = true; }, 260); }
  function openMenu(){ if(!menu) return; menu.setAttribute('aria-hidden','false'); showBackdrop(); document.body.style.overflow = 'hidden'; try{ if(stickyBar) stickyBar.style.display = 'none'; }catch(e){} }
  function closeMenu(){ if(!menu) return; menu.setAttribute('aria-hidden','true'); hideBackdrop(); document.body.style.overflow = ''; try{ if(stickyBar) stickyBar.style.display = ''; }catch(e){} }

  function attachToggle(){
    if(!toggle) return false;
    if(toggle.__mobileMenuAttached) return true;
    toggle.addEventListener('click', ()=>{
      try{ console.log('[mobile-menu] toggle clicked'); }catch(e){}
      const isHidden = menu && menu.getAttribute('aria-hidden') !== 'false';
      if(isHidden) openMenu(); else closeMenu();
    });
    toggle.__mobileMenuAttached = true;
    return true;
  }

  function attachCloseHandlers(){
    if(closeBtn && !closeBtn.__mobileCloseAttached){ closeBtn.addEventListener('click', closeMenu); closeBtn.__mobileCloseAttached = true; }
    if(backdrop && !backdrop.__mobileCloseAttached){ backdrop.addEventListener('click', closeMenu); backdrop.__mobileCloseAttached = true; }
  }

  function attachMenuLinks(){
    if(menu && !menu.__mobileLinksAttached){
      menu.addEventListener('click', (ev)=>{
        const a = ev.target.closest('a');
        if(!a) return; const href = a.getAttribute('href'); if(!href) return; ev.preventDefault(); navigateTo(href);
      });
      menu.__mobileLinksAttached = true;
    }
  }

  function attachSearch(){
    if(searchBtn && !searchBtn.__mobileSearchAttached){
      searchBtn.addEventListener('click', ()=>{
        const q = (searchInput && searchInput.value||'').trim();
        const url = q ? `categories.html?search=${encodeURIComponent(q)}` : 'categories.html';
        navigateTo(url);
      });
      searchBtn.__mobileSearchAttached = true;
    }
    if(searchInput && !searchInput.__mobileEnterAttached){
      searchInput.addEventListener('keydown', (e)=>{ if(e.key === 'Enter') searchBtn && searchBtn.click(); });
      searchInput.__mobileEnterAttached = true;
    }
  }

  function attachCollapsers(){
    document.querySelectorAll('.mobile-menu__collapser').forEach(btn=>{
      if(btn.__mobileCollapserAttached) return;
      const targetId = btn.dataset.target; const target = document.getElementById(targetId);
      if(target){ const closed = target.hasAttribute('hidden'); btn.setAttribute('aria-expanded', String(!closed)); const arrow = btn.querySelector('.mobile-menu__collapser-arrow'); if(arrow) arrow.textContent = closed ? '▼' : '▲'; }
      btn.addEventListener('click', ()=>{
        const id = btn.dataset.target; const el = document.getElementById(id); if(!el) return; const isHidden = el.hasAttribute('hidden'); const arrow = btn.querySelector('.mobile-menu__collapser-arrow');
        if(isHidden){ el.removeAttribute('hidden'); el.setAttribute('aria-hidden','false'); btn.setAttribute('aria-expanded','true'); if(arrow) arrow.textContent = '▲'; }
        else { el.setAttribute('hidden',''); el.setAttribute('aria-hidden','true'); btn.setAttribute('aria-expanded','false'); if(arrow) arrow.textContent = '▼'; }
      });
      btn.__mobileCollapserAttached = true;
    });
  }

  function renderMenusFromCategories(categories){
    const menusSection = document.getElementById('menusSection'); if(!menusSection) return; menusSection.innerHTML = '';
    categories.forEach(cat => { const li = document.createElement('li'); li.className = 'mobile-subitem'; const slug = (cat.name || cat).toString().toLowerCase().replace(/\s+/g,'-'); const a = document.createElement('a'); a.href = `categories.html#${slug}`; a.textContent = cat.name || cat; li.appendChild(a); menusSection.appendChild(li); });
  }

  function navigateTo(path){ closeMenu(); setTimeout(()=>{ window.location.href = path; }, 200); }

  // close on Escape
  document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape') closeMenu(); });

  function init(){ queryElements(); debugState(); attachToggle(); attachCloseHandlers(); attachMenuLinks(); attachSearch(); attachCollapsers(); }
  init();
  try{ if(typeof window.moveCategoriesForMobile === 'function') window.moveCategoriesForMobile(); }catch(e){}

  if(!toggle){
    document.addEventListener('DOMContentLoaded', ()=>{
      init();
      if(!toggle){ let attempts = 0; const id = setInterval(()=>{ attempts++; queryElements(); if(attachToggle() || attempts > 10){ clearInterval(id); debugState(); } }, 250); }
    });
  }

  if(window.CATEGORIES && window.CATEGORIES.length){ renderMenusFromCategories(window.CATEGORIES); }
  window.addEventListener('categories:loaded', (ev)=>{ const categories = ev && ev.detail ? ev.detail : (window.CATEGORIES || []); if(Array.isArray(categories) && categories.length){ renderMenusFromCategories(categories); } });

  // Ensure desktop layout restores immediately when resizing from mobile.
  // Some browsers keep focus/inline styles or aria states; clear mobile-only state when width > 700px.
  function handleViewportChange(){
    const w = window.innerWidth || document.documentElement.clientWidth;
    if(w > 700){
      // close mobile menu and hide backdrop
      try{ if(menu) menu.setAttribute('aria-hidden','true'); }catch(e){}
      try{ if(backdrop) { backdrop.style.opacity = '0'; backdrop.hidden = true; } }catch(e){}
      try{ document.body.style.overflow = ''; }catch(e){}
      // ensure hamburger doesn't retain attached visual focus state
      try{ if(toggle) toggle.classList.remove('is-open'); }catch(e){}
      // re-query and reattach to ensure desktop DOM is in expected state
      queryElements();
      attachToggle();
      attachCloseHandlers();
      attachMenuLinks();
      attachSearch();
      // Ensure any layout-moving logic in main.js runs (moveCategoriesForMobile)
      try{ if(typeof window.moveCategoriesForMobile === 'function') window.moveCategoriesForMobile(); }catch(e){}
    }
  }

  let _rv; window.addEventListener('resize', ()=>{ clearTimeout(_rv); _rv = setTimeout(handleViewportChange, 120); });
  // run once on load
  handleViewportChange();

  /* ========== Sticky mobile bar: create element, sync, and scroll detection ========== */
  let stickyBar, stickyBadge;

  function createStickyBar(){
    // Sticky bar removed — no-op factory to avoid runtime errors from other code.
    stickyBar = null; stickyBadge = null; return null;
  }

  function showStickyBar(){ /* sticky bar removed — no-op */ }
  function hideStickyBar(){ /* sticky bar removed — no-op */ }

  // Mirror existing cart count if present in page (selectors to try)
  function syncCartBadgeFromPage(){
    // Sticky bar removed — update header badges only so UI reflects cart state.
    const selectors = ['.navbar__cart-count','.cart-count','#cartCount','.cart-badge','.cart-qty'];
    let found = null;
    for(const s of selectors){ const el = document.querySelector(s); if(el){ found = el; break; } }
    let count = 0;
    if(found){ const txt = (found.textContent||found.innerText||'').trim(); count = parseInt(txt.replace(/[^0-9]/g,'')) || 0; }
    try{
      document.querySelectorAll('.navbar__cart-count').forEach(el=>{
        if(count > 0){ el.textContent = String(count); el.classList.remove('hidden'); el.style.display = ''; }
        else { el.textContent = '0'; el.classList.add('hidden'); el.style.display = 'none'; }
      });
    }catch(e){}
  }

  // Observe mutations to mirror changes to cart count, including dynamically inserted elements
  let _stickyCartSelector = null;
  const DEFAULT_CART_SELECTORS = ['.navbar__cart-count','.cart-count','#cartCount','.cart-badge','.cart-qty','[data-cart-count]','.cart .count','.cart .badge'];

  // Allow other scripts to set a specific selector if they know it
  window.setStickyCartSelector = function(sel){ _stickyCartSelector = sel; try{ observeCartCount(); }catch(e){} };

  // Try to find an element matching known selectors (or the user-provided one)
  function findCartElement(){
    const list = _stickyCartSelector ? [_stickyCartSelector].concat(DEFAULT_CART_SELECTORS) : DEFAULT_CART_SELECTORS;
    for(const s of list){ try{ const el = document.querySelector(s); if(el) return el; }catch(e){} }
    return null;
  }

  // Observe direct element or watch the document for nodes being added that match the selectors
  function observeCartCount(){
    // Sticky bar removed — still keep a lightweight sync for header badges.
    try{ syncCartBadgeFromPage(); }catch(e){}
  }

  // Allow other parts of the app to broadcast an update
  window.addEventListener('cart:updated', (ev)=>{ try{ const d = ev && ev.detail; if(d && typeof d.count !== 'undefined') window.updateStickyCartCount(d.count); else syncCartBadgeFromPage(); }catch(e){} });

  // Scroll detection: throttle via requestAnimationFrame
  let lastKnownScrollY = 0; let ticking = false;
  function onScroll(){ lastKnownScrollY = window.scrollY || window.pageYOffset; if(!ticking){ window.requestAnimationFrame(()=>{ handleScroll(lastKnownScrollY); ticking = false; }); ticking = true; } }

  // Show sticky bar when original toggle is not visible and user has scrolled down a bit
  function isElementVisibleInViewport(el){ if(!el) return false; const r = el.getBoundingClientRect(); return (r.top >= 0 && r.bottom <= (window.innerHeight || document.documentElement.clientHeight)) || (r.top < (window.innerHeight || document.documentElement.clientHeight) && r.bottom > 0); }

  function handleScroll(scrollY){ /* sticky bar removed — no scroll-based show/hide */ }

  // Attach scroll listener lazily on mobile sizes
  function attachStickyScroll(){ /* sticky bar removed — no-op */ }

  // Re-evaluate sticky attachment on resize to/from mobile
  let _sv; window.addEventListener('resize', ()=>{ clearTimeout(_sv); _sv = setTimeout(()=>{ if(window.innerWidth <= 768){ /*sticky removed*/ observeCartCount(); } else { /*sticky removed*/ } }, 160); });

  // init lightweight sync on load
  document.addEventListener('DOMContentLoaded', ()=>{ observeCartCount(); });

  // Public helper: allow other code to update the sticky cart badge
  window.updateStickyCartCount = function(count){ try{ const n = Number(count) || 0; try{ document.querySelectorAll('.navbar__cart-count').forEach(el=>{ if(n>0){ el.textContent = String(n); el.classList.remove('hidden'); el.style.display = ''; } else { el.textContent = '0'; el.classList.add('hidden'); el.style.display = 'none'; } }); }catch(e){} }catch(e){} };

})();
