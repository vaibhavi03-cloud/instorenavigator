// script.js — Commercial Grade In-Store Navigator (Blue theme)
// Loads items.json, renders UI, handles multi-language (en/hi/kn), voice, routing, 3D & AR toggles.

/* ========== CONFIG ========== */
const CONFIG = {
  canvasW: 1200,
  canvasH: 800,
  entrance: { x: 80, y: 80 },
  routeSpeed: 0.9
};

/* ========== DOM ========== */
const langSelect = document.getElementById('langSelect');
const floorSelect = document.getElementById('floorSelect');
const mapCanvas = document.getElementById('mapCanvas');
const mapCtx = mapCanvas.getContext('2d');
const markerEl = document.getElementById('marker');
const routeOverlay = document.getElementById('routeOverlay');

const sectionPills = document.getElementById('sectionPills');
const searchInput = document.getElementById('searchInput');
const detailImg = document.getElementById('detailImg');
const detailName = document.getElementById('detailName');
const detailBrand = document.getElementById('detailBrand');
const detailPrice = document.getElementById('detailPrice');
const detailStock = document.getElementById('detailStock');
const detailFloor = document.getElementById('detailFloor');

const allItemsContainer = document.getElementById('allItems');
const shopListContainer = document.getElementById('shopList');
const tabAllBtn = document.getElementById('tabAll');
const tabListBtn = document.getElementById('tabList');
const cartTotalEl = document.getElementById('cartTotal');

const navNowBtn = document.getElementById('navNow');
const addToCartBtn = document.getElementById('addToCart');
const toggle3DBtn = document.getElementById('toggle3D');
const enterARBtn = document.getElementById('enterAR');
const voiceSearchBtn = document.getElementById('voiceSearchBtn');
const loginBtn = document.getElementById('loginBtn');

let ITEMS = [];
let selectedItem = null;
let shoppingList = [];
let currentFloor = Number(floorSelect.value || 1);
let is3D = false;
let arStream = null;

/* ---------- Load items.json ---------- */
async function loadItems() {
  try {
    const res = await fetch('items.json');
    if (!res.ok) throw new Error('items.json missing');
    ITEMS = await res.json();
  } catch (e) {
    console.warn('items.json not found — using demo set', e);
    ITEMS = demoItems(120);
  }
  normalizeItems();
}

/* Demo generator */
function demoItems(n=80){
  const cats = ['Grocery','Electronics','Fashion','Cosmetics','Home','Books','Toys','Food Court'];
  const brands = ['A','B','C','D','E','F','G','H','I','J'];
  const arr = [];
  for(let i=0;i<n;i++){
    arr.push({
      id: 'd'+i,
      name: `${cats[i % cats.length]} Item ${i+1}`,
      brand: 'Brand '+brands[i%brands.length],
      price: Math.round(20 + Math.random()*400),
      stock: Math.random() > 0.15 ? 'In Stock' : 'Out of Stock',
      floor: 1 + Math.floor(Math.random()*3),
      section: cats[i % cats.length],
      x: null, y: null,
      image: null
    });
  }
  return arr;
}

/* Normalize dataset fields */
function normalizeItems(){
  ITEMS = ITEMS.map((it, idx) => {
    const id = it.id || `item-${idx}`;
    const name = it.name || `Item ${idx+1}`;
    const brand = it.brand || '';
    const price = (typeof it.price === 'number') ? it.price : (parseFloat(it.price) || Math.round(30 + Math.random()*400));
    const stock = it.stock || 'In Stock';
    const floor = (it.floor && [1,2,3].includes(Number(it.floor))) ? Number(it.floor) : (1 + Math.floor(Math.random()*3));
    const section = it.section || guessSection(name);
    const pos = computeCoords(it, floor, idx);
    const image = it.image || `https://via.placeholder.com/180x120?text=${encodeURIComponent(name.split(' ')[0])}`;
    return { id, name, brand, price, stock, floor, section, x: pos.x, y: pos.y, image };
  });
}

/* Guess section */
function guessSection(name='') {
  const s = name.toLowerCase();
  if (/milk|bread|rice|oil|chips|butter|sugar/.test(s)) return 'Grocery';
  if (/phone|laptop|tv|charger|camera/.test(s)) return 'Electronics';
  if (/shirt|jeans|dress|shoe|fashion/.test(s)) return 'Fashion';
  if (/soap|shampoo|cream|toothpaste/.test(s)) return 'Cosmetics';
  if (/sofa|lamp|decor|table/.test(s)) return 'Home';
  if (/book|pen|note/.test(s)) return 'Books';
  if (/toy|lego|game/.test(s)) return 'Toys';
  if (/burger|pizza|cafe|coffee|food/.test(s)) return 'Food Court';
  return ['Grocery','Electronics','Fashion','Home'][Math.floor(Math.random()*4)];
}

/* Compute coordinates */
function computeCoords(it, floor, idx) {
  const zones = {
    1: { xMin: 120, xMax: 360, yMin: 120, yMax: 680 },
    2: { xMin: 420, xMax: 780, yMin: 120, yMax: 680 },
    3: { xMin: 820, xMax: 1080, yMin: 120, yMax: 680 }
  };
  const z = zones[floor] || zones[1];
  const x = (it.x && it.x >= z.xMin && it.x <= z.xMax) ? it.x : Math.round(z.xMin + Math.random() * (z.xMax - z.xMin));
  const y = (it.y && it.y >= z.yMin && it.y <= z.yMax) ? it.y : Math.round(z.yMin + Math.random() * (z.yMax - z.yMin));
  return { x, y };
}

/* ---------- Canvas & draw ---------- */
function resizeCanvas() {
  mapCanvas.width = CONFIG.canvasW;
  mapCanvas.height = CONFIG.canvasH;
  mapCanvas.style.width = '100%';
  mapCanvas.style.height = mapCanvas.parentElement.clientHeight + 'px';
  drawMap();
}
function drawMap() {
  mapCtx.clearRect(0,0,mapCanvas.width,mapCanvas.height);
  const g = mapCtx.createLinearGradient(0,0,mapCanvas.width,mapCanvas.height);
  g.addColorStop(0,'#fbfdff'); g.addColorStop(1,'#f0f7ff');
  mapCtx.fillStyle = g; mapCtx.fillRect(0,0,mapCanvas.width,mapCanvas.height);
  drawFloorZones(); drawAisles(); drawPins(Number(floorSelect.value));
}
function drawFloorZones(){
  const zones = [
    { x: 40, y: 40, w: 340, h: mapCanvas.height - 80, label: 'Floor 1' },
    { x: 400, y: 40, w: 380, h: mapCanvas.height - 80, label: 'Floor 2' },
    { x: 820, y: 40, w: 360, h: mapCanvas.height - 80, label: 'Floor 3' }
  ];
  zones.forEach((z,i)=> {
    mapCtx.beginPath(); roundRect(mapCtx, z.x, z.y, z.w, z.h, 18);
    mapCtx.fillStyle = (Number(floorSelect.value) === i+1) ? 'rgba(12,74,230,0.04)' : 'rgba(20,30,60,0.02)';
    mapCtx.fill();
    mapCtx.font = '14px Poppins'; mapCtx.fillStyle = '#223'; mapCtx.fillText(z.label, z.x + 14, z.y + 26);
  });
}
function drawAisles(){ const xs = [120, 180, 240, 300, 460, 520, 580, 640, 900, 960]; mapCtx.save(); mapCtx.globalAlpha=0.06; mapCtx.fillStyle='#000'; xs.forEach(x=> mapCtx.fillRect(x,140,28,mapCanvas.height-280)); mapCtx.restore(); }
function drawPins(floor){
  const onFloor = ITEMS.filter(it => Number(it.floor) === Number(floor));
  onFloor.forEach(it => {
    mapCtx.beginPath(); mapCtx.arc(it.x, it.y, 10, 0, Math.PI*2);
    mapCtx.fillStyle = (selectedItem && selectedItem.id === it.id) ? '#ff8a00' : '#fff'; mapCtx.fill();
    mapCtx.lineWidth = 3; mapCtx.strokeStyle = '#7c3aed'; mapCtx.stroke();
    mapCtx.font = '11px Poppins'; mapCtx.fillStyle = '#123'; mapCtx.textAlign = 'center'; mapCtx.fillText(it.name.split(' ')[0], it.x, it.y + 28);
  });
}
function roundRect(ctx,x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }

/* ---------- UI render ---------- */
function buildSectionPills() {
  const sections = Array.from(new Set(ITEMS.map(i=>i.section))).slice(0,12);
  sectionPills.innerHTML = '';
  sections.forEach(s => {
    const el = document.createElement('div'); el.className='pill'; el.textContent=s;
    el.addEventListener('click', ()=> { document.querySelectorAll('.pill').forEach(p=>p.classList.remove('active')); el.classList.add('active'); renderAllItems(); });
    sectionPills.appendChild(el);
  });
}
function renderAllItems() {
  const q = (searchInput.value || '').toLowerCase().trim();
  const activePill = document.querySelector('.pill.active'); const sectionFilter = activePill ? activePill.textContent : null;
  const floor = Number(floorSelect.value);
  const list = ITEMS.filter(it => Number(it.floor) === floor)
                    .filter(it => !sectionFilter || it.section === sectionFilter)
                    .filter(it => { if(!q) return true; return (it.name||'').toLowerCase().includes(q) || (it.brand||'').toLowerCase().includes(q) || (it.section||'').toLowerCase().includes(q); })
                    .sort((a,b) => { if(a.stock === 'In Stock' && b.stock !== 'In Stock') return -1; if(b.stock === 'In Stock' && a.stock !== 'In Stock') return 1; return a.price - b.price; });
  allItemsContainer.innerHTML = '';
  list.forEach(it => {
    const card = document.createElement('div'); card.className='item-card';
    card.innerHTML = `<img src="${it.image}" alt="${it.name}"><div class="item-info"><div style="font-weight:600">${it.name}</div><div class="muted">${it.brand} • ${it.section}</div></div><div class="item-actions"><div style="font-weight:700">₹${it.price}</div><div class="muted" style="font-size:13px">${it.stock}</div><div style="margin-top:6px"><button class="small-btn view-btn">View</button><button class="small-btn add-btn">＋</button></div></div>`;
    card.querySelector('.view-btn').addEventListener('click', e => { e.stopPropagation(); selectItem(it); });
    card.querySelector('.add-btn').addEventListener('click', e => { e.stopPropagation(); addToShoppingList(it.id); });
    card.addEventListener('click', ()=> selectItem(it));
    allItemsContainer.appendChild(card);
  });
  if(list.length === 0) allItemsContainer.innerHTML = `<div style="padding:12px;color:var(--muted)">No items found</div>`;
}
function renderShoppingListUI() {
  shopListContainer.innerHTML = ''; let total=0;
  shoppingList.forEach(id => { const it = ITEMS.find(x=>x.id===id); if(!it) return; total+=it.price; const li = document.createElement('div'); li.className='shop-item'; li.innerHTML = `<span>${it.name}</span><strong>₹${it.price}</strong> <button class="small-btn remove-btn">Remove</button>`; li.querySelector('.remove-btn').addEventListener('click', ()=> { removeFromShoppingList(id); }); shopListContainer.appendChild(li); });
  cartTotalEl.textContent = '₹'+total;
}

/* ---------- select / add ---------- */
function selectItem(it) {
  selectedItem = it;
  detailImg.src = it.image;
  detailName.textContent = it.name;
  detailBrand.textContent = `Brand: ${it.brand}`;
  detailPrice.textContent = `Price: ₹${it.price}`;
  detailStock.textContent = `Stock: ${it.stock}`;
  detailFloor.textContent = `Floor: ${it.floor} • ${it.section}`;
  drawMap(); drawPulse(it.x, it.y);
}
function drawPulse(x,y) { let start=null; function frame(ts){ if(!start) start=ts; const t=(ts-start)/600; mapCtx.save(); mapCtx.globalAlpha=Math.max(0,0.2*(1-t)); mapCtx.beginPath(); mapCtx.arc(x,y,30*t,0,Math.PI*2); mapCtx.fillStyle='#7c3aed'; mapCtx.fill(); mapCtx.restore(); if(t<1) requestAnimationFrame(frame); } requestAnimationFrame(frame); }
function addToShoppingList(id){ if(!shoppingList.includes(id)){ shoppingList.push(id); toast('Added to list'); renderShoppingListUI(); } else toast('Already in list'); }
function removeFromShoppingList(id){ shoppingList = shoppingList.filter(x=>x!==id); renderShoppingListUI(); }

/* ---------- routing ---------- */
function buildLRoute(from,to){ return [[from.x,from.y],[from.x,to.y],[to.x,to.y]]; }
function showRoute(points){
  routeOverlay.innerHTML=''; const svgNS='http://www.w3.org/2000/svg'; const svg=document.createElementNS(svgNS,'svg'); svg.setAttribute('width','100%'); svg.setAttribute('height','100%'); svg.style.position='absolute'; svg.style.left='0'; svg.style.top='0';
  const rect = mapCanvas.getBoundingClientRect(); const scaleX = rect.width / mapCanvas.width; const scaleY = rect.height / mapCanvas.height;
  const poly = document.createElementNS(svgNS,'polyline'); poly.setAttribute('points', points.map(p => `${p[0]*scaleX},${p[1]*scaleY}`).join(' ')); poly.setAttribute('fill','none'); poly.setAttribute('stroke','#7c3aed'); poly.setAttribute('stroke-width','6'); poly.style.strokeDasharray='12 8'; svg.appendChild(poly);
  const circ = document.createElementNS(svgNS,'circle'); circ.setAttribute('r',10); circ.setAttribute('fill','#ff8a00'); circ.setAttribute('stroke','#fff'); circ.setAttribute('stroke-width','2'); svg.appendChild(circ);
  routeOverlay.appendChild(svg);
  const pts = points.map(p=>({x:p[0],y:p[1]})); const segs=[]; let total=0; for(let i=0;i<pts.length-1;i++){ const a=pts[i],b=pts[i+1]; const dx=b.x-a.x, dy=b.y-a.y, len=Math.hypot(dx,dy); segs.push({x1:a.x,y1:a.y,dx,dy,len}); total+=len; }
  const speed = CONFIG.routeSpeed; const start=performance.now();
  function step(now){ const elapsed = now-start; const moved = elapsed*speed; if(moved>=total){ const last=pts[pts.length-1]; setOverlayCirclePos(circ,last,rect); return; } let acc=0, idx=0; while(idx<segs.length && acc+segs[idx].len < moved){ acc+=segs[idx].len; idx++; } const seg = segs[Math.min(idx,segs.length-1)]; const segDist = moved-acc; const frac = seg.len===0?0:segDist/seg.len; const cx = seg.x1 + seg.dx*frac; const cy = seg.y1 + seg.dy*frac; setOverlayCirclePos(circ,{x:cx,y:cy},rect); requestAnimationFrame(step); }
  requestAnimationFrame(step);
}
function setOverlayCirclePos(circleEl, pt, rect){ const sx = (pt.x / mapCanvas.width) * rect.width; const sy = (pt.y / mapCanvas.height) * rect.height; circleEl.setAttribute('cx', sx); circleEl.setAttribute('cy', sy); markerEl.style.left = (rect.left + sx) + 'px'; markerEl.style.top = (rect.top + sy) + 'px'; }
async function routeShoppingList() {
  if(shoppingList.length===0) return alert('Shopping list empty'); let remaining = shoppingList.map(id=>ITEMS.find(i=>i.id===id)).filter(Boolean); let cur = {x:CONFIG.entrance.x,y:CONFIG.entrance.y,floor:Number(floorSelect.value)}; while(remaining.length){ let bestIdx=0,bestD=Infinity; for(let i=0;i<remaining.length;i++){ const r=remaining[i]; let d=Math.hypot(r.x-cur.x,r.y-cur.y); if(Number(r.floor)!==Number(cur.floor)) d+=400; if(d<bestD){bestD=d;bestIdx=i;} } const pick = remaining.splice(bestIdx,1)[0]; if(Number(pick.floor)!==Number(floorSelect.value)){ floorSelect.value=pick.floor; currentFloor=pick.floor; drawMap(); renderAllItems(); await sleep(400); } const pts = buildLRoute(cur,{x:pick.x,y:pick.y}); showRoute(pts); await sleep(1400); cur={x:pick.x,y:pick.y,floor:pick.floor}; } speakText('Finished your shopping route'); }

/* ---------- 3D & AR ---------- */
function toggle3D(){ is3D=!is3D; const layout=document.querySelector('.layout'); if(is3D){ layout.style.transform='perspective(1200px) rotateX(8deg) scale(0.98)'; toggle3DBtn.textContent='Exit 3D'; } else { layout.style.transform=''; toggle3DBtn.textContent='3D View'; } }
async function startAR(){ if(arStream){ stopAR(); return; } try{ const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'},audio:false}); arStream=stream; const overlay=document.createElement('div'); overlay.id='arOverlay'; overlay.style.position='fixed'; overlay.style.left='0'; overlay.style.top='0'; overlay.style.width='100%'; overlay.style.height='100%'; overlay.style.zIndex=9999; const video=document.createElement('video'); video.autoplay=true; video.playsInline=true; video.srcObject=stream; video.style.width='100%'; video.style.height='100%'; video.style.objectFit='cover'; overlay.appendChild(video); const close=document.createElement('button'); close.textContent='Close AR'; close.style.position='absolute'; close.style.top='18px'; close.style.right='18px'; close.className='btn primary'; close.onclick=()=> stopAR(); overlay.appendChild(close); document.body.appendChild(overlay); } catch(e){ alert('AR requires camera & HTTPS/localhost.'); } }
function stopAR(){ const ov=document.getElementById('arOverlay'); if(ov) ov.remove(); if(arStream){ arStream.getTracks().forEach(t=>t.stop()); arStream=null; } }

/* ---------- VOICE ---------- */
function speakText(text){ if(!('speechSynthesis' in window)) return; const lang = langSelect.value==='hi' ? 'hi-IN' : (langSelect.value==='kn' ? 'kn-IN' : 'en-IN'); const u=new SpeechSynthesisUtterance(text); u.lang=lang; window.speechSynthesis.cancel(); window.speechSynthesis.speak(u); }
function initVoiceSearch(){ const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition || null; if(!SpeechRecognition){ voiceSearchBtn.onclick = ()=> alert('Voice not supported'); return; } const recog = new SpeechRecognition(); recog.lang = langSelect.value==='hi' ? 'hi-IN' : (langSelect.value==='kn' ? 'kn-IN' : 'en-IN'); recog.onresult = (e)=>{ const text=e.results[0][0].transcript; searchInput.value=text; renderAllItems(); toast('Heard: '+text); }; voiceSearchBtn.addEventListener('click', ()=> recog.start()); }

/* ---------- HELPERS ---------- */
function toast(msg){ const id='toastMsg'; let el=document.getElementById(id); if(!el){ el=document.createElement('div'); el.id=id; el.style.position='fixed'; el.style.left='20px'; el.style.bottom='20px'; el.style.padding='10px 14px'; el.style.background='#07122b'; el.style.color='#fff'; el.style.borderRadius='10px'; el.style.zIndex=9999; document.body.appendChild(el); } el.textContent=msg; el.style.opacity='1'; setTimeout(()=>el.style.opacity='0',1600); }
function sleep(ms){ return new Promise(res=>setTimeout(res,ms)); }

/* ---------- BINDINGS ---------- */
function bindUI(){
  window.addEventListener('resize', ()=> resizeCanvas());
  floorSelect.addEventListener('change', ()=> { drawMap(); renderAllItems(); });
  searchInput.addEventListener('input', renderAllItems);
  tabAllBtn.addEventListener('click', ()=> { tabAllBtn.classList.add('active'); tabListBtn.classList.remove('active'); document.getElementById('allItems').classList.remove('hidden'); document.getElementById('shopList').classList.add('hidden'); });
  tabListBtn.addEventListener('click', ()=> { tabListBtn.classList.add('active'); tabAllBtn.classList.remove('active'); document.getElementById('allItems').classList.add('hidden'); document.getElementById('shopList').classList.remove('hidden'); renderShoppingListUI(); });
  navNowBtn.addEventListener('click', routeToSelected);
  addToCartBtn.addEventListener('click', ()=> { if(selectedItem) addToShoppingList(selectedItem.id); });
  toggle3DBtn.addEventListener('click', toggle3D);
  enterARBtn.addEventListener('click', ()=> { if(!arStream) startAR(); else stopAR(); });
  voiceSearchBtn.addEventListener('click', ()=> initVoiceSearch());
  loginBtn.addEventListener('click', ()=> { const name = prompt('Enter your name (demo)'); if(name){ localStorage.setItem('instore_user',name); loginBtn.textContent='Hi, '+name; } });
  langSelect.addEventListener('change', ()=> updateLanguage());
  document.getElementById('routeList').addEventListener('click', ()=> routeShoppingList());
  document.getElementById('clearRoute').addEventListener('click', ()=> { routeOverlay.innerHTML=''; });
}

/* ---------- route to selected ---------- */
function routeToSelected() {
  if(!selectedItem) return alert('Select item');
  if(Number(selectedItem.floor) !== Number(floorSelect.value)){ floorSelect.value = selectedItem.floor; drawMap(); renderAllItems(); }
  const pts = buildLRoute(CONFIG.entrance, { x:selectedItem.x, y:selectedItem.y });
  showRoute(pts);
  speakText('Starting navigation');
}

/* ---------- INIT ---------- */
async function init(){
  resizeCanvas();
  await loadItems();
  buildSectionPills();
  renderAllItems();
  bindUI();
  initVoiceSearch();
  renderShoppingListUI();
}
init();

/* ---------- small utility for demo ---------- */
function renderShoppingList(){ renderShoppingListUI(); }
