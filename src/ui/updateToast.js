// Registra o service worker (cache offline). Atualiza sozinho, sem perguntar:
// assim que uma versão nova termina de instalar, ela assume e a página recarrega.

export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  let reg = null;

  window.addEventListener("load", async () => {
    try {
      reg = await navigator.serviceWorker.register("./sw.js");
    } catch {
      // offline não é crítico se o SW falhar ao registrar — o app segue funcionando online
    }
  });

  // no celular instalado (PWA), reabrir pelo ícone muitas vezes só retoma a aba
  // suspensa em vez de recarregar do zero — sem isso, o app nunca chega a checar
  // de novo por uma versão nova até o processo ser realmente encerrado.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") reg?.update();
  });

  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloaded) return;
    reloaded = true;
    location.reload();
  });
}
