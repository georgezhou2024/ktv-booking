// PH GROUP 菜单 Service Worker：静态资源本地缓存，二次打开秒开
const CACHE='ph-menu-v1';
const CORE=['/','/index.html','/data/version.txt','/data/stores.json'];
self.addEventListener('install',e=>{
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
// 缓存优先，网络后台更新（stale-while-revalidate）
self.addEventListener('fetch',e=>{
  const url=new URL(e.request.url);
  if(e.request.method!=='GET') return;
  if(!url.origin.includes('menu.georgezhou.com.cn') && !url.origin.includes('localhost')) return;
  e.respondWith(
    caches.match(e.request).then(cached=>{
      const fetchPromise=fetch(e.request).then(resp=>{
        if(resp&&(resp.status===200||resp.type==='opaque')){
          const clone=resp.clone();
          caches.open(CACHE).then(c=>c.put(e.request,clone));
        }
        return resp;
      }).catch(()=>cached);
      return cached||fetchPromise;
    })
  );
});
