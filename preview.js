(() => {
  "use strict";

  const previewData = window.LAITIN_PREVIEW_DATA;
  const productData = window.LAITIN_PRODUCT_DATA;
  const root = document.querySelector("#previewRoot");
  const menu = document.querySelector("#siteMenu");
  const pageMenu = document.querySelector("#pageMenu");
  const galleryDialog = document.querySelector("#galleryDialog");
  const galleryTitle = document.querySelector("#galleryTitle");
  const galleryCopy = document.querySelector("#galleryCopy");
  const galleryGrid = document.querySelector("#galleryGrid");
  const specDialog = document.querySelector("#specDialog");
  const specDialogTitle = document.querySelector("#specDialogTitle");
  const specDialogSubtitle = document.querySelector("#specDialogSubtitle");
  const specList = document.querySelector("#specList");

  if (!previewData || !productData) {
    root.innerHTML = '<p class="page-shell">預覽資料載入失敗。</p>';
    return;
  }

  const pageId = Math.min(6, Math.max(1, Number(new URLSearchParams(location.search).get("page")) || 1));
  const state = {
    productGroups: [],
    productIndex: 0,
    filters: { series: "", type: "", item: "" },
    activeCompanySection: 0,
    activeCompanyItem: -1,
    dragStartX: null,
    dragLastX: null,
    dragDistance: 0,
    dragStartedOnMain: false,
  };

  const escapeHtml = (value) =>
    String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);

  const compactText = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
  const hasValue = (value) => value !== null && value !== undefined && String(value).trim() !== "";

  const productImage = (path) => {
    const clean = String(path || "").replace(/^\.\.\//, "");
    return `分頁資料/1.可調色燈具系列/${clean}`;
  };

  function renderMenu() {
    pageMenu.innerHTML = previewData.pages
      .map(
        (page) => `<a href="?page=${page.id}" data-order="${String(page.id).padStart(2, "0")}" ${page.id === pageId ? 'aria-current="page"' : ""}>${escapeHtml(page.label)}</a>`,
      )
      .join("");
  }

  function groupProducts(records) {
    const groups = new Map();
    records.forEach((record) => {
      const key = `${record.sheet}\u0000${record.type}\u0000${record.item}`;
      if (!groups.has(key)) groups.set(key, { key, sheet: record.sheet, type: record.type, item: record.item, records: [], images: [] });
      const group = groups.get(key);
      group.records.push(record);
      const images = Array.isArray(record.images) && record.images.length ? record.images : [record.image].filter(Boolean);
      images.forEach((image) => {
        if (image && !group.images.includes(image)) group.images.push(image);
      });
    });
    return [...groups.values()];
  }

  function unique(values) {
    return [...new Set(values.filter(Boolean))];
  }

  function currentFilterData() {
    const seriesNames = productData.series.map((entry) => entry.name);
    if (!seriesNames.includes(state.filters.series)) state.filters.series = seriesNames[0] || "";
    const seriesRows = productData.records.filter((row) => row.sheet === state.filters.series);
    const types = unique(seriesRows.map((row) => row.type));
    if (!types.includes(state.filters.type)) state.filters.type = types[0] || "";
    const typeRows = seriesRows.filter((row) => row.type === state.filters.type);
    const items = unique(typeRows.map((row) => row.item));
    if (!items.includes(state.filters.item)) state.filters.item = "";
    return { seriesNames, types, items, typeRows };
  }

  function filterControl(label, key, values, selected, allLabel = "") {
    const entries = allLabel ? [{ value: "", label: allLabel }, ...values.map((value) => ({ value, label: value }))] : values.map((value) => ({ value, label: value }));
    const selectedLabel = entries.find((entry) => entry.value === selected)?.label || entries[0]?.label || "";
    return `
      <div class="filter-control glass-select" data-filter-control="${key}">
        <span class="filter-label">${escapeHtml(label)}</span>
        <button class="filter-trigger" type="button" data-filter-trigger="${key}" aria-haspopup="listbox" aria-expanded="false">
          <span>${escapeHtml(selectedLabel)}</span><i aria-hidden="true"></i>
        </button>
        <div class="filter-options" role="listbox" aria-label="${escapeHtml(label)}" hidden>
          ${entries.map((entry) => `<button type="button" role="option" data-filter-option="${key}" data-value="${escapeHtml(entry.value)}" aria-selected="${entry.value === selected}"><span>${escapeHtml(entry.label)}</span><i aria-hidden="true">✓</i></button>`).join("")}
        </div>
      </div>`;
  }

  function renderFilterControls() {
    const { seriesNames, types, items } = currentFilterData();
    const filterBar = document.querySelector("#filterBar");
    filterBar.innerHTML = [
      filterControl("系列", "series", seriesNames, state.filters.series),
      filterControl("類型", "type", types, state.filters.type),
      filterControl("品項", "item", items, state.filters.item, "全部品項"),
    ].join("");

    filterBar.querySelectorAll("[data-filter-trigger]").forEach((trigger) => {
      trigger.addEventListener("click", () => toggleFilter(trigger));
      trigger.addEventListener("keydown", (event) => {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          openFilter(trigger, true);
        }
      });
    });

    filterBar.querySelectorAll("[data-filter-option]").forEach((option) => {
      option.addEventListener("click", () => {
        const key = option.dataset.filterOption;
        state.filters[key] = option.dataset.value;
        if (key === "series") {
          state.filters.type = "";
          state.filters.item = "";
        }
        if (key === "type") state.filters.item = "";
        rebuildProductGroups();
      });
      option.addEventListener("keydown", handleFilterOptionKeydown);
    });
  }

  function closeFilters(except = null) {
    document.querySelectorAll("[data-filter-control]").forEach((control) => {
      if (control === except) return;
      control.querySelector(".filter-options").hidden = true;
      control.querySelector(".filter-trigger").setAttribute("aria-expanded", "false");
    });
  }

  function openFilter(trigger, focusOption = false) {
    const control = trigger.closest("[data-filter-control]");
    const menuElement = control.querySelector(".filter-options");
    closeFilters(control);
    menuElement.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    if (focusOption) (menuElement.querySelector('[aria-selected="true"]') || menuElement.querySelector("button"))?.focus();
  }

  function toggleFilter(trigger) {
    const control = trigger.closest("[data-filter-control]");
    const menuElement = control.querySelector(".filter-options");
    if (menuElement.hidden) openFilter(trigger);
    else closeFilters();
  }

  function handleFilterOptionKeydown(event) {
    const options = [...event.currentTarget.parentElement.querySelectorAll("button")];
    const index = options.indexOf(event.currentTarget);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      options[(index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length].focus();
    }
    if (event.key === "Escape") {
      const control = event.currentTarget.closest("[data-filter-control]");
      closeFilters();
      control.querySelector(".filter-trigger").focus();
    }
  }

  function renderProductPage() {
    state.filters.series = productData.series[0]?.name || "";
    currentFilterData();
    root.innerHTML = `
      <section class="page-shell product-page" aria-label="可調色燈具系列">
        <div class="filter-bar" id="filterBar" aria-label="產品篩選"></div>
        <div class="product-layout">
          <section class="showcase-panel" aria-label="產品轉輪">
            <div class="product-stage">
              <figure class="product-side"><img id="prevImage" alt="" draggable="false" /></figure>
              <div class="product-focus" id="productFocus">
                <button class="round-button prev" id="prevProduct" type="button" aria-label="上一個品項">‹</button>
                <button class="product-main" id="mainProduct" type="button" aria-label="查看產品圖片"><img id="mainImage" alt="" draggable="false" /></button>
                <button class="round-button next" id="nextProduct" type="button" aria-label="下一個品項">›</button>
              </div>
              <figure class="product-side"><img id="nextImage" alt="" draggable="false" /></figure>
            </div>
            <div class="product-identity">
              <strong id="productItem">—</strong>
              <button class="spec-table-button" id="openSpecTable" type="button">規格表</button>
              <span id="productType">—</span>
              <small class="product-position" id="productPosition">0 / 0</small>
            </div>
          </section>
          <section class="spec-summary" aria-labelledby="specTitle">
            <p class="eyebrow">目前規格</p>
            <div class="spec-title-line"><h1 id="specTitle">—</h1></div>
            <div class="metric-grid">
              <div class="metric"><span id="primaryMetricLabel">輸入電壓</span><strong id="primaryMetricValue">—</strong></div>
              <div class="metric"><span>功率</span><strong id="metricPower">—</strong></div>
            </div>
            <div class="tag-list" id="tagList"></div>
          </section>
        </div>
      </section>`;

    document.querySelector("#prevProduct").addEventListener("click", () => moveProduct(-1));
    document.querySelector("#nextProduct").addEventListener("click", () => moveProduct(1));
    document.querySelector("#mainProduct").addEventListener("click", (event) => {
      if (event.detail === 0) openProductGallery();
    });
    document.querySelector("#openSpecTable").addEventListener("click", openSpecTable);
    enableProductDrag();
    document.addEventListener("click", (event) => {
      if (!event.target.closest("[data-filter-control]")) closeFilters();
    });
    rebuildProductGroups();
  }

  function enableProductDrag() {
    const focus = document.querySelector("#productFocus");
    const stage = focus.closest(".product-stage");
    focus.addEventListener("dragstart", (event) => event.preventDefault());
    const setDragVisuals = (delta) => {
      const progress = Math.max(-1, Math.min(1, delta / 74));
      const amount = Math.abs(progress);
      stage.style.setProperty("--drag-x", `${delta}px`);
      stage.style.setProperty("--main-scale", String(1 - amount * 0.14));
      stage.style.setProperty("--main-rotate", `${progress * 13}deg`);
      stage.style.setProperty("--prev-scale", String(0.82 + Math.max(0, progress) * 0.18 - Math.max(0, -progress) * 0.12));
      stage.style.setProperty("--next-scale", String(0.82 + Math.max(0, -progress) * 0.18 - Math.max(0, progress) * 0.12));
      stage.style.setProperty("--prev-shift", `${-20 + Math.max(0, progress) * 22 - Math.max(0, -progress) * 12}%`);
      stage.style.setProperty("--next-shift", `${20 - Math.max(0, -progress) * 22 + Math.max(0, progress) * 12}%`);
      stage.style.setProperty("--prev-opacity", String(0.66 + Math.max(0, progress) * 0.34 - Math.max(0, -progress) * 0.18));
      stage.style.setProperty("--next-opacity", String(0.66 + Math.max(0, -progress) * 0.34 - Math.max(0, progress) * 0.18));
    };
    const resetDragVisuals = () => {
      setDragVisuals(0);
      window.setTimeout(() => stage.classList.remove("is-settling"), 260);
    };
    const startDrag = (event) => {
      if (event.target.closest(".round-button") || event.button !== 0) return;
      state.dragStartX = event.clientX;
      state.dragLastX = event.clientX;
      state.dragDistance = 0;
      state.dragStartedOnMain = Boolean(event.target.closest("#mainProduct"));
      focus.classList.add("is-dragging");
      stage.classList.add("is-dragging");
      stage.classList.remove("is-settling");
    };
    const updateDrag = (event) => {
      if (state.dragStartX === null) return;
      state.dragLastX = event.clientX;
      const delta = Math.max(-74, Math.min(74, event.clientX - state.dragStartX));
      state.dragDistance = Math.max(state.dragDistance, Math.abs(event.clientX - state.dragStartX));
      setDragVisuals(delta);
    };
    const finishDrag = () => {
      if (state.dragStartX === null) return;
      const delta = state.dragLastX - state.dragStartX;
      const openGallery = state.dragStartedOnMain && state.dragDistance < 46;
      focus.classList.remove("is-dragging");
      stage.classList.remove("is-dragging");
      stage.classList.add("is-settling");
      state.dragStartX = null;
      state.dragLastX = null;
      state.dragStartedOnMain = false;
      const didDrag = state.dragDistance > 10 && Math.abs(delta) > 10;
      if (didDrag && Math.abs(delta) >= 46) moveProduct(delta < 0 ? 1 : -1);
      else if (openGallery) openProductGallery();
      requestAnimationFrame(resetDragVisuals);
    };
    focus.addEventListener("mousedown", startDrag);
    window.addEventListener("mousemove", updateDrag, true);
    window.addEventListener("mouseup", finishDrag, true);
    focus.addEventListener("pointerdown", (event) => {
      if (event.pointerType !== "mouse") startDrag(event);
    });
    window.addEventListener("pointermove", (event) => {
      if (event.pointerType !== "mouse") updateDrag(event);
    }, true);
    window.addEventListener("pointerup", (event) => {
      if (event.pointerType !== "mouse") finishDrag();
    }, true);
    window.addEventListener("pointercancel", (event) => {
      if (event.pointerType !== "mouse") finishDrag();
    }, true);
  }

  function rebuildProductGroups() {
    const { typeRows } = currentFilterData();
    state.productGroups = groupProducts(typeRows.filter((row) => !state.filters.item || row.item === state.filters.item));
    state.productIndex = 0;
    renderFilterControls();
    updateProductView();
  }

  function moveProduct(direction) {
    if (!state.productGroups.length) return;
    state.productIndex = (state.productIndex + direction + state.productGroups.length) % state.productGroups.length;
    updateProductView(direction);
  }

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

  // Slide + zoom: incoming product grows in from the side it came from,
  // outgoing product shrinks away to the opposite side as a ghost image.
  function animateProductSwap(direction, oldSrc) {
    if (!direction || reduceMotion.matches) return;
    const stage = document.querySelector(".product-stage");
    const main = document.querySelector("#mainProduct");
    const sides = stage.querySelectorAll(".product-side");
    const fromSide = sides[direction > 0 ? 1 : 0];
    const toSide = sides[direction > 0 ? 0 : 1];
    const center = (rect) => rect.left + rect.width / 2;
    const mainRect = main.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    const fromDx = center(fromSide.getBoundingClientRect()) - center(mainRect);
    const toDx = center(toSide.getBoundingClientRect()) - center(mainRect);
    const ease = "cubic-bezier(0.22, 1, 0.36, 1)";

    stage.querySelectorAll(".product-ghost").forEach((ghost) => ghost.remove());
    [main, ...stage.querySelectorAll(".product-side img")].forEach((element) => element.getAnimations().forEach((animation) => animation.cancel()));

    main.animate(
      [
        { transform: `translateX(${fromDx}px) scale(0.42)`, opacity: 0.4 },
        { transform: "translateX(0) scale(1)", opacity: 1 },
      ],
      { duration: 560, easing: ease },
    );
    main.animate([{ opacity: 0.2, transform: "scale(0.6)" }, { opacity: 1, transform: "scale(1)" }], { duration: 700, easing: ease, pseudoElement: "::before" });

    const ghost = document.createElement("img");
    ghost.className = "product-ghost";
    ghost.src = oldSrc;
    ghost.alt = "";
    Object.assign(ghost.style, {
      left: `${mainRect.left - stageRect.left}px`,
      top: `${mainRect.top - stageRect.top}px`,
      width: `${mainRect.width}px`,
      height: `${mainRect.height}px`,
    });
    stage.append(ghost);
    ghost
      .animate(
        [
          { transform: "translateX(0) scale(1)", opacity: 1 },
          { transform: `translateX(${toDx}px) scale(0.4)`, opacity: 0 },
        ],
        { duration: 480, easing: ease, fill: "forwards" },
      )
      .finished.then(() => ghost.remove(), () => ghost.remove());

    sides.forEach((side) =>
      side.querySelector("img").animate([{ transform: "scale(0.55)", opacity: 0 }, { transform: "scale(1)", opacity: 1 }], { duration: 420, delay: 140, easing: ease, fill: "backwards" }),
    );
  }

  function primaryMetric(record, group) {
    if (group.type.includes("嵌燈")) return { label: "建議嵌孔(mm)", value: record.fields?.["建議嵌孔(mm)"] };
    if (group.type.includes("吸頂燈")) return { label: "面寬/外徑(mm)", value: record.fields?.["面寬/外徑(mm)"] };
    return { label: "輸入電壓", value: hasValue(record.voltage) ? `${record.voltage}V` : "" };
  }

  function updateProductView(direction = 0) {
    const group = state.productGroups[state.productIndex];
    if (!group) return;
    const oldSrc = document.querySelector("#mainImage").src;
    const previous = state.productGroups[(state.productIndex - 1 + state.productGroups.length) % state.productGroups.length];
    const next = state.productGroups[(state.productIndex + 1) % state.productGroups.length];
    const record = group.records[0] || {};
    const metric = primaryMetric(record, group);
    document.querySelector("#mainImage").src = productImage(group.images[0]);
    document.querySelector("#mainImage").alt = group.item;
    document.querySelector("#prevImage").src = productImage(previous.images[0]);
    document.querySelector("#nextImage").src = productImage(next.images[0]);
    document.querySelector("#productItem").textContent = group.item;
    document.querySelector("#productType").textContent = group.type;
    document.querySelector("#productPosition").textContent = `${state.productIndex + 1} / ${state.productGroups.length}`;
    document.querySelector("#specTitle").textContent = record.spec || group.item;
    document.querySelector("#primaryMetricLabel").textContent = metric.label;
    document.querySelector("#primaryMetricValue").textContent = hasValue(metric.value) ? metric.value : "—";
    document.querySelector("#metricPower").textContent = hasValue(record.power) ? `${record.power}W` : "—";
    const tags = Array.isArray(record.tags) ? record.tags : String(record.tags || "").split(",");
    document.querySelector("#tagList").innerHTML = tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 4).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
    if (oldSrc && oldSrc !== document.querySelector("#mainImage").src) animateProductSwap(direction, oldSrc);
  }

  function openProductGallery() {
    const group = state.productGroups[state.productIndex];
    if (!group) return;
    galleryDialog.dataset.mode = "product";
    galleryTitle.textContent = group.item;
    galleryCopy.textContent = group.records[0]?.spec || group.type;
    galleryGrid.innerHTML = group.images.map((image, index) => `<img src="${productImage(image)}" alt="${escapeHtml(group.item)}圖片 ${index + 1}" />`).join("");
    galleryDialog.showModal();
  }

  function specRows(record) {
    const omitted = new Set(["圖片資料夾", "主標", "副標", "簡述", "標籤"]);
    return Object.entries(record.fields || {}).filter(([label, value]) => !omitted.has(label) && hasValue(value));
  }

  function openSpecTable() {
    const group = state.productGroups[state.productIndex];
    if (!group) return;
    specDialogTitle.textContent = group.type;
    specDialogSubtitle.textContent = group.item;
    specList.innerHTML = group.records.map((record) => {
      const outOfStock = String(record.fields?.貨況 || "").includes("缺貨");
      const rows = specRows(record);
      return `<details class="spec-accordion ${outOfStock ? "is-out-of-stock" : ""}">
        <summary><span>${escapeHtml(record.spec || "未命名規格")}</span>${outOfStock ? "<em>缺貨</em>" : ""}</summary>
        <dl>${rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl>
      </details>`;
    }).join("");
    specDialog.showModal();
  }

  function renderComingSoon(title) {
    root.innerHTML = `<section class="coming-soon" aria-labelledby="comingSoonTitle"><div class="coming-soon-content"><p>${escapeHtml(title)}</p><h1 id="comingSoonTitle">規劃中，敬請期待</h1></div></section>`;
  }

  function renderCompany() {
    const sections = previewData.company;
    root.innerHTML = `
      <section class="page-shell company-page">
        <header class="page-intro">
          <div><h1>公司介紹</h1></div>
          <p>認識萊廷照明的品牌、專業服務，以及選購、退換貨與保固相關說明。</p>
        </header>
        <nav class="section-jump" aria-label="快速跳轉">${sections.map((section, index) => `<button type="button" data-company-section="${index}" aria-pressed="${index === 0}">${escapeHtml(section.title)}</button>`).join("")}</nav>
        <div class="company-layout"><div class="company-content" id="companyContent"></div></div>
      </section>`;
    root.querySelectorAll("[data-company-section]").forEach((button) => button.addEventListener("click", () => {
      state.activeCompanySection = Number(button.dataset.companySection);
      state.activeCompanyItem = -1;
      updateCompany();
    }));
    updateCompany();
  }

  function updateCompany() {
    const section = previewData.company[state.activeCompanySection];
    root.querySelectorAll("[data-company-section]").forEach((button) => {
      button.setAttribute("aria-pressed", String(Number(button.dataset.companySection) === state.activeCompanySection));
    });
    const content = document.querySelector("#companyContent");
    content.innerHTML = `<header class="company-content-head"><h2>${escapeHtml(section.title)}</h2></header><div class="company-items">${section.items.map((item, index) => renderCompanyItem(item, index)).join("")}</div>`;
    content.querySelectorAll("[data-company-item]").forEach((button) => button.addEventListener("click", () => {
      const index = Number(button.dataset.companyItem);
      state.activeCompanyItem = state.activeCompanyItem === index ? -1 : index;
      updateCompany();
    }));
  }

  function renderCompanyItem(item, index) {
    const open = index === state.activeCompanyItem;
    return `<section class="company-item"><button class="company-item-trigger" type="button" data-company-item="${index}" aria-expanded="${open}">${escapeHtml(item.title)}</button>${open ? `<div class="company-item-body ${item.images.length ? "" : "no-image"}"><p class="company-text">${escapeHtml(item.content)}</p>${item.images.length ? `<div class="company-images">${item.images.map((image, imageIndex) => `<img src="${image}" alt="${escapeHtml(item.title)}圖片 ${imageIndex + 1}" />`).join("")}</div>` : ""}</div>` : ""}</section>`;
  }

  function renderOtherProducts() {
    const data = previewData.otherProducts;
    root.innerHTML = `
      <section class="page-shell other-page">
        <header class="page-intro">
          <div><h1>${escapeHtml(data.title)}</h1></div>
          <p>${escapeHtml(compactText(data.content))}</p>
        </header>
        <div class="category-grid">${data.categories.map((category, index) => `<button class="category-card" type="button" data-category="${index}" aria-label="查看${escapeHtml(category.title)}"><img src="${category.icon}" alt="${escapeHtml(category.title)}" /></button>`).join("")}</div>
      </section>`;
    root.querySelectorAll("[data-category]").forEach((button) => button.addEventListener("click", () => openCategory(Number(button.dataset.category))));
  }

  function marqueeSet(category, hidden = false) {
    return `<div class="marquee-set" ${hidden ? 'aria-hidden="true"' : ""}>${category.images.map((image, imageIndex) => `<img src="${image}" alt="${hidden ? "" : `${escapeHtml(category.title)}圖片 ${imageIndex + 1}`}" />`).join("")}</div>`;
  }

  function openCategory(index) {
    const category = previewData.otherProducts.categories[index];
    galleryDialog.dataset.mode = "category";
    galleryTitle.textContent = category.title;
    galleryCopy.textContent = category.content;
    galleryGrid.innerHTML = `<div class="marquee-track">${marqueeSet(category)}${marqueeSet(category, true)}</div>`;
    galleryDialog.showModal();
  }

  function renderContact() {
    const contact = previewData.contact;
    root.innerHTML = `<section class="page-shell contact-page"><div class="contact-copy"><h1>${escapeHtml(contact.title)}</h1><p class="contact-text">${escapeHtml(contact.content)}</p></div><figure class="contact-visual"><img src="${contact.image}" alt="萊廷照明官方 LINE QR Code 與燈具產品" /></figure></section>`;
  }

  const themeToggle = document.querySelector("#themeToggle");
  const themeColor = document.querySelector('meta[name="theme-color"]');
  function applyTheme(theme) {
    const isDark = theme !== "light";
    if (isDark) delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = "light";
    themeToggle.setAttribute("aria-pressed", String(isDark));
    syncThemeColor();
  }
  function syncThemeColor() {
    themeColor.content = getComputedStyle(document.documentElement).getPropertyValue("--bg-1").trim();
  }
  document.addEventListener("laitin:palette", syncThemeColor);
  applyTheme(document.documentElement.dataset.theme);
  themeToggle.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    applyTheme(next);
    try {
      localStorage.setItem("laitin-theme", next);
    } catch (error) {}
  });

  // Glow follows the pointer on any glow-enabled control (--mx/--my read by CSS).
  document.addEventListener("pointermove", (event) => {
    const control = event.target.closest?.("button, .category-card");
    if (!control) return;
    const rect = control.getBoundingClientRect();
    control.style.setProperty("--mx", `${((event.clientX - rect.left) / rect.width) * 100}%`);
    control.style.setProperty("--my", `${((event.clientY - rect.top) / rect.height) * 100}%`);
  });

  document.querySelector("#menuButton").addEventListener("click", () => menu.showModal());
  document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => document.querySelector(`#${button.dataset.close}`).close()));
  [menu, galleryDialog, specDialog].forEach((dialog) => dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  }));

  renderMenu();
  if (pageId === 1) renderProductPage();
  if (pageId === 2) renderComingSoon("調光色體驗室");
  if (pageId === 3) renderCompany();
  if (pageId === 4) renderOtherProducts();
  if (pageId === 5) renderComingSoon("購物試算");
  if (pageId === 6) renderContact();
})();
