// admin.js —— PH GROUP 菜单管理面板逻辑（ESM）
import * as E from './menu-engine.js';
import * as PDFR from './pdf.js';

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const STORE_KEYS=E.STORE_KEYS;
const CFG_KEY='ph_admin_cfg_v1';
const SESS_KEY='ph_admin_session';
let cfg={pat:'',owner:'georgezhou2024',repo:'ktv-booking',branch:'main'};
try{Object.assign(cfg,JSON.parse(localStorage.getItem(CFG_KEY)||'{}'));}catch(e){}

let DATA=null; // {stores:{}, shisha:{}}
let stages=[];
let activeStore='acme', activeRefKey=null;
let pdfLibs={};

function toast(msg,ms=1800){ const t=$('#toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove('show'),ms); }
function parseDoc(html){ return new DOMParser().parseFromString(html,'text/html'); }
function serializeDoc(doc){ return doc.body.innerHTML; }

// ---------- 登录 ----------
$('#g-btn').onclick=()=>{
  const pwd=$('#g-pwd').value.trim();
  if(pwd!=='ph666'){ $('#g-err').textContent='密码错误'; return; }
  cfg.pat=$('#g-pat').value.trim();
  cfg.owner=$('#g-owner').value.trim()||'georgezhou2024';
  cfg.repo=$('#g-repo').value.trim()||'ktv-booking';
  cfg.branch=$('#g-branch').value.trim()||'main';
  localStorage.setItem(CFG_KEY,JSON.stringify(cfg));
  sessionStorage.setItem(SESS_KEY,'1');
  enter();
};
$('#g-pwd').addEventListener('keydown',e=>{ if(e.key==='Enter')$('#g-btn').click(); });
$('#g-pat').addEventListener('keydown',e=>{ if(e.key==='Enter')$('#g-btn').click(); });
$('#btn-logout').onclick=()=>{ sessionStorage.removeItem(SESS_KEY); location.reload(); };

async function enter(){
  $('#gate').style.display='none';
  $('#topbar').style.display='flex'; $('#nav').style.display='flex'; $('#app').style.display='block'; $('#push-bar').style.display='flex';
  await loadData();
  fillSelects(); renderEdit(); renderStage(); renderHistory();
  $('#conn').classList.add('ok');
  $('#conn-txt').textContent=`${cfg.owner}/${cfg.repo} · `+(cfg.pat?'已连接（可推送）':'只读（未填令牌）');
}
async function loadData(){
  const stores={};
  await Promise.all(STORE_KEYS.map(async k=>{ stores[k]=await (await fetch('../data/'+k+'.json?t='+Date.now())).json(); }));
  const shisha=await (await fetch('../data/shisha.json?t='+Date.now())).json();
  DATA={stores,shisha};
}

// ---------- 分类 ----------
function catList(sk){
  const d=DATA.stores[sk];
  const arr=d.categories.filter(c=>!['member','notice','rooms'].includes(c.id))
    .map(c=>({key:c.id,label:c.name,cat:c.id,shisha:false}));
  if(sk==='phroom') Object.keys(DATA.shisha).forEach(k=>arr.push({key:'shisha:'+k,label:'水烟 · '+k,cat:'shisha',shisha:true,shKey:k}));
  return arr;
}
function catListPdf(sk){ return catList(sk).filter(r=>!r.shisha); }
function findRef(sk,key){ return catList(sk).find(r=>r.key===key); }
function getCatHtml(sk,ref){ return ref.shisha?DATA.shisha[ref.shKey]:DATA.stores[sk].content[ref.key]; }
function setCatHtml(sk,ref,html){ if(ref.shisha) DATA.shisha[ref.shKey]=html; else DATA.stores[sk].content[ref.key]=html; }
function fileOf(rec){
  if(rec.kind==='file') return rec.path;
  if(rec.shisha) return 'data/shisha.json';
  return 'data/'+rec.store+'.json';
}

// ---------- 单品解析 ----------
// 判断一段文本是否基本为英文行（酒名）
function isLatinLine(t){
  const s=(t||'').replace(/<[^>]*>/g,'').trim();
  return /[A-Za-z]{3,}/.test(s) && !/[一-鿿]/.test(s);
}
function collectItems(html){
  const doc=parseDoc(html);
  return [...doc.querySelectorAll('.item')].map(it=>{
    const nameEl=it.querySelector('.name'); const priceEl=it.querySelector('.price');
    if(!nameEl) return null;
    const clone=nameEl.cloneNode(true);
    const subEl=clone.querySelector('.sub-text');
    let subText='', subHtml='', enTail='';
    if(subEl){
      subHtml=subEl.outerHTML;
      // sub-text 内可能以 <br>英文酒名 结尾（Acme 风格）
      const parts=subEl.innerHTML.split(/<br\s*\/?>/i);
      if(parts.length>1 && isLatinLine(parts[parts.length-1])){
        enTail=parts.pop().replace(/<[^>]*>/g,'').trim();
      }
      subText=parts.join('\n').replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim();
      subEl.remove();
    }
    const spanEn=clone.querySelector('.en-name');
    const hasSpan=!!spanEn;
    let enRaw='', zhName='', enLoc='none';
    if(hasSpan){
      enRaw=spanEn.textContent.trim(); enLoc='span';
      zhName=clone.textContent.replace(/\s+/g,' ').replace(enRaw,' ').replace(/\s+/g,' ').trim();
    } else {
      const full=clone.textContent.replace(/\s+/g,' ').trim();
      const cjk=[...full.matchAll(/[一-鿿]/g)];
      if(cjk.length){
        const tail=full.slice(cjk[cjk.length-1].index+1).trim();
        if(/[A-Za-z]{3,}/.test(tail)){ enRaw=tail; enLoc='inline'; zhName=full.slice(0,full.length-tail.length).trim(); }
        else zhName=full;
      } else zhName=full;
    }
    if(!enRaw && enTail){ enRaw=enTail; enLoc='subbr'; }
    return {zhName,enRaw,subText,subHtml,hasSpan,enLoc,priceText:priceEl?priceEl.textContent.replace(/\s+/g,' ').trim():''};
  }).filter(Boolean);
}

// 第 n 个 .item 的 div 配平区间
function itemSpan(html,n){
  const re=/<div\b[^>]*class="[^"]*\bitem\b[^"]*"[^>]*>/g;
  let m,i=0,start=-1;
  while((m=re.exec(html))){ if(i===n){start=m.index;break;} i++; }
  if(start<0) return null;
  return divBalance(html,start);
}
function divBalance(html,start){
  const open=/<div\b[^>]*>/g; open.lastIndex=start;
  const om=open.exec(html); if(!om) return null;
  let depth=1; const tagRe=/<(\/?)div\b[^>]*?(\/?)>/g; tagRe.lastIndex=open.lastIndex; let t;
  while((t=tagRe.exec(html))){
    if(t[1]==='/'){ depth--; if(depth===0) return [start,tagRe.lastIndex]; }
    else if(t[2]!=='/') depth++;
  }
  return null;
}
function lastCardInsertPos(html){
  const re=/<div\b[^>]*class="[^"]*\bcard\b[^"]*"[^>]*>/g; let m,last=-1;
  while((m=re.exec(html))) last=m.index;
  if(last<0) return html.length;
  const span=divBalance(html,last);
  return span?span[1]:html.length;
}
function replaceWithin(spanHtml, innerRe, replacement){
  return spanHtml.replace(innerRe,replacement);
}

// ---------- 改动记录 ----------
function addStage(rec){ stages.push(rec); refreshAll(); }
function applyMutation(sk,ref,desc,tag,mutate){
  const before=getCatHtml(sk,ref);
  const after=mutate(before);
  if(after===before) return false;
  setCatHtml(sk,ref,after);
  addStage({kind:'cat',store:sk,refKey:ref.key,label:ref.label,cat:ref.cat,shisha:!!ref.shisha,shKey:ref.shKey||null,before,after,desc,tag});
  return true;
}
function subHtmlFrom(sub){
  if(!sub||!sub.trim()) return '';
  return '<div class="sub-text">'+esc(sub).replace(/\n/g,'<br>')+'</div>';
}
// 按原结构风格重建 .name（enLoc: span / subbr / inline / none）
function buildNameHtml(zh,en,sub,it){
  const subPart=subHtmlFrom(sub);
  if(it.enLoc==='subbr'){
    // Acme 风格：英文在 sub-text 末尾 <br>
    const subInner=esc(sub).replace(/\n/g,'<br>')+(en?'<br>'+esc(en):'');
    return `<div class="name">${esc(zh)}<div class="sub-text">${subInner}</div></div>`;
  }
  if(it.hasSpan||it.enLoc==='span'){
    return `<div class="name">${esc(zh)}${en?` <span class="en-name">${esc(en)}</span>`:''}${subPart}</div>`;
  }
  return `<div class="name">${esc(zh)}${en?' '+esc(en):''}${subPart}</div>`;
}
// 在一段 HTML 内定位 class 含 cls 的第一个元素的完整区间
function elementSpan(html,cls){
  const re=new RegExp('<div\\b[^>]*class="[^"]*\\b'+cls+'\\b[^"]*"[^>]*>');
  const m=re.exec(html); if(!m) return null;
  return divBalance(html,m.index);
}

// ---------- 搜索改价 UI ----------
function fillSelects(){
  const stores=STORE_KEYS.map(k=>`<option value="${k}">${DATA.stores[k].name}</option>`).join('');
  $('#ed-store').innerHTML=stores; $('#pdf-store').innerHTML=stores;
  $('#ed-store').value=activeStore;
  fillCatSelect($('#ed-cat'),activeStore,'all');
  fillCatSelect($('#pdf-cat'),activeStore,'pdf');
  $('#ed-store').onchange=e=>{ activeStore=e.target.value; activeRefKey=null; fillCatSelect($('#ed-cat'),activeStore,'all'); renderEdit(); };
  $('#pdf-store').onchange=e=>{ fillCatSelect($('#pdf-cat'),e.target.value,'pdf'); };
  $('#ed-cat').onchange=e=>{ activeRefKey=e.target.value; renderEdit(); };
  $('#ed-q').oninput=()=>renderEdit();
  $('#btn-add').onclick=onAdd;
}
function fillCatSelect(sel,sk,kind){
  const list=kind==='pdf'?catListPdf(sk):catList(sk);
  sel.innerHTML='<option value="__all">全部分类</option>'+list.map(r=>`<option value="${r.key}">${r.label}</option>`).join('');
}
function currentRefs(){
  const sk=$('#ed-store').value;
  const v=$('#ed-cat').value;
  if(v==='__all') return catList(sk);
  const r=findRef(sk,v); return r?[r]:[];
}
function renderEdit(){
  const sk=$('#ed-store').value;
  const q=($('#ed-q').value||'').trim().toUpperCase();
  const refs=currentRefs();
  let html=''; let count=0;
  refs.forEach(ref=>{
    const items=collectItems(getCatHtml(sk,ref));
    items.forEach((it,idx)=>{
      if(q){
        const hay=(it.zhName+' '+it.enRaw+' '+it.subText).toUpperCase();
        if(!hay.includes(q)) return;
      }
      count++;
      html+=`<div class="item-card" data-ref="${ref.key}" data-idx="${idx}">
        <div class="ic-name">${esc(it.zhName)}${it.enRaw?`<span class="ic-en">${esc(it.enRaw)}</span>`:''}</div>
        ${it.subText?`<div class="ic-sub">${esc(it.subText)}</div>`:''}
        <div class="ic-price">${esc(it.priceText)||'<span style="color:var(--mut)">（无价格）</span>'}</div>
        <div class="ic-actions"><button act="edit">改价 / 改名</button><button act="del" class="del">下架删除</button></div>
        <div class="edit-form">
          <input class="ef-zh" value="${esc(it.zhName)}" placeholder="中文名">
          <input class="ef-en" value="${esc(it.enRaw)}" placeholder="英文名（可留空）">
          <textarea class="ef-sub" rows="2" placeholder="备注（可留空）">${esc(it.subText)}</textarea>
          <input class="ef-price" value="${esc(it.priceText)}" placeholder="价格，如 ¥1980 /1瓶 - ¥5880 /3瓶">
          <div class="ef-actions"><button class="ef-cancel">取消</button><button class="ef-save">保存</button></div>
        </div>
      </div>`;
    });
  });
  $('#ed-list').innerHTML=count?html:'<div class="empty-tip">没有找到单品</div>';
  $$('#ed-list .item-card').forEach(card=>{
    const ref=findRef(sk,card.dataset.ref); const idx=+card.dataset.idx;
    const items=()=>collectItems(getCatHtml(sk,ref));
    card.querySelector('[act=edit]').onclick=()=>{ card.querySelector('.edit-form').classList.add('on'); };
    card.querySelector('.ef-cancel').onclick=()=>{ card.querySelector('.edit-form').classList.remove('on'); };
    card.querySelector('.ef-save').onclick=()=>onSave(sk,ref,idx,card);
    card.querySelector('[act=del]').onclick=()=>onDelete(sk,ref,idx,card);
  });
}
function onSave(sk,ref,idx,card){
  const it=collectItems(getCatHtml(sk,ref))[idx];
  const zh=card.querySelector('.ef-zh').value.trim();
  const en=card.querySelector('.ef-en').value.trim();
  const sub=card.querySelector('.ef-sub').value.trim();
  const price=card.querySelector('.ef-price').value.replace(/\s+/g,' ').trim();
  if(!zh){ toast('中文名不能为空'); return; }
  applyMutation(sk,ref,`${ref.label}：${it.zhName} → ${zh}${price?' / '+price:''}`,'change',html=>{
    const span=itemSpan(html,idx); if(!span) return html;
    let item=html.slice(span[0],span[1]);
    // 用 div 配平定位完整 .name，避免 sub-text 的 </div> 截断
    const ns=elementSpan(item,'name');
    if(ns) item=item.slice(0,ns[0])+buildNameHtml(zh,en,sub,it)+item.slice(ns[1]);
    if(price!==it.priceText){
      if(/<div\b[^>]*class="[^"]*\bprice\b[^"]*"[^>]*>/.test(item))
        item=item.replace(/(<div\b[^>]*class="[^"]*\bprice\b[^"]*"[^>]*>)[\s\S]*?(<\/div>)/,`$1${esc(price)}$2`);
      else
        item=item.slice(0,item.lastIndexOf('</div>'))+`<div class="price">${esc(price)}</div></div>`;
    }
    return html.slice(0,span[0])+item+html.slice(span[1]);
  });
  toast('已加入待发布');
}
function onDelete(sk,ref,idx,card){
  const it=collectItems(getCatHtml(sk,ref))[idx];
  if(!confirm(`确认下架删除「${it.zhName}」？\n该操作先进入待发布，推送后才会线上生效。`)) return;
  applyMutation(sk,ref,`${ref.label}：下架 ${it.zhName}`,'del',html=>{
    const span=itemSpan(html,idx); if(!span) return html;
    return html.slice(0,span[0])+html.slice(span[1]);
  });
  toast('已加入待发布');
}
function onAdd(){
  const sk=$('#ed-store').value;
  const refs=currentRefs();
  const ref=refs[refs.length-1];
  const zh=(prompt('新单品中文名：')||'').trim(); if(!zh) return;
  const en=(prompt('英文名（可留空）：')||'').trim();
  const price=(prompt('价格（如 ¥1980 /1瓶 - ¥5880 /3瓶，可留空）：')||'').trim();
  const item=`<div class="item"><div class="name">${esc(zh)}${en?` <span class="en-name">${esc(en)}</span>`:''}</div>${price?`<div class="price">${esc(price)}</div>`:''}</div>`;
  applyMutation(sk,ref,`${ref.label}：新增 ${zh}`,'add',html=>{
    const pos=lastCardInsertPos(html);
    return html.slice(0,pos)+item+html.slice(pos);
  });
  toast('已加入待发布');
}

// ---------- 暂存 / 校验 ----------
function dirtyFiles(){ return [...new Set(stages.map(fileOf))]; }
function refreshAll(){ renderEdit(); renderStage(); }
function renderStage(){
  const n=stages.length;
  const badge=$('#stage-badge'); badge.style.display=n?'inline-block':'none'; badge.textContent=n;
  $('#btn-push').disabled=!n||!cfg.pat;
  $('#btn-discard').style.display=n?'inline-block':'none';
  $('#btn-discard-m').style.display=n?'inline-block':'none';
  $('#push-info').innerHTML=n?`<b>${n}</b> 项改动待发布（${dirtyFiles().map(f=>f.replace('data/','').replace('.json','')).join('、')}）`:'暂无改动';
  let html=stages.map((s,i)=>{
    const tag={change:'改价/改名',add:'新增',del:'下架',rollback:'回滚'}[s.tag]||s.tag;
    return `<div class="stage-item"><span class="st-tag ${s.tag}">${tag}</span><span class="st-body">${esc(s.desc||s.path)}</span><button class="st-undo" data-i="${i}">撤销</button></div>`;
  }).join('');
  $('#stage-list').innerHTML=html||'<div class="empty-tip">暂无改动，去「搜索改价」或「PDF 对账」开始吧</div>';
  $$('#stage-list .st-undo').forEach(b=>b.onclick=()=>undoStage(+b.dataset.i));
  $('#stage-warns').innerHTML=renderWarnings();
}
function undoStage(i){
  const s=stages[i];
  if(s.kind==='cat'){
    setCatHtml(s.store,findRef(s.store,s.refKey),s.before);
    stages=stages.filter((x,j)=>!(j>=i&&x.kind==='cat'&&x.store===s.store&&x.refKey===s.refKey));
  } else {
    restoreFileObj(s);
    stages=stages.filter((_,j)=>j!==i);
  }
  refreshAll(); toast('已撤销');
}
$('#btn-discard').onclick=discardAll;
$('#btn-discard-m').onclick=discardAll;
function discardAll(){
  if(!confirm('放弃全部改动并还原菜单？')) return;
  // 从后向前还原
  for(let i=stages.length-1;i>=0;i--){ const s=stages[i]; if(s.kind==='cat') setCatHtml(s.store,findRef(s.store,s.refKey),s.before); else restoreFileObj(s); }
  stages=[]; refreshAll(); toast('已全部还原');
}
function renderWarnings(){
  const errs=[],warns=[];
  try{
    const dom={parse:h=>parseDoc(h)};
    const cells=E.buildCells(DATA.stores,dom,DATA.shisha);
    const clusters=E.clusterCells(cells);
    const {rows}=E.buildRows(clusters,STORE_KEYS);
    rows.forEach(r=>{ if(r.diff>0&&r.pct>=30) warns.push(`<b>${esc(r.display)}</b> 门店价差 ${r.pct.toFixed(0)}%（¥${r.min} ~ ¥${r.max}），请确认`); });
  }catch(e){ errs.push('比价引擎校验失败：'+esc(e.message)); }
  const touched=[...new Set(stages.filter(s=>s.kind==='cat').map(s=>s.store+'|'+s.refKey))];
  touched.forEach(k=>{
    const [sk,refk]=k.split('|'); const ref=findRef(sk,refk);
    collectItems(getCatHtml(sk,ref)).forEach(it=>{
      if(!it.priceText){ if(/会员|须知/.test(ref.label)) return; errs.push(`${ref.label}「${esc(it.zhName)}」没有价格，请填写或标注套餐内含`); return; }
      const p=E.parsePrice(it.priceText,ref.shisha?'shisha':ref.cat);
      if(p.pairs.length===0&&!/套餐内含|赠送|—/.test(it.priceText))
        errs.push(`${ref.label}「${esc(it.zhName)}」价格格式异常（未识别出金额）：${esc(it.priceText)}`);
      const unit=p.pairs.find(x=>x.qty===1);
      p.bundle.forEach(b=>{ if(unit&&b.price>=unit.price*b.qty)
        warns.push(`${ref.label}「${esc(it.zhName)}」${b.qty}${b.spec}价 ¥${b.price} 不低于单买 ${b.qty} 瓶 ¥${unit.price*b.qty}，套餐通常应更便宜`); });
    });
  });
  let html='';
  if(errs.length) html+='<div class="warn-box err"><b>必须修正：</b><br>'+errs.map(e=>'• '+e).join('<br>')+'</div>';
  if(warns.length) html+='<div class="warn-box"><b>请核对（不阻止推送）：</b><br>'+warns.map(w=>'• '+w).join('<br>')+'</div>';
  if(!errs.length&&!warns.length&&stages.length) html='<div class="ok-box">校验通过：无格式异常、无重大跨店价差。</div>';
  return html;
}
function hasBlockingError(){ return renderWarnings().includes('warn-box err'); }

// ---------- PDF 对账 ----------
const drop=$('#pdf-drop'), fileInput=$('#pdf-file');
drop.onclick=()=>fileInput.click();
drop.ondragover=e=>{e.preventDefault();drop.classList.add('over');};
drop.ondragleave=()=>drop.classList.remove('over');
drop.ondrop=e=>{e.preventDefault();drop.classList.remove('over');const f=e.dataTransfer.files[0];if(f)handlePdfFile(f);};
fileInput.onchange=e=>{ const f=e.target.files[0]; if(f) handlePdfFile(f); };
$('#btn-pdf-text').onclick=()=>{
  const text=$('#pdf-text').value;
  if(!text.trim()){ toast('请先粘贴菜单文字'); return; }
  runReconcile(PDFR.linesFromText(text));
};
async function loadScript(src){
  return new Promise((res,rej)=>{ const s=document.createElement('script'); s.src=src; s.onload=res; s.onerror=()=>rej(new Error('脚本加载失败：'+src)); document.head.appendChild(s); });
}
async function handlePdfFile(file){
  try{
    if(!pdfLibs.pdfjs){
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
      pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      pdfLibs.pdfjs=true;
    }
    const buf=await file.arrayBuffer();
    const pdf=await pdfjsLib.getDocument({data:buf}).promise;
    let lines=[];
    for(let p=1;p<=pdf.numPages;p++){
      const page=await pdf.getPage(p);
      const tc=await page.getTextContent();
      lines=lines.concat(PDFR.linesFromTextItems(tc.items));
    }
    if(lines.length<5){ // 疑似扫描件 → OCR
      toast('未检测到文字，开始 OCR 识别（稍候）',3000);
      lines=await ocrPdf(pdf);
    }
    runReconcile(lines);
  }catch(err){
    $('#pdf-result').innerHTML=`<div class="warn-box err">PDF 解析失败：${esc(err.message)}<br>可改用「粘贴菜单文字」方式。</div>`;
  }
}
async function ocrPdf(pdf){
  if(!pdfLibs.tess){ await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'); pdfLibs.tess=true; }
  let text='';
  for(let p=1;p<=pdf.numPages;p++){
    const page=await pdf.getPage(p);
    const vp=page.getViewport({scale:2});
    const canvas=document.createElement('canvas'); canvas.width=vp.width; canvas.height=vp.height;
    await page.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise;
    const {data}=await Tesseract.recognize(canvas,'chi_sim+eng');
    text+='\n'+data.text;
  }
  return PDFR.linesFromText(text);
}
function runReconcile(lines){
  const sk=$('#pdf-store').value;
  const catv=$('#pdf-cat').value;
  const ref=catv==='__all'?null:findRef(sk,catv);
  if(!ref){ toast('请先选择要对账的具体分类'); return; }
  const entries=PDFR.parsePdfEntries(lines);
  const items=collectItems(getCatHtml(sk,ref)).map(it=>({
    ...it, zhStripped:E.zhStripped(it.zhName), en:E.enCore(it.enRaw||it.zhName)
  }));
  const r=PDFR.reconcile(entries,items,ref.cat);
  window.__pdfR={sk,ref,r};
  const box=$('#pdf-result');
  const row=(cls,title,body,checked)=>`<label class="rc-row ${cls}"><input type="checkbox" ${checked?'checked':''} style="margin-top:3px"><span>${title}${body}</span></label>`;
  let html=`<div class="pdf-hint">共识别 ${entries.length} 个品名：自动改价 ${r.changes.length}、待确认 ${r.review.length}、新增 ${r.adds.length}、菜单有而 PDF 没有 ${r.missing.length}（只提示，不会自动删）。</div>`;
  html+=bucket('change','改价（默认采纳）',r.changes,c=>`
    <div><b>${esc(c.item.zhName)}</b></div>
    <div class="names">PDF：${esc(c.entry.zh)} ${esc(c.entry.en||'')}${c.inherited?'（分组继承价）':''}</div>
    <div class="prices"><span class="old-p">${esc(c.item.priceText||'无价')}</span> → <span class="new-p">${esc(c.newPrice)}</span></div>`,true);
  html+=bucket('review','疑似同款（请人工核对，默认不采纳）',r.review,c=>`
    <div><b>${esc(c.item.zhName)}</b> ${esc(c.item.enRaw||'')}</div>
    <div class="names">PDF：${esc(c.entry.zh)} ${esc(c.entry.en||'')}（${esc(c.reason)} ${c.score}分）</div>
    <div class="prices"><span class="old-p">${esc(c.item.priceText||'无价')}</span> → <span class="new-p">${esc(c.newPrice)}</span></div>`,false);
  html+=bucket('add','新增单品（默认不采纳）',r.adds,a=>`
    <div><b>${esc(a.entry.zh)}</b> ${esc(a.entry.en||'')}</div>
    <div class="prices"><span class="new-p">${esc(a.newPrice)}</span></div>`,false);
  if(r.missing.length){
    html+='<div class="rc-bucket"><h3>待下架？<span class="cnt">'+r.missing.length+'</span></h3>';
    html+=r.missing.map(m=>`<div class="rc-row miss"><div><b>${esc(m.item.zhName)}</b></div><div class="names">PDF 中未出现，如已下架请去「搜索改价」手动删除</div></div>`).join('');
    html+='</div>';
  }
  function bucket(cls,title,arr,body,checked){
    if(!arr.length) return '';
    return `<div class="rc-bucket"><h3>${title}<span class="cnt">${arr.length}</span></h3>`+
      arr.map(c=>row(cls,title,body(c),checked)).join('')+'</div>';
  }
  html+=`<div class="rc-actions"><button class="btn primary" id="btn-rc-adopt">采纳勾选项到待发布</button><button class="btn" id="btn-rc-clear">清空结果</button></div>`;
  box.innerHTML=html;
  $('#btn-rc-clear').onclick=()=>{box.innerHTML='';};
  $('#btn-rc-adopt').onclick=adoptReconcile;
}
function adoptReconcile(){
  const {sk,ref,r}=window.__pdfR;
  let adopted=0;
  const groups=[['change',r.changes],['review',r.review],['add',r.adds]];
  // 只收集可勾选行（change/review/add 顺序渲染），miss 行没有复选框
  const checks=[...document.querySelectorAll('#pdf-result .rc-row input[type=checkbox]')].map(b=>b.checked);
  let ci=0;
  groups.forEach(([type,arr])=>{
    arr.forEach(c=>{
      const checked=checks[ci++]; if(!checked) return;
      if(type==='add'){
        const item=`<div class="item"><div class="name">${esc(c.entry.zh)}${c.entry.en?` <span class="en-name">${esc(c.entry.en)}</span>`:''}</div><div class="price">${esc(c.newPrice)}</div></div>`;
        applyMutation(sk,ref,`${ref.label}：PDF 新增 ${c.entry.zh}`,'add',html=>{const pos=lastCardInsertPos(html);return html.slice(0,pos)+item+html.slice(pos);});
      } else {
        const target=c.item;
        // 找到当前分类中的单品下标（优先名称+原价精确匹配）
        const cur=collectItems(getCatHtml(sk,ref));
        const n=cur.findIndex(x=>x.zhName===target.zhName && x.priceText===target.priceText);
        const useIdx=n<0?cur.findIndex(x=>x.zhName===target.zhName):n;
        if(useIdx<0) return;
        applyMutation(sk,ref,`${ref.label}：${target.zhName} 按 PDF 改价 ${target.priceText||'无价'} → ${c.newPrice}`,'change',html=>{
          const span=itemSpan(html,useIdx); if(!span) return html;
          let item=html.slice(span[0],span[1]);
          item=item.replace(/(<div\b[^>]*class="[^"]*\bprice\b[^"]*"[^>]*>)[\s\S]*?(<\/div>)/,`$1${esc(c.newPrice)}$2`);
          return html.slice(0,span[0])+item+html.slice(span[1]);
        });
      }
      adopted++;
    });
  });
  toast(`已采纳 ${adopted} 项到待发布`);
  document.querySelector('[data-panel=stage]').click();
}

// ---------- 历史回滚 ----------
async function ghApi(path,opts={}){
  const headers=Object.assign({'Accept':'application/vnd.github+json'},cfg.pat?{Authorization:'Bearer '+cfg.pat}:{},opts.headers||{});
  const res=await fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}/${path}`,Object.assign({},opts,{headers}));
  const txt=await res.text(); let json=null; try{json=JSON.parse(txt);}catch(e){}
  if(!res.ok) throw new Error((json&&(json.message||JSON.stringify(json)))||('HTTP '+res.status));
  return json;
}
async function renderHistory(){
  const box=$('#history-list');
  try{
    const commits=await ghApi('commits?path=data&per_page=30');
    if(!commits.length){ box.innerHTML='<div class="empty-tip">暂无历史提交</div>'; return; }
    box.innerHTML=commits.map(c=>{
      const d=c.commit.committer.date.slice(0,16).replace('T',' ');
      return `<div class="hist-item"><div><div>${esc(c.commit.message.split('\n')[0])}</div><div class="hi-meta">${d} · ${esc(c.sha.slice(0,7))}</div></div><button data-sha="${c.sha}">回滚到此版</button></div>`;
    }).join('');
    $$('#history-list button').forEach(b=>b.onclick=()=>rollback(b.dataset.sha));
  }catch(err){
    box.innerHTML=`<div class="warn-box">读取历史失败：${esc(err.message)}<br>${cfg.pat?'':'查看私有提交需要在退出后填入 GitHub 令牌。'}</div>`;
  }
}
async function rollback(sha){
  if(!confirm('将把 5 个菜单数据文件恢复到该版本并放入待发布（不会立即上线，推送后才生效）。继续？')) return;
  try{
    const files=['acme','phroom','eros','sensory','shisha'];
    for(const f of files){
      const j=await ghApi(`contents/data/${f}.json?ref=${sha}`);
      const txt=decodeURIComponent(escape(atob(j.content.replace(/\n/g,''))));
      const after=JSON.parse(txt);
      const before=f==='shisha'?JSON.parse(JSON.stringify(DATA.shisha)):JSON.parse(JSON.stringify(DATA.stores[f]));
      stages.push({kind:'file',path:`data/${f}.json`,beforeObj:before,afterObj:after,desc:`回滚 data/${f}.json 到 ${sha.slice(0,7)}`,tag:'rollback'});
      if(f==='shisha') DATA.shisha=after; else DATA.stores[f]=after;
    }
    refreshAll(); toast('历史版本已放入待发布'); document.querySelector('[data-panel=stage]').click();
  }catch(err){ toast('回滚失败：'+err.message,3000); }
}
function restoreFileObj(s){
  if(s.path==='data/shisha.json') DATA.shisha=s.beforeObj;
  else { const k=s.path.split('/')[1].replace('.json',''); DATA.stores[k]=s.beforeObj; }
}

// ---------- 推送 ----------
$('#btn-push').onclick=pushAll;
async function pushAll(){
  if(!cfg.pat){ toast('请退出并填入 GitHub 令牌后再推送'); return; }
  if(hasBlockingError()){ toast('存在必须修正的问题，请先处理'); return; }
  if(!confirm(`确认推送 ${stages.length} 项改动到线上？\n推送后约 1 分钟自动上线。`)) return;
  const btn=$('#btn-push'); btn.disabled=true; btn.textContent='推送中…';
  try{
    const files=dirtyFiles();
    const today=new Date(Date.now()+8*3600*1000).toISOString().slice(0,10);
    const stores=[...new Set(stages.flatMap(s=>s.kind==='cat'?(s.shisha?['水烟']:[DATA.stores[s.store].name]):[]))];
    const message=`菜单更新 ${today}（${stores.join('、')||'数据回滚'}，${stages.length}项）`;
    for(const path of files){
      let content;
      const fs=stages.find(s=>fileOf(s)===path && s.kind==='file');
      if(fs) content=JSON.stringify(fs.afterObj,null,2)+'\n';
      else {
        const obj=path==='data/shisha.json'?DATA.shisha:DATA.stores[path.split('/')[1].replace('.json','')];
        content=JSON.stringify(obj,null,2)+'\n';
      }
      let sha=null;
      try{ const ex=await ghApi(`contents/${path}?ref=${cfg.branch}`); sha=ex.sha; }catch(e){ /* 新文件 404 */ }
      const body=b64Unicode(content);
      await ghApi(`contents/${path}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({message,content:body,sha,branch:cfg.branch})});
    }
    stages=[]; refreshAll();
    toast('推送成功，等待 Pages 部署（约1分钟）',3000);
    pollActions();
  }catch(err){
    toast('推送失败：'+err.message,4000);
  }finally{ btn.textContent='一 键 推 送'; btn.disabled=stages.length===0||!cfg.pat; }
}
function b64Unicode(str){ return btoa(unescape(encodeURIComponent(str))); }
async function pollActions(){
  for(let i=0;i<6;i++){
    await new Promise(r=>setTimeout(r,15000));
    try{
      const runs=await ghApi('actions/runs?per_page=3');
      const run=runs.workflow_runs&&runs.workflow_runs[0];
      if(run&&/completed/.test(run.status)){ toast(run.conclusion==='success'?'已上线完成 ✔':'部署状态：'+run.conclusion,4000); return; }
    }catch(e){}
  }
  toast('部署仍在进行，可稍后刷新线上页面查看',3500);
}

// ---------- 首次部署 / 程序文件同步 ----------
const SYS_FILES=[
  ['../index.html','index.html'],
  ['./menu-engine.js','admin/menu-engine.js'],
  ['./pdf.js','admin/pdf.js'],
  ['./admin.js','admin/admin.js'],
  ['./index.html','admin/index.html'],
  ['./price.html','admin/price.html'],
  ['../data/acme.json','data/acme.json'],
  ['../data/phroom.json','data/phroom.json'],
  ['../data/eros.json','data/eros.json'],
  ['../data/sensory.json','data/sensory.json'],
  ['../data/shisha.json','data/shisha.json']
];
const deployBtn=()=>document.querySelector('#btn-deploy');
document.addEventListener('click',e=>{
  if(e.target.id!=='btn-deploy') return;
  deploySystem();
});
async function deploySystem(){
  if(!cfg.pat){ toast('请退出并填入 GitHub 令牌'); return; }
  if(!confirm('将把后台程序（admin 5 个文件）、菜单首页和 5 个数据文件同步到线上，继续？')) return;
  const log=document.querySelector('#deploy-log'); const btn=deployBtn();
  btn.disabled=true;
  const today=new Date(Date.now()+8*3600*1000).toISOString().slice(0,10);
  const message='部署菜单管理后台与数据文件 '+today;
  try{
    for(const [rel,path] of SYS_FILES){
      log.textContent='正在上传 '+path+' …';
      const res=await fetch(rel+'?t='+Date.now());
      if(!res.ok) throw new Error('本地读取失败 '+rel);
      const content=await res.text();
      let sha=null;
      try{ const ex=await ghApi(`contents/${path}?ref=${cfg.branch}`); sha=ex.sha; }catch(e){}
      await ghApi(`contents/${path}`,{method:'PUT',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({message,content:b64Unicode(content),sha,branch:cfg.branch})});
      log.textContent='已上传 '+path;
    }
    log.textContent='全部上传完成，等待 Pages 部署（约1分钟）…';
    toast('程序文件推送成功',3000);
    pollActions();
  }catch(err){
    log.textContent='失败：'+err.message;
    toast('部署失败：'+err.message,4000);
  }finally{ btn.disabled=false; }
}

// ---------- 导航 ----------
$$('#nav button').forEach(b=>b.onclick=()=>{
  $$('#nav button').forEach(x=>x.classList.remove('on')); b.classList.add('on');
  $$('.panel').forEach(p=>p.classList.remove('on'));
  $('#panel-'+b.dataset.panel).classList.add('on');
  if(b.dataset.panel==='history') renderHistory();
});

// ---------- 启动 ----------
if(sessionStorage.getItem(SESS_KEY)==='1'){
  $('#g-pat').value=cfg.pat; $('#g-owner').value=cfg.owner; $('#g-repo').value=cfg.repo; $('#g-branch').value=cfg.branch;
  enter();
}
