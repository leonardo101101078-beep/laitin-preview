(() => {
  "use strict";

  // Background layers: aurora (CSS only), spotlight (CSS + pointer vars), dust / stars (canvas).
  // Active set comes from ?bg=aurora,spotlight,dust, else localStorage; ?lab=1 shows a switcher.
  const LAYERS = ["aurora", "spotlight", "dust", "stars"];
  const root = document.documentElement;
  const fx = document.querySelector("#bgFx");
  const canvas = fx.querySelector(".bg-particles");
  const ctx = canvas.getContext("2d");
  const params = new URLSearchParams(location.search);
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const noHover = matchMedia("(hover: none)").matches;
  // ?lab=1 sticks for the browser tab so the panels survive menu navigation (?page=N)
  const labMode = (() => {
    try {
      if (new URLSearchParams(location.search).has("lab")) sessionStorage.setItem("laitin-lab", "1");
      return sessionStorage.getItem("laitin-lab") === "1";
    } catch (error) {
      return new URLSearchParams(location.search).has("lab");
    }
  })();

  const readStored = () => {
    try {
      return localStorage.getItem("laitin-bg") || "";
    } catch (error) {
      return "";
    }
  };
  const active = new Set((params.get("bg") ?? readStored()).split(",").filter((name) => LAYERS.includes(name)));

  const pointer = { x: innerWidth / 2, y: innerHeight * 0.4, tx: innerWidth / 2, ty: innerHeight * 0.4, seen: false };
  let particles = [];
  let width = 0;
  let height = 0;
  let frameId = 0;

  function sprite(color) {
    const size = 32;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d");
    const gradient = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, color);
    gradient.addColorStop(0.35, color.replace(/[\d.]+\)$/, "0.45)"));
    gradient.addColorStop(1, color.replace(/[\d.]+\)$/, "0)"));
    g.fillStyle = gradient;
    g.fillRect(0, 0, size, size);
    return c;
  }
  const sprites = {
    dustDark: sprite("rgba(255, 196, 130, 1)"),
    dustLight: sprite("rgba(196, 118, 40, 1)"),
    star: sprite("rgba(235, 242, 255, 1)"),
  };

  function resize() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    width = innerWidth;
    height = innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.round(Math.min(150, (width * height) / 9000));
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      z: 0.2 + Math.random() * 0.8,
      phase: Math.random() * Math.PI * 2,
    }));
  }

  function drawParticles(time, move) {
    const mode = active.has("dust") ? "dust" : "stars";
    const light = root.dataset.theme === "light";
    ctx.clearRect(0, 0, width, height);
    if (mode === "stars" && light) return; // stars only read on dark
    const image = mode === "dust" ? (light ? sprites.dustLight : sprites.dustDark) : sprites.star;
    const offsetX = pointer.x - width / 2;
    const offsetY = pointer.y - height / 2;
    for (const p of particles) {
      if (move) {
        p.y -= (mode === "dust" ? 0.14 : 0.03) * p.z;
        p.x += Math.sin(time * 0.0004 + p.phase) * 0.05;
        if (p.y < -12) {
          p.y = height + 12;
          p.x = Math.random() * width;
        }
      }
      // nearer particles (higher z) shift more against the pointer → parallax depth
      const x = (((p.x - offsetX * p.z * 0.05) % width) + width) % width;
      const y = p.y - offsetY * p.z * 0.05;
      const twinkle = 0.5 + 0.5 * Math.sin(time * 0.0015 + p.phase);
      let alpha = (0.25 + 0.75 * twinkle) * p.z;
      if (mode === "dust") {
        // dust catches light near the "lamp"
        const near = Math.max(0, 1 - Math.hypot(x - pointer.x, y - pointer.y) / 220);
        alpha = Math.min(1, alpha * (0.55 + near * 1.6));
      }
      const radius = mode === "dust" ? 1.5 + p.z * 4.5 : 0.8 + p.z * 2.2;
      ctx.globalAlpha = light ? alpha * 0.7 : alpha;
      ctx.drawImage(image, x - radius, y - radius, radius * 2, radius * 2);
    }
    ctx.globalAlpha = 1;
  }

  function frame(time) {
    frameId = 0;
    if (document.hidden) return;
    if (noHover || !pointer.seen) {
      // no cursor (touch) → lamp wanders slowly on its own
      pointer.tx = width * (0.5 + 0.34 * Math.sin(time * 0.00023));
      pointer.ty = height * (0.38 + 0.22 * Math.sin(time * 0.00031 + 1));
    }
    pointer.x += (pointer.tx - pointer.x) * 0.08;
    pointer.y += (pointer.ty - pointer.y) * 0.08;
    fx.style.setProperty("--sx", `${pointer.x}px`);
    fx.style.setProperty("--sy", `${pointer.y}px`);
    if (active.has("dust") || active.has("stars")) drawParticles(time, true);
    schedule();
  }

  function schedule() {
    const needsLoop = active.has("spotlight") || active.has("dust") || active.has("stars");
    if (!needsLoop || reduceMotion || frameId) return;
    frameId = requestAnimationFrame(frame);
  }

  function apply() {
    root.dataset.bg = [...active].join(" ");
    if (reduceMotion && (active.has("dust") || active.has("stars"))) drawParticles(0, false);
    schedule();
  }

  addEventListener("pointermove", (event) => {
    if (event.pointerType !== "mouse") return;
    pointer.seen = true;
    pointer.tx = event.clientX;
    pointer.ty = event.clientY;
    if (reduceMotion) {
      fx.style.setProperty("--sx", `${event.clientX}px`);
      fx.style.setProperty("--sy", `${event.clientY}px`);
    }
  });
  addEventListener("resize", () => {
    resize();
    if (reduceMotion) apply();
  });
  document.addEventListener("visibilitychange", schedule);
  // redraw static particles when theme flips under reduced motion
  new MutationObserver(() => reduceMotion && apply()).observe(root, { attributeFilter: ["data-theme"] });

  function renderLab() {
    const lab = document.createElement("form");
    lab.className = "bg-lab";
    lab.setAttribute("aria-label", "背景效果實驗");
    const names = { aurora: "色溫極光", spotlight: "聚光網格", dust: "暖色光塵", stars: "星光視差" };
    lab.innerHTML = `<strong>BG LAB</strong>${LAYERS.map((name) => `<label><input type="checkbox" value="${name}" ${active.has(name) ? "checked" : ""} />${names[name]}</label>`).join("")}`;
    lab.addEventListener("change", (event) => {
      const input = event.target;
      if (input.checked) {
        active.add(input.value);
        // dust and stars share one canvas — keep them exclusive
        const rival = { dust: "stars", stars: "dust" }[input.value];
        if (rival) {
          active.delete(rival);
          lab.querySelector(`[value="${rival}"]`).checked = false;
        }
      } else {
        active.delete(input.value);
      }
      try {
        localStorage.setItem("laitin-bg", [...active].join(","));
      } catch (error) {}
      apply();
    });
    document.body.append(lab);
  }

  resize();
  apply();
  if (labMode) renderLab();
})();
