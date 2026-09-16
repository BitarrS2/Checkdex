// Registra o service worker (cache offline) e avisa quando há uma versão nova pronta.

import { el } from "./dom.js";

export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("./sw.js");
      reg.addEventListener("updatefound", () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            showUpdateToast(() => {
              installing.postMessage("skipWaiting");
            });
          }
        });
      });
    } catch {
      // offline não é crítico se o SW falhar ao registrar — o app segue funcionando online
    }
  });

  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloaded) return;
    reloaded = true;
    location.reload();
  });
}

function showUpdateToast(onReload) {
  const toast = el("div", { class: "update-toast", role: "status" },
    el("span", {}, "Nova versão do Checkdex disponível."),
    el("button", {
      type: "button", class: "update-toast__btn",
      onclick: () => { onReload(); toast.remove(); },
    }, "Atualizar"),
    el("button", {
      type: "button", class: "update-toast__close", "aria-label": "Fechar aviso",
      onclick: () => toast.remove(),
    }, "×"),
  );
  document.body.append(toast);
}
