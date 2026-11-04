// Kill switch (03/11/2026): o Pleitost saiu do GitHub Pages para https://rpg.adrenalindos.com.
// Substitui o service worker antigo: limpa os caches dele, se desregistra e manda as abas abertas para o endereco novo.
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (event) {
  event.waitUntil((async function () {
    var keys = await caches.keys();
    await Promise.all(keys.map(function (k) { return caches.delete(k); }));
    await self.registration.unregister();
    var cs = await self.clients.matchAll({ type: "window" });
    cs.forEach(function (c) {
      var u = new URL(c.url);
      c.navigate("https://rpg.adrenalindos.com" + (u.pathname.replace(/^\/pleitost-app/, "") || "/") + u.search + u.hash);
    });
  })());
});
