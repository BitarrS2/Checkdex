// Backup: exporta os dados salvos (capturados, shinies, megas, formas, times)
// pra um arquivo .json e importa esse arquivo de volta, em qualquer aparelho.

import { el } from "./dom.js";
import { exportState, importState, caughtCount, caughtShinyCount, megaCaughtCount, regionalCaughtCount, altCaughtCount } from "../state.js";
import { exportTeams, importTeams, listTeams } from "../teams.js";

const FILE_VERSION = 1;

function pad2(n) { return String(n).padStart(2, "0"); }
function fileName() {
  const d = new Date();
  return `checkdex-backup-${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}.json`;
}

export function createBackupMenu() {
  let open = false;

  const status = el("p", { class: "backup__status", "data-role": "backup-status", hidden: true });
  function setStatus(text, isError) {
    status.textContent = text;
    status.hidden = !text;
    status.classList.toggle("backup__status--error", !!isError);
  }

  function doExport() {
    const payload = {
      app: "checkdex",
      version: FILE_VERSION,
      exportedAt: new Date().toISOString(),
      state: exportState(),
      teams: exportTeams(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = el("a", { href: url, download: fileName() });
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setStatus("Arquivo exportado.");
  }

  const fileInput = el("input", {
    type: "file", accept: "application/json,.json", hidden: true,
    onchange: async () => {
      const file = fileInput.files?.[0];
      fileInput.value = "";
      if (!file) return;
      try {
        const parsed = JSON.parse(await file.text());
        if (!parsed || parsed.app !== "checkdex" || !parsed.state) {
          setStatus("Esse arquivo não é um backup do Checkdex.", true);
          return;
        }
        const ok = confirm(
          "Importar esse backup substitui os capturados, shinies, megas, formas e times salvos agora neste aparelho. Continuar?",
        );
        if (!ok) return;
        importState(parsed.state);
        if (parsed.teams) importTeams(parsed.teams);
        setStatus("Backup importado com sucesso.");
        updateSummary();
      } catch {
        setStatus("Não deu pra ler esse arquivo (JSON inválido).", true);
      }
    },
  });

  const summary = el("p", { class: "backup__summary" });
  function updateSummary() {
    const teamsN = listTeams().length;
    summary.textContent =
      `${caughtCount()} capturados · ${caughtShinyCount()} shinies · ${megaCaughtCount()} megas · `
      + `${regionalCaughtCount()} regionais · ${altCaughtCount()} formas · ${teamsN} time${teamsN === 1 ? "" : "s"}`;
  }

  const btn = el("button", {
    class: "backup-nav", type: "button", "aria-haspopup": "dialog", "aria-expanded": "false",
    "aria-label": "Backup: exportar ou importar seus dados",
    title: "Backup: exportar ou importar seus dados",
    onclick: () => toggle(),
  },
    el("svg", { class: "backup-nav__ico", viewBox: "0 0 24 24", "aria-hidden": "true" },
      el("path", { d: "M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" }),
    ),
  );

  const panel = el("div", { class: "backup__panel", role: "dialog", "aria-label": "Backup dos dados", hidden: true },
    el("div", { class: "backup__head" },
      el("strong", {}, "Backup dos dados"),
      el("p", {}, "Salve seus capturados, shinies, megas, formas e times num arquivo — ou traga um backup de volta."),
    ),
    summary,
    el("div", { class: "backup__actions" },
      el("button", { class: "backup__btn backup__btn--export", type: "button", onclick: doExport }, "Exportar arquivo"),
      el("button", { class: "backup__btn backup__btn--import", type: "button", onclick: () => fileInput.click() }, "Importar arquivo"),
    ),
    fileInput,
    status,
  );

  // fundo escurecido — só aparece (via CSS) quando o painel vira modal centralizado no celular
  const backdrop = el("div", { class: "backup__backdrop", hidden: true, onclick: () => toggle(false) });

  const root = el("div", { class: "backup" }, btn, backdrop, panel);

  function toggle(force) {
    open = force ?? !open;
    panel.hidden = !open;
    backdrop.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
    root.classList.toggle("is-open", open);
    if (open) { setStatus(""); updateSummary(); }
  }

  document.addEventListener("click", (e) => { if (open && !root.contains(e.target)) toggle(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && open) toggle(false); });

  return { el: root };
}
