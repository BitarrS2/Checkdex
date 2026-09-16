// Registra o service worker (cache offline). Atualiza sozinho, sem perguntar:
// assim que uma versão nova termina de instalar, ela assume e a página recarrega.

export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // offline não é crítico se o SW falhar ao registrar — o app segue funcionando online
    });
  });

  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloaded) return;
    reloaded = true;
    location.reload();
  });
}
