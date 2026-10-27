(() => {
  "use strict";

  const STORAGE_KEY = "contact-display-settings-v1";
  const DEFAULT_SETTINGS = {
    gum: { scale: 100, bw: false, negative: false, exposure: 60, post: 0 },
    paper: { scale: 100, bw: false, negative: false, safety: false, brightness: false, pre: 10, duration: 8, post: 10, strips: 5, images: 4 }
  };
  const screens = {
    home: document.getElementById("homeScreen"),
    gum: document.getElementById("gumScreen"),
    paper: document.getElementById("paperScreen"),
    help: document.getElementById("helpScreen")
  };
  const imageFile = document.getElementById("imageFile");
  const displayScreen = document.getElementById("displayScreen");
  const displayCanvas = document.getElementById("displayCanvas");
  const contexts = new WeakMap();
  let settings = loadSettings();
  let currentScreen = "home";
  let activeMode = null;
  let originalCanvas = null;
  const processedCanvases = { gum: null, paper: null };
  const processedSignatures = { gum: "", paper: "" };
  let imageName = "";
  let player = null;
  let animationId = 0;
  let wakeLock = null;
  let lifeCells = [];
  let lifeColumns = 0;
  let lifeRows = 0;

  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return {
        gum: { ...DEFAULT_SETTINGS.gum, ...(saved.gum || {}) },
        paper: { ...DEFAULT_SETTINGS.paper, ...(saved.paper || {}) }
      };
    } catch {
      return structuredClone(DEFAULT_SETTINGS);
    }
  }

  function persistSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // The app remains usable when browser storage is unavailable.
    }
  }

  function normalizedValue(mode, key, value) {
    const number = Number(value);
    if (mode === "gum" && key === "exposure") return clamp(Math.round(number / 15) * 15, 15, 240);
    if (mode === "gum" && key === "post") return clamp(Math.round(number / 15) * 15, 0, 240);
    const ranges = {
      scale: [10, 200],
      pre: [0, 3600],
      duration: [1, 3600],
      post: [0, 3600],
      strips: [2, 12],
      images: [2, 9]
    };
    if (ranges[key]) return clamp(Math.round(number), ranges[key][0], ranges[key][1]);
    return value;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
  }

  function applySettingsToControls() {
    document.querySelectorAll("[data-mode][data-key]").forEach((input) => {
      const { mode, key } = input.dataset;
      const value = settings[mode][key];
      if (input.type === "checkbox") input.checked = Boolean(value);
      else input.value = String(value);
    });
    updateUi();
  }

  function updateUi() {
    document.getElementById("gumScaleValue").value = `${settings.gum.scale}%`;
    document.getElementById("paperScaleValue").value = `${settings.paper.scale}%`;
    document.getElementById("fileName").textContent = imageName || "No photo loaded. Drop an image here, or choose a file.";
    document.getElementById("paperFileName").textContent = imageName || "No photo loaded. Drop an image here, or choose a file.";

    const hasImage = Boolean(originalCanvas);
    document.getElementById("gumDisplay").disabled = !hasImage;
    const paperCanDisplay = hasImage && settings.paper.safety;
    ["paperDisplay", "stripTest", "multiTest"].forEach((id) => {
      document.getElementById(id).disabled = !paperCanDisplay;
    });

    const redMode = activeMode === "paper" && settings.paper.safety && !settings.paper.brightness;
    document.body.classList.toggle("safety-mode", redMode);
    document.body.classList.toggle("full-brightness", activeMode === "paper" && settings.paper.brightness);
    renderPreviews();
  }

  function showScreen(name) {
    currentScreen = name;
    Object.entries(screens).forEach(([key, element]) => {
      element.hidden = key !== name;
    });
    document.getElementById("lifeCanvas").hidden = name !== "home";
    if (name === "gum" || name === "paper") activeMode = name;
    else activeMode = null;
    updateUi();
    window.scrollTo(0, 0);
  }

  document.querySelectorAll("[data-open-mode]").forEach((button) => {
    button.addEventListener("click", () => showScreen(button.dataset.openMode));
  });
  document.querySelectorAll("[data-go-home]").forEach((button) => {
    button.addEventListener("click", () => showScreen("home"));
  });
  document.getElementById("helpButton").addEventListener("click", () => showScreen("help"));

  document.querySelectorAll("[data-mode][data-key]").forEach((input) => {
    const eventName = input.type === "range" ? "input" : "change";
    input.addEventListener(eventName, () => {
      const { mode, key } = input.dataset;
      const value = input.type === "checkbox" ? input.checked : normalizedValue(mode, key, input.value);
      settings[mode][key] = value;
      if (input.type === "number") input.value = String(value);
      persistSettings();
      updateUi();
    });
  });

  async function decodeImage(file) {
    if ("createImageBitmap" in window) {
      return createImageBitmap(file);
    }
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("This image could not be opened."));
      };
      image.src = url;
    });
  }

  async function loadImage(file) {
    if (!file || !file.type.startsWith("image/")) {
      setFileError("Choose an image file to continue.");
      return;
    }
    setFileError(`Loading ${file.name}…`);
    try {
      const image = await decodeImage(file);
      const sourceWidth = image.width || image.naturalWidth;
      const sourceHeight = image.height || image.naturalHeight;
      if (!sourceWidth || !sourceHeight) throw new Error("This image has no readable dimensions.");
      const scale = Math.min(1, 2400 / sourceWidth, 2400 / sourceHeight, Math.sqrt(4000000 / (sourceWidth * sourceHeight)));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(sourceWidth * scale));
      canvas.height = Math.max(1, Math.round(sourceHeight * scale));
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      if (typeof image.close === "function") image.close();
      originalCanvas = canvas;
      imageName = file.name;
      processedSignatures.gum = "";
      processedSignatures.paper = "";
      updateUi();
      setFileError("");
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "This image could not be opened.");
    }
  }

  function setFileError(message) {
    document.getElementById("fileName").textContent = message;
    document.getElementById("paperFileName").textContent = message;
  }

  imageFile.addEventListener("change", () => {
    const [file] = imageFile.files || [];
    if (file) loadImage(file);
    imageFile.value = "";
  });

  document.addEventListener("dragenter", (event) => {
    if (event.dataTransfer && Array.from(event.dataTransfer.types).includes("Files")) {
      event.preventDefault();
      document.body.classList.add("dragging");
    }
  });
  document.addEventListener("dragover", (event) => {
    if (event.dataTransfer && Array.from(event.dataTransfer.types).includes("Files")) event.preventDefault();
  });
  document.addEventListener("dragleave", (event) => {
    if (!event.relatedTarget) document.body.classList.remove("dragging");
  });
  document.addEventListener("drop", (event) => {
    document.body.classList.remove("dragging");
    if (!event.dataTransfer?.files?.length) return;
    event.preventDefault();
    loadImage(event.dataTransfer.files[0]);
  });

  function processImage(mode) {
    if (!originalCanvas) return null;
    const options = settings[mode];
    const signature = `${options.bw}:${options.negative}:${mode === "paper" && options.safety}:${originalCanvas.width}:${originalCanvas.height}`;
    if (processedSignatures[mode] === signature) return processedCanvases[mode];
    const canvas = document.createElement("canvas");
    canvas.width = originalCanvas.width;
    canvas.height = originalCanvas.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(originalCanvas, 0, 0);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;
    const safetyRed = mode === "paper" && options.safety;
    for (let index = 0; index < pixels.length; index += 4) {
      let red = pixels[index];
      let green = pixels[index + 1];
      let blue = pixels[index + 2];
      if (options.bw) {
        const luminance = Math.round(0.299 * red + 0.587 * green + 0.114 * blue);
        red = luminance;
        green = luminance;
        blue = luminance;
      }
      if (options.negative) {
        red = 255 - red;
        green = 255 - green;
        blue = 255 - blue;
      }
      if (safetyRed) {
        const luminance = Math.round(0.299 * red + 0.587 * green + 0.114 * blue);
        pixels[index] = Math.round(luminance * (139 / 255));
        pixels[index + 1] = 0;
        pixels[index + 2] = 0;
      } else {
        pixels[index] = red;
        pixels[index + 1] = green;
        pixels[index + 2] = blue;
      }
    }
    context.putImageData(imageData, 0, 0);
    processedCanvases[mode] = canvas;
    processedSignatures[mode] = signature;
    return canvas;
  }

  function renderPreviews() {
    [["gumPreview", "gumEmpty", "gum"], ["paperPreview", "paperEmpty", "paper"]].forEach(([canvasId, emptyId, mode]) => {
      const canvas = document.getElementById(canvasId);
      const empty = document.getElementById(emptyId);
      const processedCanvas = processImage(mode);
      empty.hidden = Boolean(processedCanvas);
      const bounds = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(bounds.width * ratio));
      const height = Math.max(1, Math.round(bounds.height * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const context = getContext(canvas);
      context.fillStyle = "#000";
      context.fillRect(0, 0, width, height);
      if (!processedCanvas) return;
      const fit = Math.min(width / processedCanvas.width, height / processedCanvas.height);
      const scale = settings[mode].scale / 100;
      const imageWidth = processedCanvas.width * fit * scale;
      const imageHeight = processedCanvas.height * fit * scale;
      context.drawImage(processedCanvas, (width - imageWidth) / 2, (height - imageHeight) / 2, imageWidth, imageHeight);
    });
  }

  function getContext(canvas) {
    if (!contexts.has(canvas)) contexts.set(canvas, canvas.getContext("2d"));
    return contexts.get(canvas);
  }

  document.getElementById("gumDisplay").addEventListener("click", () => startPlayback("gum", "normal"));
  document.getElementById("paperDisplay").addEventListener("click", () => startPlayback("paper", "normal"));
  document.getElementById("stripTest").addEventListener("click", () => startPlayback("paper", "strips"));
  document.getElementById("multiTest").addEventListener("click", () => startPlayback("paper", "multi"));

  function startPlayback(mode, type) {
    const image = processImage(mode);
    if (!image || (mode === "paper" && !settings.paper.safety)) return;
    if (mode === "paper" && settings.paper.brightness) {
      settings.paper.brightness = false;
      document.getElementById("paperBrightness").checked = false;
      persistSettings();
    }
    updateUi();
    const options = settings[mode];
    player = {
      mode,
      type,
      image,
      scale: options.scale / 100,
      start: performance.now(),
      duration: mode === "gum" ? options.exposure * 60000 : options.duration * 1000,
      pre: mode === "paper" ? options.pre * 1000 : 0,
      post: options.post * (mode === "gum" ? 60000 : 1000),
      count: type === "strips" ? options.strips : type === "multi" ? options.images : 0,
      lastFrame: ""
    };
    document.getElementById("app").hidden = true;
    document.getElementById("lifeCanvas").hidden = true;
    displayScreen.hidden = false;
    resizeDisplayCanvas();
    const fullscreenRequest = displayScreen.requestFullscreen;
    if (fullscreenRequest) fullscreenRequest.call(displayScreen).catch(() => {});
    requestWakeLock();
    animationId = requestAnimationFrame(playbackFrame);
  }

  function resizeDisplayCanvas() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    displayCanvas.width = Math.max(1, Math.round(window.innerWidth * ratio));
    displayCanvas.height = Math.max(1, Math.round(window.innerHeight * ratio));
    if (player) player.lastFrame = "";
  }

  function playbackFrame() {
    if (!player) return;
    const elapsed = Math.max(0, performance.now() - player.start);
    const finishAt = player.pre + player.duration + player.post;
    if (elapsed >= finishAt) {
      stopPlayback();
      return;
    }
    let phase;
    let imageElapsed = 0;
    if (elapsed < player.pre) phase = "pre";
    else if (elapsed < player.pre + player.duration) {
      phase = "image";
      imageElapsed = elapsed - player.pre;
    } else phase = "post";

    let token = phase;
    if (phase === "image" && player.type === "strips") {
      const strip = Math.min(player.count, Math.floor(imageElapsed / (player.duration / player.count)) + 1);
      token += `:${strip}`;
    } else if (phase === "image" && player.type === "multi") {
      const step = player.duration / player.count;
      const visible = Array.from({ length: player.count }, (_, index) => imageElapsed < step * (index + 1) ? "1" : "0").join("");
      token += `:${visible}`;
    }
    if (token !== player.lastFrame) {
      player.lastFrame = token;
      drawPlaybackFrame(phase, imageElapsed, token);
    }
    animationId = requestAnimationFrame(playbackFrame);
  }

  function drawPlaybackFrame(phase, imageElapsed, token) {
    const context = getContext(displayCanvas);
    const width = displayCanvas.width;
    const height = displayCanvas.height;
    context.fillStyle = "#000";
    context.fillRect(0, 0, width, height);
    if (phase !== "image") return;
    if (player.type === "strips") {
      const visible = Number(token.split(":")[1]) / player.count;
      drawCenteredImage(context, player.image, width, height, player.scale, visible);
      return;
    }
    if (player.type === "multi") {
      const columns = Math.ceil(Math.sqrt(player.count));
      const rows = Math.ceil(player.count / columns);
      const cellWidth = width / columns;
      const cellHeight = height / rows;
      const step = player.duration / player.count;
      for (let index = 0; index < player.count; index += 1) {
        if (imageElapsed >= step * (index + 1)) continue;
        const column = index % columns;
        const row = Math.floor(index / columns);
        const boxWidth = cellWidth * 0.9;
        const boxHeight = cellHeight * 0.9;
        const fit = Math.min(boxWidth / player.image.width, boxHeight / player.image.height) * player.scale;
        const imageWidth = player.image.width * fit;
        const imageHeight = player.image.height * fit;
        context.drawImage(player.image, column * cellWidth + (cellWidth - imageWidth) / 2, row * cellHeight + (cellHeight - imageHeight) / 2, imageWidth, imageHeight);
      }
      return;
    }
    drawCenteredImage(context, player.image, width, height, player.scale, 1);
  }

  function drawCenteredImage(context, image, width, height, scale, visibleRatio) {
    const fit = Math.min(width / image.width, height / image.height) * scale;
    const imageWidth = image.width * fit;
    const imageHeight = image.height * fit;
    const x = (width - imageWidth) / 2;
    const y = (height - imageHeight) / 2;
    context.save();
    context.beginPath();
    context.rect(x, y, imageWidth * visibleRatio, imageHeight);
    context.clip();
    context.drawImage(image, x, y, imageWidth, imageHeight);
    context.restore();
  }

  async function requestWakeLock() {
    if (!player || !("wakeLock" in navigator) || document.visibilityState !== "visible") return;
    try {
      const lock = await navigator.wakeLock.request("screen");
      if (!player) {
        await lock.release();
        return;
      }
      wakeLock = lock;
      lock.addEventListener("release", () => {
        if (wakeLock === lock) wakeLock = null;
      }, { once: true });
    } catch {
      wakeLock = null;
    }
  }

  async function releaseWakeLock() {
    const lock = wakeLock;
    wakeLock = null;
    if (lock) {
      try {
        await lock.release();
      } catch {
        // The browser may already have released it.
      }
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (player && document.visibilityState === "visible" && !wakeLock) requestWakeLock();
  });

  displayScreen.addEventListener("pointerdown", (event) => {
    if (!player) return;
    event.preventDefault();
    const now = performance.now();
    player.taps = now - (player.lastTap || 0) <= 2000 ? (player.taps || 0) + 1 : 1;
    player.lastTap = now;
    if (player.taps >= 5) stopPlayback();
  });

  function stopPlayback() {
    if (!player) return;
    player = null;
    cancelAnimationFrame(animationId);
    releaseWakeLock();
    if (document.fullscreenElement === displayScreen && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
    displayScreen.hidden = true;
    document.getElementById("lifeCanvas").hidden = currentScreen !== "home";
    document.getElementById("app").hidden = false;
    updateUi();
  }

  window.addEventListener("resize", () => {
    if (player) {
      resizeDisplayCanvas();
      playbackFrame();
    } else renderPreviews();
    resizeLifeCanvas();
  });

  function resizeLifeCanvas() {
    const canvas = document.getElementById("lifeCanvas");
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    const width = Math.max(1, Math.round(window.innerWidth * ratio));
    const height = Math.max(1, Math.round(window.innerHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      lifeColumns = Math.ceil(width / 10);
      lifeRows = Math.ceil(height / 10);
      lifeCells = createLifeGrid(lifeColumns, lifeRows);
      drawLife();
    }
  }

  function createLifeGrid(columns, rows) {
    const grid = Array.from({ length: rows }, () => Array(columns).fill(false));
    const patterns = [
      [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]],
      [[0, 0], [1, 0], [2, 0], [0, 1], [1, 2]]
    ];
    patterns.forEach((pattern, index) => {
      const left = Math.floor(columns * (index ? 0.68 : 0.22));
      const top = Math.floor(rows * (index ? 0.67 : 0.28));
      pattern.forEach(([x, y]) => {
        if (grid[top + y]?.[left + x] !== undefined) grid[top + y][left + x] = true;
      });
    });
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        if (Math.random() < 0.055) grid[row][column] = true;
      }
    }
    return grid;
  }

  function stepLife() {
    const next = lifeCells.map((row) => row.map(() => false));
    for (let row = 0; row < lifeRows; row += 1) {
      for (let column = 0; column < lifeColumns; column += 1) {
        let neighbors = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            const y = (row + dy + lifeRows) % lifeRows;
            const x = (column + dx + lifeColumns) % lifeColumns;
            if (lifeCells[y][x]) neighbors += 1;
          }
        }
        next[row][column] = neighbors === 3 || (lifeCells[row][column] && neighbors === 2);
      }
    }
    lifeCells = next;
    drawLife();
  }

  function drawLife() {
    const canvas = document.getElementById("lifeCanvas");
    const context = getContext(canvas);
    context.fillStyle = "#000";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#fff";
    for (let row = 0; row < lifeRows; row += 1) {
      for (let column = 0; column < lifeColumns; column += 1) {
        if (lifeCells[row]?.[column]) context.fillRect(column * 10, row * 10, 7, 7);
      }
    }
  }

  function drawSplashGeneration(generation) {
    const canvas = document.getElementById("splashCanvas");
    const context = getContext(canvas);
    context.fillStyle = "#000";
    context.fillRect(0, 0, canvas.width, canvas.height);
    const origin = 2;
    const cell = 8;
    const start = [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]];
    let grid = Array.from({ length: 7 }, () => Array(7).fill(false));
    start.forEach(([x, y]) => { grid[y + 2][x + 2] = true; });
    for (let step = 0; step < generation; step += 1) {
      const next = grid.map((row) => row.map(() => false));
      for (let y = 0; y < 7; y += 1) {
        for (let x = 0; x < 7; x += 1) {
          let neighbors = 0;
          for (let dy = -1; dy <= 1; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
              if (!dx && !dy) continue;
              if (grid[(y + dy + 7) % 7][(x + dx + 7) % 7]) neighbors += 1;
            }
          }
          next[y][x] = neighbors === 3 || (grid[y][x] && neighbors === 2);
        }
      }
      grid = next;
    }
    context.fillStyle = "#fff";
    grid.forEach((row, y) => row.forEach((alive, x) => {
      if (alive) context.fillRect(origin + x * cell, origin + y * cell, cell - 1, cell - 1);
    }));
  }

  function startApp() {
    applySettingsToControls();
    resizeLifeCanvas();
    renderPreviews();
    document.getElementById("splash").hidden = false;
    let generation = 0;
    const splashInterval = window.setInterval(() => {
      generation += 1;
      drawSplashGeneration(generation);
      if (generation >= 4) {
        window.clearInterval(splashInterval);
        document.getElementById("splash").hidden = true;
        document.getElementById("app").hidden = false;
        window.setInterval(stepLife, 5000);
      }
    }, 150);
    drawSplashGeneration(0);
    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    }
  }

  startApp();
})();
