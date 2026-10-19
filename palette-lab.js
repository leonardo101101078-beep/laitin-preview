(() => {
  "use strict";

  // Palette picker for client review (?lab=1). Each theme remembers its own palette,
  // stored as laitin-palette-dark / laitin-palette-light and applied early by the inline head script.
  if (!new URLSearchParams(location.search).has("lab")) return;

  const PALETTES = {
    dark: [
      { id: "a", name: "A 深墨藍＋暖橘", note: "LOGO 橘・目前預設" },
      { id: "b", name: "B 石墨灰＋色溫光", note: "琥珀 → 冰藍" },
      { id: "c", name: "C 近黑＋暖白光", note: "最極簡" },
      { id: "d", name: "D 墨綠＋香檳金", note: "沉穩・質感" },
      { id: "e", name: "E 午夜紫＋玫瑰金", note: "柔和・居家" },
    ],
    light: [
      { id: "b", name: "B 暖紙白＋色溫光", note: "目前預設" },
      { id: "a", name: "A 霧白＋暖橘", note: "LOGO 橘" },
      { id: "c", name: "C 米白＋墨黑", note: "最極簡" },
    ],
  };
  const DEFAULTS = { dark: "a", light: "b" };
  const root = document.documentElement;
  const themeToggle = document.querySelector("#themeToggle");
  const currentTheme = () => (root.dataset.theme === "light" ? "light" : "dark");
  const datasetKey = (theme) => (theme === "light" ? "paletteLight" : "paletteDark");
  const currentPalette = (theme) => root.dataset[datasetKey(theme)] || DEFAULTS[theme];

  function select(theme, id) {
    if (id === DEFAULTS[theme]) delete root.dataset[datasetKey(theme)];
    else root.dataset[datasetKey(theme)] = id;
    try {
      localStorage.setItem(`laitin-palette-${theme}`, id);
    } catch (error) {}
    // reuse the real toggle so its aria state, storage and theme-color stay in sync
    if (theme !== currentTheme()) themeToggle.click();
    else document.dispatchEvent(new CustomEvent("laitin:palette"));
    sync();
  }

  function sync() {
    const theme = currentTheme();
    lab.querySelectorAll(".swatch").forEach((swatch) => {
      swatch.setAttribute("aria-pressed", String(swatch.dataset.theme === theme && swatch.dataset.id === currentPalette(theme)));
    });
  }

  const lab = document.createElement("details");
  lab.className = "palette-lab";
  lab.open = innerWidth > 900;
  lab.innerHTML = `<summary>配色樣版</summary>${Object.entries(PALETTES)
    .map(
      ([theme, list]) => `<div class="palette-group" role="group" aria-label="${theme === "dark" ? "深色" : "淺色"}配色">
        <p>${theme === "dark" ? "深色模式" : "淺色模式"}</p>
        <div class="palette-grid">${list
          .map(
            (palette) => `<button class="swatch" type="button" data-swatch="${theme}-${palette.id}" data-theme="${theme}" data-id="${palette.id}" aria-pressed="false">
              <span class="swatch-pill" aria-hidden="true">常用球泡</span>
              <span class="swatch-name">${palette.name}<small>${palette.note}</small></span>
            </button>`,
          )
          .join("")}</div>
      </div>`,
    )
    .join("")}`;
  lab.addEventListener("click", (event) => {
    const swatch = event.target.closest(".swatch");
    if (swatch) select(swatch.dataset.theme, swatch.dataset.id);
  });
  themeToggle.addEventListener("click", () => requestAnimationFrame(sync));
  document.body.append(lab);
  sync();
})();
