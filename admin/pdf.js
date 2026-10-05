// pdf.js —— 菜单 PDF/粘贴文字解析 + 四桶对账（纯函数 ESM）
import * as E from './menu-engine.js';

const GRAPE_TOKENS = ['SAUVIGNONBLANC','CHARDONNAY','RIESLING','CABERNET','MERLOT','SHIRAZ','SYRAH','PINOTNOIR','PINOTGRIS','PINOTGRIGIO','MOSCATO','ROSE','BLANC','BLANCO','CHABLIS','BORDEAUX','BOURGOGNE','BURGUNDY','CHIANTI','PROSECCO','ZINFANDEL','TEMPRANILLO','SANGIOVESE','GEWURZTRAMINER','VERMENTINO','VERMOUTH','SEMILON','MALBEC'];
const GENERIC_BRANDS = new Set(['酩颂','帝格瑞','轩尼诗','麦卡伦','百利甜','芝华士','百加得','斯米诺','绝对','灰雁','杰卡斯','奔富','云雾之湾','红魔鬼','干露','巴黎之花','凯歌','玛姆','巴黎','杰克丹尼','尊美醇','孟买','添加利','人头马','马爹利','山崎','白州','响','格兰菲迪','格兰杰','百富','麦卡伦','阿贝','拉弗格','利富','乐加维林','泰斯卡','欧肯特轩','欧摩','慕赫','克里尼利基','黑牌','红牌','绿牌','金牌','蓝牌','皇家礼炮','迈伦','麦凯伦','克斯阿苏尔','唐胡里奥','培恩','懒虫','阿卡维拉斯','奥美加','豪帅','科罗娜','1664','福佳','粉象','林德曼','罗斯福','智美','督威','白熊','喜力','嘉士伯','青岛','百威','科罗娜','保乐','必富达','莫罗3号','野格','君度','甘露','马利宝','圣哲曼','迪凯堡','波士','莫林','屈臣氏','泰象','胜在','嗨登','逃牛岭','变色熊','天鹅堡','仙女湾','伦马克','爱丽舍','留世','迦南美地','银色高地','贺兰晴雪','西鸽','观云','光良','江小白','獭祭','十四代','梅见','贝瑞兄弟','BBR','哈罗德','麦卡勒姆','格兰路思','格兰','麦卡利','麦凯伦']);

export function linesFromTextItems(items){
  const rows = new Map();
  (items||[]).forEach(it=>{
    const y = Math.round(it.transform[5]);
    if(!rows.has(y)) rows.set(y, []);
    rows.get(y).push({x:it.transform[4], s:it.str||''});
  });
  return [...rows.entries()].sort((a,b)=>b[0]-a[0]).map(([,t])=>t.sort((a,b)=>a.x-b.x).map(x=>x.s).join('').replace(/\s+/g,' ').trim()).filter(Boolean);
}
export function linesFromText(text){
  return text.split(/\r?\n/).map(l=>l.replace(/\s+/g,' ').trim()).filter(Boolean);
}

const PRICE_RE = /(?:¥|RMB)?\s*([\d,]{2,6})\s*(?:\/\s*(\d+)?\s*(瓶|杯|壶|套|份|位|盒|支|罐|听|扎))?/g;
// 菜单里常见的分类标题（整单识别时按这些行分节）
const CAT_NAMES=['白葡萄酒','红葡萄酒','红酒','桃红葡萄酒','桃红','起泡酒','葡萄酒','威士忌','威士忌杯卖','杯卖酒','杯卖','香槟','白兰地','干邑','烈酒','洋酒','白酒','黄酒','日本酒','龙舌兰','朗姆酒','朗姆','金酒','琴酒','伏特加','利口酒','力娇酒','开胃酒','清酒','日本清酒','烧酒','烧酎','梅酒','果酒','啤酒','鸡尾酒','经典鸡尾酒','特调鸡尾酒','特调','水烟','水烟特调','软饮','软饮果汁','果汁','咖啡','茶','矿泉水','小食','小吃','果盘','雪茄','香烟','套餐','会员充值','充值','须知','包厢','房间','其他'];
const CAT_SET=new Set(CAT_NAMES);
// 系统/非卖品分类：整单识别时跳过，不入菜单（会员充值不许改）
const SYSTEM_CAT_NAMES=new Set(['会员充值','充值','须知','包厢','房间']);
function normCatLine(s){
  return (s||'').replace(/\s+/g,'').replace(/（[^）]*）|\([^)]*\)/g,'').replace(/共\s*\d+\s*款/g,'').replace(/[类区板块]$/,'');
}
function isCatLine(e,line){
  const zhChars=(e.zh.match(/[一-鿿]/g)||[]).length;
  if(!zhChars) return false;
  if(/\d/.test(line)) return false;
  return CAT_SET.has(normCatLine(e.zh));
}

function parseEntryLine(line){
  const pairs=[]; let m; PRICE_RE.lastIndex=0;
  let nameLine=line;
  while((m=PRICE_RE.exec(line))){
    const price=parseFloat(m[1].replace(/,/g,''));
    if(isNaN(price)||price<10||price>999999) continue;
    const hasMark=/¥|RMB/.test(m[0]);
    const hasUnit=!!m[3];
    const after=line.slice(m.index+m[0].length).trimStart();
    if(after[0]==='年') continue; // 年份（12年/15年）不是价格
    // 无 ¥/单位 的裸数字：≥100 才算价；两位数仅当整行就是这个数（独占一行的杯卖价）
    if(!hasMark&&!hasUnit){
      if(price<100 && line.replace(/[\s¥RMB]/g,'')!==m[1]) continue;
    }
    const qty=m[2]?parseInt(m[2],10):1;
    const spec=m[3]||'瓶';
    pairs.push({price,qty,spec});
    nameLine=nameLine.replace(m[0],' ');
  }
  nameLine=nameLine.replace(/（?\s*\d+\s*(?:杯|瓶|份|位|壶|套)\s*）?\s*$/,'').replace(/\s+/g,' ').trim();
  const enM = nameLine.match(/[A-Za-z][A-Za-z0-9.&'’\-–—/\s]*[A-Za-z0-9.]/);
  let zh='', en='';
  if(enM){
    en=enM[0].trim();
    zh=nameLine.slice(0,enM.index).replace(/[\s\-–—·・•:：]+$/,'').trim();
    // 英文短语前若残留零散拉丁字母（如 MAX 后的 TIGOT 才是译名），以最长英文段为准
  } else {
    zh=nameLine.trim();
  }
  return {zh,en,pairs,raw:line};
}

export function parsePdfEntries(lines){
  const out=[]; let pending=null;
  const flush=()=>{ if(pending && pending.zh) out.push(pending); pending=null; };
  for(const line of lines){
    const e=parseEntryLine(line);
    const zhChars=(e.zh.match(/[一-鿿]/g)||[]).length;
    const isEnTitle = !zhChars && /[A-Za-z]/.test(line) && !/\d/.test(line);
    if(isEnTitle || isCatLine(e,line)){ flush(); continue; }
    if(e.pairs.length){
      if(pending){
        // 价格独占一行：归属上一行品名
        pending.pairs=e.pairs;
        flush();
      } else if(zhChars>=2){
        flush();
        out.push({zh:e.zh,en:e.en,pairs:e.pairs,raw:line});
      }
      continue;
    }
    if(zhChars<2) continue;
    if(pending) flush();
    pending={zh:e.zh,en:e.en,pairs:[],raw:line};
  }
  flush();
  // 分组价向上继承：连续无价品名继承上一标价，直到新标价出现
  let lastPairs=[];
  out.forEach(e=>{
    if(e.pairs.length) lastPairs=e.pairs;
    else if(lastPairs.length) e.pairs=lastPairs.map(p=>({...p,inherited:true}));
  });
  return out;
}

// 整单解析：按分类标题行分节，输出 [{catName, entries}]；catName=null 表示标题前的未分类内容
export function parsePdfSections(lines){
  const sections=[]; let cur=null; let pending=null;
  const flush=()=>{
    if(pending && pending.zh && cur) cur.entries.push(pending);
    pending=null;
  };
  const newSection=name=>{ flush(); cur={catName:name,entries:[]}; sections.push(cur); };
  for(const line of lines){
    const e=parseEntryLine(line);
    const zhChars=(e.zh.match(/[一-鿿]/g)||[]).length;
    const isEnTitle = !zhChars && /[A-Za-z]/.test(line) && !/\d/.test(line);
    if(isCatLine(e,line)){ newSection(normCatLine(e.zh)); continue; }
    if(isEnTitle){ flush(); continue; }
    if(!cur) newSection(null);
    if(e.pairs.length){
      if(pending){ pending.pairs=e.pairs; flush(); }
      else if(zhChars>=2){ flush(); cur.entries.push({zh:e.zh,en:e.en,pairs:e.pairs,raw:line}); }
      continue;
    }
    if(zhChars<2) continue;
    if(pending) flush();
    pending={zh:e.zh,en:e.en,pairs:[],raw:line};
  }
  flush();
  // 每节内分组价向上继承
  sections.forEach(s=>{
    let lastPairs=[];
    s.entries.forEach(en=>{
      if(en.pairs.length) lastPairs=en.pairs;
      else if(lastPairs.length) en.pairs=lastPairs.map(p=>({...p,inherited:true}));
    });
  });
  return sections.filter(s=>s.entries.length);
}
export function isSystemCat(name){ return SYSTEM_CAT_NAMES.has(normCatLine(name)); }

export function priceTextFromPairs(pairs){
  if(!pairs||!pairs.length) return '';
  const unit=pairs.find(p=>p.qty===1)||pairs[0];
  const rest=pairs.filter(p=>p!==unit);
  // 与线上菜单体例一致：瓶装单价写 /1瓶，杯/套写 /杯、/套
  const specText=p=>p.qty>1?`${p.qty}${p.spec}`:(p.spec==='瓶'?'1'+p.spec:p.spec);
  let s=`¥${unit.price} /${specText(unit)}`;
  rest.forEach(p=>{ s+=` - ¥${p.price} /${specText(p)}`; });
  return s;
}

export function lcsRatio(a,b){
  const m=a.length,n=b.length; if(!m||!n) return 0;
  const dp=Array.from({length:m+1},()=>new Array(n+1).fill(0));
  for(let i=1;i<=m;i++)for(let j=1;j<=n;j++) dp[i][j]=a[i-1]===b[j-1]?dp[i-1][j-1]+1:Math.max(dp[i-1][j],dp[i][j-1]);
  return dp[m][n]/Math.max(m,n);
}
function grapeOf(s){ const t=E.normEn(s); return GRAPE_TOKENS.filter(g=>t.includes(g)); }
function brandCompatible(zhA,zhB){
  const a=zhA.slice(0,4), b=zhB.slice(0,4);
  if(GENERIC_BRANDS.has(zhA.slice(0,3))||GENERIC_BRANDS.has(zhB.slice(0,3))) return false;
  return a.slice(0,2)===b.slice(0,2);
}
function ageTokens(s){ return new Set((s.match(/\d{1,2}\s*(?:年|Y\b)/g)||[]).map(x=>x.replace(/\s|年/g,''))); }
function gradeTokens(s){ const t=s.toUpperCase(); const g=[]; ['XXO','VSOP','XO','VS','NAPOLEON'].forEach(x=>{ if(t.includes(x)) g.push(x); }); return g; }
function brandToken(en){ const m=(en||'').toUpperCase().match(/[A-Za-z]{3,}/); return m?m[0]:''; }
function volToken(s){ const m=(s||'').toUpperCase().match(/\d+(?:\.\d+)?\s?L\b|\d{3,}\s?ML/); return m?m[0].replace(/\s/g,''):''; }
// 结构化比价：菜单现价 vs PDF 价（按 价格@数量规格 比较，忽略文本格式差异）
function samePrice(pdfPairs, curText, catId){
  if(!pdfPairs.length) return true;
  const c=E.parsePrice(curText||'', catId);
  const norm=ps=>ps.map(p=>`${p.price}@${p.qty}${p.spec}`).sort().join('|');
  const cur=[...c.pairs, ...c.bundle.map(b=>({price:b.price,qty:b.qty,spec:b.spec||'瓶'}))];
  return norm(cur)===norm(pdfPairs);
}

// entries: PDF 条目；items: 当前菜单 collectItems() 结果（同分类）
export function reconcile(entries, items, catId){
  const changes=[], review=[], adds=[], used=new Set();
  for(const e of entries){
    if(!e.zh || e.zh.length<2) continue;
    const pzh=E.zhStripped(e.zh), pkey=E.zhMatchKey(e.zh);
    const pen=E.enCore(e.en||'');
    const pBrand=brandToken(e.en), pVol=volToken(e.zh+(e.en||''));
    const pGrapes=grapeOf(e.en||'');
    let best=null, bestScore=0, bestReason='', bestIdx=-1;
    items.forEach((it,idx)=>{
      if(used.has(idx)) return;
      const itZh=it.zhName||it.name||'';
      const mzhs=it.zhStripped||E.zhStripped(itZh);
      const mkey=E.zhMatchKey(itZh);
      const men=it.en||E.enCore(it.enRaw||it.name);
      const mBrand=brandToken(it.enRaw||it.name), mVol=volToken(itZh+(it.enRaw||''));
      let score=0, reason='';
      if(pkey===mkey){ score=100; reason='中文名一致'; }
      else if(mzhs.includes(pzh)||pzh.includes(mzhs)){
        const er=E.enRel(pen,men);
        const mGrapes=grapeOf(it.enRaw||it.name);
        const commonGrapes=pGrapes.some(g=>mGrapes.includes(g));
        if(er==='equal'||er==='contain'||!pen||!men){ score=80; reason='中文核心包含，英文相容'; }
        else if(commonGrapes && brandCompatible(e.zh,itZh)){ score=80; reason='同品牌+同葡萄品种'; }
        else if(pBrand && pBrand===mBrand){ score=60; reason='中文为系列包含关系，英文品牌一致，需人工确认'; }
        else if(commonGrapes){ score=55; reason='葡萄品种相同但品牌存疑'; }
        else { score=40; reason='中文包含但英文对不上'; }
      } else {
        const lr=lcsRatio(pkey,mkey);
        const er=E.enRel(pen,men);
        if(lr>=0.6 && pkey.slice(0,2)===mkey.slice(0,2) && (er==='equal'||er==='contain'||er==='sim')){ score=75; reason=`中文相似度${(lr*100)|0}%+英文相容`; }
        else if(pkey.slice(0,2)===mkey.slice(0,2) && ((pBrand&&pBrand===mBrand)||(pVol&&pVol===mVol))){
          score=62; reason='同品牌/同容量系列款，需人工确认';
        }
      }
      // 年份/等级一票否决
      const pa=ageTokens(e.zh+(e.en||'')), ma=ageTokens(itZh+(it.enRaw||''));
      if(pa.size&&ma.size&&[...pa].every(x=>!ma.has(x))) score=Math.min(score,30);
      const pg=gradeTokens(e.zh+(e.en||'')), mg=gradeTokens(itZh+(it.enRaw||''));
      if(pg.length&&mg.length&&pg[0]!==mg[0]) score=Math.min(score,30);
      if(score>bestScore){ bestScore=score; best=it; bestReason=reason; bestIdx=idx; }
    });
    const newPrice=priceTextFromPairs(e.pairs);
    if(best && bestScore>=80){
      used.add(bestIdx);
      const cur=(best.priceText||'').replace(/\s+/g,' ').trim();
      if(!samePrice(e.pairs, cur, catId)) changes.push({entry:e,item:best,newPrice,inherited:e.pairs.some(p=>p.inherited),score:bestScore,reason:bestReason});
    } else if(best && bestScore>=55){
      review.push({entry:e,item:best,newPrice,score:bestScore,reason:bestReason});
      used.add(bestIdx);
    } else {
      adds.push({entry:e,newPrice});
    }
  }
  const missing=items.filter((_,i)=>!used.has(i)).map(it=>({item:it}));
  return {changes,review,adds,missing};
}
