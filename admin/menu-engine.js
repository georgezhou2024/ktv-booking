// menu-engine.js —— PH GROUP 菜单比价引擎（纯函数 ESM）
// 规则唯一权威实现：中文优先匹配，英文其次；拿不准进人工预警，不自动合并。
// 浏览器与 Node 均可使用；DOM 通过传入的 dom.parse(html) 注入。

export const STORE_KEYS = ['acme','phroom','eros','sensory'];

// 中文通用品类词（不参与同款判定），长词在前
export const ZH_CAT_WORDS = ['单一麦芽威士忌','单一麦芽','调和型威士忌','调和威士忌','调和','纯麦威士忌','苏格兰威士忌','爱尔兰威士忌','波本威士忌','日本威士忌','加拿大威士忌','利口酒','力娇酒','龙舌兰','梅斯卡尔','麦斯卡尔','威士忌酒','威士忌','白兰地','伏特加','香槟酒','香槟','干邑白兰地','干邑','葡萄酒','鸡尾酒','朗姆酒','朗姆','清酒','烧酎','啤酒','雪茄烟','雪茄','香烟','水烟','金酒','琴酒'].sort((a,b)=>b.length-a);

const EN_CAT_WORDS = 'CHAMPAGNE|TEQUILA|MEZCAL|COGNAC|BOURBON|WHISKY|WHISKEY|VODKA|BRANDY|LIQUEUR|LIQUEURS|GIN|RUM|RICE WINE|SAKE|BEER|CIDER|WINE|COCKTAIL|CIGAR|CIGARS|SPIRIT|SPIRITS';

// 保护数字之间的小数点（1.5L 不能被清理成 15L）
function protectDecimal(s){ return s.replace(/(\d)\.(?=\d)/g,'$1\uE000'); }
function restoreDecimal(s){ return s.replace(/\uE000/g,'.'); }

// ---------- 价格解析 ----------
// 输出 {pairs:[{spec,price,qty}], bundle:[{qty,price,spec}], addon, empty, raw}
export function parsePrice(raw, catId){
  const res = {pairs:[], bundle:[], addon:false, included:false, empty:false, raw:raw};
  if(!raw || !raw.trim()){ res.empty = true; return res; }
  let t = raw.replace(/RMB/i,'¥').replace(/／/g,'/').replace(/\s+/g,' ').trim();
  if(/^[+\s]/.test(t)){ res.addon = true; return res; }
  if(/^[—–\-–]+$/.test(t)){ res.empty = true; return res; }
  if(/套餐内含|赠送/.test(t)){ res.included = true; return res; }
  const segs = t.split(/\s*[-–—]\s*(?=[¥\d])/);
  segs.forEach(seg=>{
    const m = seg.match(/¥?\s*([\d,]+(?:\.\d+)?)\s*(?:\/\s*(\d+)?\s*(瓶|杯|支|盒|份|位|罐|听|扎|壶|套))?/);
    if(!m) return;
    const price = parseFloat(m[1].replace(/,/g,''));
    if(isNaN(price)) return;
    const qty = m[2] ? parseInt(m[2],10) : 1;
    let unit = m[3] || '';
    if(!unit){ unit = (catId==='shisha') ? '壶' : '瓶'; }
    if(unit==='瓶'){
      if(qty===1) res.pairs.push({spec:'瓶', price:price, qty:1});
      else res.bundle.push({qty:qty, price:price, spec:'瓶'});
    } else {
      res.pairs.push({spec:unit, price:price, qty:qty});
    }
  });
  return res;
}

// ---------- 名称归一化 ----------
export function normEn(s){
  let t = (s||'').normalize('NFKD').replace(/[̀-ͯ]/g,'').toUpperCase();
  t = protectDecimal(t);
  t = t.replace(/[“”"'`’‘.,·・•|()（）\[\]{}&/\\:：;；!！?？]/g,' ');
  t = t.replace(/[‑–—-]/g,' ');
  t = t.replace(/(\d{1,2})\s*(?:YEARS?\s*OLD|YEARS?|YEAR|YO|Y\.?O\.?)\b/g,'$1Y');
  t = t.replace(/N[O°º][.\s]*(\d+)/g,'N$1');
  t = t.replace(/\b(?:700|750)\s?ML\b/g,' ').replace(/\b7[05]CL\b/g,' ');
  t = t.replace(new RegExp('\\b(?:'+EN_CAT_WORDS+')\\b','g'),' ');
  t = t.replace(/^THE\s+/,'');
  t = t.replace(/\s+/g,'');
  t = restoreDecimal(t);
  t = t.replace(/X0(?=[A-Z0-9.]|$)/g,'XO'); // 菜单常见笔误 X.0 → XO
  return t;
}
export function enCore(name){
  const latin = (name||'').normalize('NFKD').toUpperCase().match(/[A-Za-z0-9.&'\-–—°º]+/g) || [];
  return normEn(latin.join(' '));
}
export function zhCore(name){
  let t = (name||'').normalize('NFKD').replace(/[̀-ͯ]/g,'').toUpperCase();
  t = protectDecimal(t);
  t = t.replace(/(\d{1,2})\s*(?:YEARS?\s*OLD|YEARS?|YEAR|YO|Y\.?O\.?)\b/g,'$1Y');
  t = t.replace(/(\d{1,2})\s*年/g,'$1Y');
  t = t.replace(/[A-Za-z&'\-–—°º]/g,''); // 去拉丁字母，保留数字与小数点（已保护）
  t = t.replace(/[（）()\s,/、·・•:：;；“”"'`’‘!！?？&‐-―-]/g,'');
  t = restoreDecimal(t);
  t = t.replace(/(\d{1,2}Y)\1+/g,'$1'); // 中英重复年份去重
  return t;
}
// 中文优先匹配键：中文核心 + 有区分意义的拉丁等级（XO/VSOP/M Black 等）+ 年份 + 大容量
export function zhMatchKey(name){
  let t = (name||'').normalize('NFKD').replace(/[̀-ͯ]/g,'').toUpperCase();
  t = t.replace(new RegExp('\\b(?:'+EN_CAT_WORDS+')\\b','g'),' ');
  t = protectDecimal(t);
  t = t.replace(/[“”"'`’‘.,·・•|()（）\[\]{}&/\\:：;；!！?？‐-―-]/g,' ');
  t = t.replace(/(\d+(?:\.\d+)?)\s?毫升/g,'$1ML');
  t = t.replace(/(\d{1,2})\s*(?:YEARS?\s*OLD|YEARS?|YEAR|YO|Y\.?O\.?)\b/g,'$1Y');
  t = t.replace(/(\d{1,2})\s*年/g,'$1Y');
  t = t.replace(/N[O°º][.\s]*(\d+)/g,'N$1');
  t = t.replace(/\b(?:700|750)\s?ML\b/g,' ').replace(/\b7[05]CL\b/g,' ');
  t = t.replace(/^THE\s+/,'');
  ZH_CAT_WORDS.forEach(w=>{ t = t.split(w).join(''); });
  t = t.replace(/\s+/g,'');
  t = restoreDecimal(t);
  t = t.replace(/X0(?=[A-Z0-9.]|$)/g,'XO');
  return t;
}
export function agesOf(core){
  const a = (core||'').match(/\d{1,2}Y/g) || [];
  return new Set(a);
}
export function zhStripped(name){
  let t = zhCore(name);
  ZH_CAT_WORDS.forEach(w=>{ t = t.split(w).join(''); });
  return t;
}
function zhBrandOnly(zh,zhs){
  if(!zhs||zhs===zh) return false;
  return ZH_CAT_WORDS.some(w=>zh===zhs+w);
}
export function cjkLen(s){ return ((s||'').match(/[一-鿿]/g)||[]).length; }
function lev(a,b){
  const m=a.length,n=b.length;
  if(!m) return n; if(!n) return m;
  const dp=Array.from({length:m+1},(_,i)=>[i,...Array(n).fill(0)]);
  for(let j=0;j<=n;j++) dp[0][j]=j;
  for(let i=1;i<=m;i++) for(let j=1;j<=n;j++){
    dp[i][j]=Math.min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
  }
  return dp[m][n];
}
export function sim(a,b){
  if(!a||!b) return 0;
  return 1 - lev(a,b)/Math.max(a.length,b.length);
}
export function enRel(ea,eb){
  if(!ea||!eb) return 'none';
  if(ea===eb) return 'equal';
  const sh=ea.length<=eb.length?ea:eb, lo=ea.length<=eb.length?eb:ea;
  if(sh.length>=6 && lo.includes(sh)) return 'contain';
  if(sim(ea,eb)>=0.9) return 'sim';
  return 'none';
}
function zhPartKey(zkey,en){
  if(en && zkey.length>en.length && zkey.slice(-en.length)===en) return zkey.slice(0,zkey.length-en.length);
  return zkey;
}
export function zhPrefix(a,b){
  if(a===b) return false;
  const sh=a.length<=b.length?a:b, lo=a.length<=b.length?b:a;
  return sh.length>=4 && lo.startsWith(sh);
}

// ---------- 单品提取（DOM 解析，与线上菜单同源） ----------
function extractFromHtml(html, storeKey, catId, catName, out, doc){
  // 后台不需要图片/视频，剥离媒体标签避免发起本地相对路径请求
  html = html.replace(/<(?:video|audio|source|track)\b[\s\S]*?<\/(?:video|audio|source|track)>/g,'')
             .replace(/<(?:img|video|audio|source|track|link)\b[^>]*\/?>/g,'');
  const host = doc.createElement('div');
  host.innerHTML = html;
  host.querySelectorAll('.item').forEach(it=>{
    const nameEl = it.querySelector('.name');
    const priceEl = it.querySelector('.price');
    if(!nameEl) return;
    const clone = nameEl.cloneNode(true);
    const subEl = clone.querySelector('.sub-text');
    let subText = '';
    if(subEl){ subText = subEl.textContent.replace(/\s+/g,' ').trim(); subEl.remove(); }
    const name = clone.textContent.replace(/\s+/g,' ').trim();
    let enRaw='';
    const spanEn = clone.querySelector('.en-name');
    if(spanEn && spanEn.textContent.trim()) enRaw = spanEn.textContent.trim();
    if(!enRaw){
      const cjkM=[...name.matchAll(/[一-鿿]/g)];
      if(cjkM.length){
        let tail=name.slice(cjkM[cjkM.length-1].index+1).trim();
        const loose=s=>s.toUpperCase().replace(/[.\-’']/g,'').replace(/0/g,'O');
        let toks=tail.split(/\s+/).filter(Boolean);
        for(let k=Math.min(3,Math.floor(toks.length/2));k>=1;k--){
          const head=toks.slice(0,k).map(loose), tailK=toks.slice(toks.length-k).map(loose);
          if(head.every((w,i)=>w===tailK[i])){ toks=toks.slice(k); break; }
        }
        tail=toks.join(' ').trim();
        tail=tail.replace(/^(?:VSOP|XXO|XO|VS|NAPOLEON|\d+\s?ML|\d+(?:\.\d+)?\s?L)\b/i,'').trim();
        if(/[A-Za-z]{3,}/.test(tail)) enRaw=tail;
      } else enRaw=name;
    }
    let zhName = name;
    if(enRaw && name.endsWith(enRaw)) zhName = name.slice(0, name.length-enRaw.length).trim();
    const rawPrice = priceEl ? priceEl.textContent.replace(/\s+/g,' ').trim() : '';
    const parsed = parsePrice(rawPrice, catId);
    out.push({store:storeKey, catId, catName, name, subText, enRaw, zhName, parsed});
  });
}

// 直接构建可比价 cell 列表（浏览器 DOMParser / linkedom 均可）
export function buildCells(stores, dom, shisha){
  const cellList = [];
  const skipped = {addon:[], empty:[]};
  const raw = [];
  STORE_KEYS.forEach(sk=>{
    const d = stores[sk];
    if(!d) return;
    d.categories.forEach(cat=>{
      const html = d.content[cat.id];
      if(html) extractFromHtml(html, sk, cat.id, cat.name, raw, makeDoc(dom, html));
    });
    if(sk==='phroom' && shisha){
      Object.keys(shisha).forEach(k=>{
        extractFromHtml(shisha[k], sk, 'shisha', '水烟 SHISHA', raw, makeDoc(dom, shisha[k]));
      });
    }
  });
  raw.forEach(it=>{
    const p = it.parsed;
    if(p.addon){ skipped.addon.push(it); return; }
    if(p.included) return; // 套餐内含/赠送，不参与比价也不报缺价
    if(p.empty){ skipped.empty.push(it); return; }
    p.pairs.forEach(pr=>{
      const base = it.zhName||it.name;
      const en = it.enRaw ? enCore(it.enRaw) : enCore(it.name);
      const zh = zhCore(base), zhs = zhStripped(base), zkey = zhMatchKey(base);
      const zp = zhPartKey(zkey,en);
      cellList.push({
        store:it.store, catId:it.catId, catName:it.catName,
        name:it.name, subText:it.subText, spec:pr.spec, price:pr.price,
        bundle:p.bundle, en, zh, zhs, zkey, zp, brandOnly:zhBrandOnly(zh,zhs)
      });
    });
  });
  cellList.skipped = skipped;
  return cellList;
}
// dom.parse 可能返回 document（DOMParser）或 body 元素；统一造一个带 createElement 的载体
function makeDoc(dom, html){
  const node = dom.parse(html);
  // DOMParser 返回 #document；linkedom parseDocument 也是 document
  return node.ownerDocument || node;
}

// ---------- 精确聚类 + 二次合并 ----------
export function clusterCells(cellList){
  const clusters = [];
  const clusterMap = new Map();
  cellList.forEach(c=>{
    const useZh = cjkLen(c.zp)>=2;
    c.useZh = useZh;
    c.key = (useZh ? 'ZH:'+c.zp : c.en) + '||' + c.catId + '||' + c.spec;
    if(!clusterMap.has(c.key)) clusterMap.set(c.key, {key:c.key, catId:c.catId, spec:c.spec, cells:[], useZh:useZh});
    clusterMap.get(c.key).cells.push(c);
  });
  clusters.push(...clusterMap.values());

  function hasBigVol(s){ return /(?:\d{3,}ML|\d{4,}ML|\d+(?:\.\d+)?L\b)/.test((s||'').replace(/(?:700|750)ML/g,'')); }
  function clZp(cl){
    const m={};
    cl.cells.forEach(c=>{ if(c.zp) m[c.zp]=(m[c.zp]||0)+1; });
    const ks=Object.keys(m);
    return ks.length ? ks.sort((x,y)=>m[y]-m[x])[0] : '';
  }
  for(let i=0;i<clusters.length;i++){
    for(let j=i+1;j<clusters.length;j++){
      const a=clusters[i], b=clusters[j];
      if(a.catId!==b.catId||a.spec!==b.spec) continue;
      const A=a.cells[0], B=b.cells[0];
      const ea=A.en||'', eb=B.en||'', za=clZp(a), zb=clZp(b);
      if(hasBigVol(ea+A.zp)!==hasBigVol(eb+B.zp)) continue;
      const er=enRel(ea,eb);
      const ca=cjkLen(za), cb=cjkLen(zb);
      let merge=false;
      if(ca>=2&&cb>=2){
        if(za===zb){ merge = er!=='none'||!ea||!eb; }
        else if(er==='equal'&&(sim(za,zb)>=0.85||zhPrefix(za,zb))){ merge=true; }
      } else {
        merge=(er==='equal');
      }
      if(merge){
        b.cells.forEach(c=>{ a.cells.push(c); c._movedTo=a; });
        clusters.splice(j,1); j--;
      }
    }
  }
  return clusters;
}

// ---------- 名称不符预警 + 模糊建议 ----------
export function analyze(clusters, cellList, storeNames){
  const pendPairs = [];
  const nameMismatches = [];
  function clZp(cl){
    const m={};
    cl.cells.forEach(c=>{ if(c.zp) m[c.zp]=(m[c.zp]||0)+1; });
    const ks=Object.keys(m);
    return ks.length ? ks.sort((x,y)=>m[y]-m[x])[0] : '';
  }
  const byGroup = {};
  clusters.forEach(cl=>{
    const g = cl.catId+'||'+cl.spec;
    (byGroup[g]=byGroup[g]||[]).push(cl);
  });
  Object.values(byGroup).forEach(group=>{
    for(let i=0;i<group.length;i++) for(let j=i+1;j<group.length;j++){
      const a=group[i], b=group[j];
      const stores=new Set([...a.cells.map(c=>c.store),...b.cells.map(c=>c.store)]);
      if(stores.size<2) continue;
      const A=a.cells[0], B=b.cells[0];
      const ea=A.en||'', eb=B.en||'', za=clZp(a), zb=clZp(b);
      const er=enRel(ea,eb);
      const ca=cjkLen(za), cb=cjkLen(zb);
      const pref = zhPrefix(za,zb);
      const aa=agesOf(ea+za), ab=agesOf(eb+zb);
      let ageOk=true;
      if(aa.size&&ab.size){ ageOk=[...aa].some(x=>ab.has(x)); }
      if(ca>=2&&cb>=2){
        const zsv=sim(za,zb);
        if(er==='equal'&&za!==zb&&zsv<0.85&&!pref){ nameMismatches.push({a,b,type:'英文相同、中文不同 —— 疑似不同产品，未合并'}); continue; }
        if(za===zb&&er==='none'&&ea.replace(/[^A-Z]/g,'').length>=4&&eb.replace(/[^A-Z]/g,'').length>=4){ nameMismatches.push({a,b,type:'中文相同、英文不同 —— 请核对是否同款'}); continue; }
        if(!ageOk) continue;
        if(za===zb){ if(er==='contain'||er==='sim') pendPairs.push({a,b,score:90}); continue; }
        if(pref&&er==='contain'){ nameMismatches.push({a,b,type:'中文为包含关系（系列款/不同产品）—— 未合并'}); continue; }
        if(zsv>=0.85&&(er==='contain'||er==='sim')) pendPairs.push({a,b,score:Math.round(zsv*100)});
      } else {
        if(er==='equal'&&ageOk) pendPairs.push({a,b,score:95});
      }
    }
  });
  pendPairs.sort((x,y)=>y.score-x.score);

  // ---------- 异常 ----------
  const anomalies = [];
  clusters.forEach(cl=>{
    const byStore={};
    cl.cells.forEach(c=>(byStore[c.store]=byStore[c.store]||[]).push(c));
    Object.entries(byStore).forEach(([sk,cs])=>{
      if(cs.length>1) anomalies.push({type:'同店重复录入', text:`${(storeNames&&storeNames[sk])||sk}「${cs[0].name}」(${cs[0].catName}/${cs[0].spec}) 出现 ${cs.length} 次，价格 ${cs.map(c=>'¥'+c.price).join('、')}`});
    });
  });
  const rows = clusters.filter(cl=>new Set(cl.cells.map(c=>c.store)).size>=2);
  rows.forEach(r=>{
    const cats=new Set(r.cells.map(c=>c.catId));
    if(cats.size>1) anomalies.push({type:'品类不一致', text:`「${displayName(r)}」在不同门店被分入不同品类：${[...new Set(r.cells.map(c=>c.catName))].join('、')}`});
  });
  const skipCats=new Set(['member','notice','rooms']);
  (cellList.skipped?cellList.skipped.empty:[]).forEach(it=>{
    if(!skipCats.has(it.catId)) anomalies.push({type:'缺价格', text:`${(storeNames&&storeNames[it.store])||it.store}「${it.name}」(${it.catName}) 无价格`});
  });
  return {pendPairs, nameMismatches, anomalies};
}

function displayName(cl){
  const nameCount={};
  cl.cells.forEach(c=>{ nameCount[c.name]=(nameCount[c.name]||0)+1; });
  return Object.keys(nameCount).sort((a,b)=>nameCount[b]-nameCount[a])[0];
}

// ---------- 行模型 ----------
export function buildRows(clusters, storeKeys){
  const rows = clusters.filter(cl=>new Set(cl.cells.map(c=>c.store)).size>=2).map(cl=>{
    const prices = storeKeys.map(sk=>{
      const cs = cl.cells.filter(c=>c.store===sk);
      return cs.length?cs[0]:null;
    });
    const vals = prices.filter(Boolean).map(c=>c.price);
    const min=Math.min(...vals), max=Math.max(...vals);
    const display=displayName(cl);
    const catNames={}; cl.cells.forEach(c=>catNames[c.catName]=1);
    return {cl, prices, min, max, diff:max-min, pct:min?(max-min)/min*100:0, display, catName:Object.keys(catNames)[0], catId:cl.catId, spec:cl.spec};
  }).sort((a,b)=>b.diff-a.diff);
  const uniqueRows = clusters.filter(cl=>new Set(cl.cells.map(c=>c.store)).size===1);
  return {rows, uniqueRows};
}
