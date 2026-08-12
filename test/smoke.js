/* Minimal DOM stub + smoke test for the app script */
const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'),'utf8');
const m = src.match(/<script>\r?\n([\s\S]*)\r?\n<\/script>/);
const appjs = m[1];

const stripTags = s => String(s).replace(/<[^>]*>/g,' ').replace(/&(amp|lt|gt|quot|nbsp);/g,' ').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim();
const mkClassList = init => {
  const set = new Set((init||'').split(/\s+/).filter(Boolean));
  return { add:(...c)=>c.forEach(x=>set.add(x)), remove:(...c)=>c.forEach(x=>set.delete(x)),
    toggle:(c,f)=>{ const on = f===undefined ? !set.has(c) : f; on?set.add(c):set.delete(c); return on; },
    contains:c=>set.has(c) };
};
class El {
  constructor(tag='div'){ this.tagName=tag.toUpperCase(); this.children=[]; this.attrs={}; this._html=''; this._cls=''; this.style={};
    this.dataset={}; this.classList=mkClassList(); this.disabled=false; this.checked=false; this.value=''; this.hidden=false; }
  set className(v){ this._cls=v; this.classList=mkClassList(v); } get className(){ return this._cls; }
  setAttribute(k,v){ this.attrs[k]=String(v); if(k.startsWith('data-')){ this.dataset[k.slice(5).replace(/-(\w)/g,(_,c)=>c.toUpperCase())]=String(v); } }
  getAttribute(k){ return this.attrs[k] ?? null; } removeAttribute(k){ delete this.attrs[k]; }
  set innerHTML(v){ this._html=String(v); } get innerHTML(){ return this._html; }
  get textContent(){ return stripTags(this._html) + this.children.map(c=>c.textContent||'').join(''); }
  append(...kids){ kids.forEach(k=>this.children.push(k)); }
  appendChild(k){ this.children.push(k); return k; }
  addEventListener(){} removeEventListener(){}
  querySelector(){ return new El(); } querySelectorAll(){ return []; }
  scrollIntoView(){} focus(){} blur(){} click(){} remove(){} replaceWith(){} setSelectionRange(){}
  insertBefore(n){ this.children.push(n); }
  get firstChild(){ return this.children[0] ?? null; }
  get parentNode(){ return new El(); }
  closest(){ return null; }
  cloneNode(){ return new El(this.tagName); }
}
const elCache = new Map();
const getEl = sel => { if(!elCache.has(sel)) elCache.set(sel, new El()); return elCache.get(sel); };
const storeMem = {};
const documentStub = {
  createElement: t => new El(t),
  createTextNode: s => ({ nodeType:3, textContent:String(s) }),
  querySelector: s => getEl(s), querySelectorAll: () => [],
  getElementById: id => null, addEventListener(){}, activeElement:null, title:'',
  documentElement: { dataset:{}, style:{} },
  body: new El('body'),
};
const g = {
  document: documentStub,
  window: { addEventListener(){}, scrollTo(){}, print(){}, scrollY:0, innerWidth:1280, location:{hash:'#/', protocol:'file:'}, history:{replaceState(){}} },
  localStorage: { getItem:k=>storeMem[k]??null, setItem:(k,v)=>{storeMem[k]=String(v)} },
  matchMedia: ()=>({matches:false}),
  addEventListener(){}, requestAnimationFrame: fn=>fn(), setTimeout, clearTimeout,
  location: {hash:'#/', protocol:'file:'}, history:{replaceState(){}}, navigator:{},
  innerWidth:1280, scrollY:0, scrollTo(){}, print(){},
};
const fnBody = appjs + '\n;return { ARTICLES, MATERIALS, CATS, USES, SYNERGIES, GLOSSARY, INDEX, ICONS, R, state, searchAll, fuzzy, renderAnalysis, radarSVG, heroSVG, AXES };';
const fn = new Function(...Object.keys(g), fnBody);
const api = fn(...Object.values(g));

let fails = 0;
const check = (name, cond, extra='') => { if(!cond){ fails++; console.log('FAIL :', name, extra); } else console.log(' ok  :', name); };

/* data integrity */
const ids = api.MATERIALS.map(x=>x.id);
check('material ids unique', new Set(ids).size===ids.length);
check('44 materials', api.MATERIALS.length===44, String(api.MATERIALS.length));
check('18 articles', api.ARTICLES.length===18, String(api.ARTICLES.length));
check('article ids unique', new Set(api.ARTICLES.map(a=>a.id)).size===api.ARTICLES.length);
const catIds = new Set(api.CATS.map(c=>c.id));
check('material categories valid', api.MATERIALS.every(x=>catIds.has(x.cat)));
check('scores valid', api.MATERIALS.every(x=>x.sc.length===7 && x.sc.every(v=>v>=1&&v<=10)));
check('cost/mnt valid', api.MATERIALS.every(x=>x.cost>=1&&x.cost<=4 && ['Low','Moderate','High'].includes(x.mnt)));
check('uses valid', api.MATERIALS.every(x=>x.uses.every(u=>u in api.USES)));
const mById = new Map(api.MATERIALS.map(x=>[x.id,x]));
check('combos resolve', api.MATERIALS.every(x=>(x.combos||[]).every(id=>mById.has(id))));
check('alts resolve', api.MATERIALS.every(x=>(x.alts||[]).every(id=>mById.has(id))));
check('synergies resolve', api.SYNERGIES.every(s=>s.ids.every(id=>mById.has(id))));
check('glossary >= 40', api.GLOSSARY.length>=40, String(api.GLOSSARY.length));
check('index size', api.INDEX.length === api.ARTICLES.length+api.MATERIALS.length+api.GLOSSARY.length);
/* internal links */
const aIds = new Set(api.ARTICLES.map(a=>a.id));
let badLinks = [];
for(const a of api.ARTICLES){
  for(const mm of a.html.matchAll(/href="#\/article\/([\w-]+)"/g)) if(!aIds.has(mm[1])) badLinks.push(a.id+' -> '+mm[1]);
  for(const mm of a.html.matchAll(/href="#\/material\/([\w-]+)"/g)) if(!mById.has(mm[1])) badLinks.push(a.id+' -> material/'+mm[1]);
}
check('internal links resolve', badLinks.length===0, badLinks.join('; '));
/* icon names used via Is()/I() literals */
const iconRefs = new Set([...appjs.matchAll(/\bI[s]?\('([a-zA-Z]+)'/g)].map(x=>x[1]));
const missing = [...iconRefs].filter(n=>!(n in api.ICONS));
check('icons exist', missing.length===0, missing.join(','));
check('category icons exist', api.CATS.every(c=>c.icon in api.ICONS));
/* renderers execute */
for(const r of ['home','library','compare','glossary','favourites','search','notfound','materials']){
  try{ const res = api.R[r](); check('render '+r, !!res && !!res.root && typeof res.title==='string'); }
  catch(e){ check('render '+r, false, e.message); }
}
try{ for(const a of api.ARTICLES){ const res = api.R.article(a.id); if(!res.root) throw new Error('no root for '+a.id); } check('render all 18 articles', true); }catch(e){ check('render all 18 articles', false, e.message); }
try{ for(const mm of api.MATERIALS){ const res = api.R.material(mm.id); if(!res.root) throw new Error('no root for '+mm.id); } check('render all 44 materials', true); }catch(e){ check('render all 44 materials', false, e.message); }
/* analysis engine */
try{
  const box = new El();
  api.renderAnalysis(box, api.MATERIALS);
  check('analysis full-set renders', box.innerHTML.includes('Selection overview') && box.innerHTML.includes('Compatible combinations'));
  const box2 = new El();
  api.renderAnalysis(box2, [mById.get('latex-flat')]);
  check('analysis single runs', box2.innerHTML.includes('Selection overview'));
  const box3 = new El(); api.renderAnalysis(box3, []);
  check('analysis empty state', box3.innerHTML.includes('analysis appears here'));
  const box4 = new El();
  api.renderAnalysis(box4, [mById.get('yew'), mById.get('linen'), mById.get('hideglue')]);
  check('period system detected', box4.innerHTML.includes('Mary Rose') || box4.innerHTML.includes('yew-bow'));
}catch(e){ check('analysis engine', false, e.message); }
/* search */
const r1 = api.searchAll('sinew');
check('search finds sinew', r1.articles.length>0 && r1.materials.some(x=>x.id==='sinew'));
const r2 = api.searchAll('zxyqw');
check('search no-crash on junk', Array.isArray(r2.articles));
check('fuzzy positive', api.fuzzy('brace','brace height')>0);
check('fuzzy zero on mismatch', api.fuzzy('xyz','brace height')===0);
/* radar */
const svg = api.radarSVG([{name:'a',scores:[5,5,5,5,5,5,5]},{name:'b',scores:[8,8,8,8,8,8,8]}]);
check('radar svg', svg.startsWith('<svg') && (svg.match(/radar-shape/g)||[]).length===2);
console.log('\n' + (fails ? fails+' FAILURES' : 'ALL CHECKS PASSED'));
process.exit(fails?1:0);
