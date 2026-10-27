# Contact Display Web – Specification

A browser-based version of **Contact Display** for laptops connected to a projector (or an external monitor). It contains only two modes: **Gum Bichromate** and **Photo Paper**. The Film Negative Viewer (camera) mode is intentionally excluded.

## 1. Purpose

Display a prepared image (optionally converted to black & white and/or negative) full-screen on a projector/second screen for a precisely controlled time, in order to expose:

- watercolor paper coated with gum bichromate emulsion, or
- photosensitive (silver gelatin) paper under darkroom safelight.

## 2. Technical requirements

- Pure client-side web app (HTML + CSS + TypeScript/JavaScript). No backend, no accounts, no analytics, no ads, no network calls after load.
- Static hosting (e.g. Azure Storage static website) or run locally from `index.html`. Should work offline (PWA with service worker is recommended).
- Target browsers: latest Chrome, Edge, Firefox.
- Suggested stack: Vite + TypeScript (or plain JS), no heavy frameworks. Image processing with `<canvas>`.
- Persist settings in `localStorage` (per mode).
- Privacy: images are read locally via `<input type="file">` / drag & drop and never uploaded.

## 3. Visual design

Theme: Conway's Game of Life, black and white.

- Palette: black (#000), white (#FFF), greys. Pixel/grid aesthetic, monospace or pixel font.
- Home screen: static (or very slow, 1 step per 5 s) Game of Life background drawn on a canvas, behind the menu.
- Startup splash: a centered glider performing 4 generations, stable position (like a spinning wheel; glider stays centered, no background jump), each step fast (~0.15 s), then the home screen appears.
- App icon / favicon: glider made of white cells on black.
- "How to use" button in the lower-right corner of the home screen opening an instructions page.

## 4. Screens

### 4.1 Home screen
- Title "Contact Display".
- Two large buttons: **Gum Bichromate**, **Photo Paper**.
- "How to use" button (lower-right).
- Back navigation from each mode returns here.

### 4.2 Gum Bichromate screen

Light safety: no safelight is needed (slightly dark room is enough), so the UI is normal black/white (no red).

Controls:
1. **Load photo** button (file picker / drag & drop).
2. **Convert to black & white** button.
3. **Convert to negative** switch/button.
4. **Image size** slider (percent, e.g. 10–100%+) to fit the paper when using a projector. Preview updates live.
5. **Exposure time** in minutes, stepper in 15-minute steps (e.g. 15, 30, … 60, 90, 120…). Default 60.
6. **Black screen after exposure** in minutes, 15-minute steps, minimum 0 (default 0). Keeps screen black so the paper is not exposed further while the user is away.
7. **Display negative** button.

Not present: pre/post seconds, test strips, multi-image test, safety mode, brightness switch (the web app cannot control hardware brightness; user sets projector brightness manually, maximum recommended).

Display behaviour:
- Fullscreen (Fullscreen API) black background with the processed image centered at the chosen scale.
- Countdown runs for exposure time, then screen turns completely black for the post-exposure black time, then returns to the settings screen.
- Exit at any time by clicking/tapping the screen **5 times** quickly (counter resets after ~2 s idle). No visible UI during display.
- Keep the screen awake using the Screen Wake Lock API (`navigator.wakeLock.request('screen')`), re-acquire on `visibilitychange`. Disable the screensaver during long exposures (hours).
- Timing must use `performance.now()` / timestamps (not accumulated `setInterval`) to avoid drift, as exposures last 1–2 hours.

### 4.3 Photo Paper screen

Light safety: darkroom safelight (red). UI uses dark red on black (dim, not bright) when **Safety mode** is on.

Controls:
1. **Load photo**.
2. **Image size** slider – placed directly below the Load photo button.
3. **Convert to black & white**.
4. **Convert to negative**.
5. **Safety mode** switch: when on, the UI and displayed image are rendered in dark red (image mapped to the red channel only; use a dark red such as `#8B0000`-ish max intensity, tunable). **The negative cannot be displayed unless safety mode is on.**
6. **Use device brightness** switch: in the web version, this toggles a "full-brightness UI" (white UI) for pre/post operations such as loading and setting times. It must be off during exposure. The safety-mode UI and image size stay white-independent (controls remain functional in safety mode).
7. **Display settings** (seconds):
   - **Pre-display black**: black screen before the image (time to place the screen/projector over the paper). Default 10.
   - **Display duration**: image exposure time. Default e.g. 8.
   - **Post-display black**: black screen after exposure. Default 10.
8. **Test exposure** settings:
   - Number of **strips** for strip test.
   - Number of **images** for multi-image test.
9. Three buttons:
   - **Display negative**
   - **Strip test**
   - **Multi-image test**

Display behaviour:
- Sequence: pre black → image → post black → return to settings.
- Fullscreen, centered image at chosen scale, red when safety mode is on.
- Exit by clicking the screen 5 times, same as gum bichromate.
- Wake Lock as above.
- Show no UI during display (optionally a very dim countdown could be a setting, off by default).

#### Strip test
- The image is exposed in N vertical (or horizontal) strips; the strips are revealed progressively so that strip 1 receives the longest exposure and the last strip the shortest (or vice versa, consistently documented). Each step lasts a fixed interval derived from the display duration setting; the not-yet-revealed portion stays black.
- After development the user chooses the best strip and sets display duration accordingly.

#### Multi-image test
- The canvas shows N small copies of the full image in a grid. Each copy is exposed for a different time (e.g. 1 × step, 2 × step, … N × step); copies are hidden (turned black) when their time is reached.
- The user picks the best copy after development, then sets display duration.
- Development, stop bath and fixing times must be identical to the final print.

## 5. Image processing

- Load via `FileReader` → `ImageBitmap`/`<img>` → canvas.
- **Black & white**: luminance `0.299R + 0.587G + 0.114B`.
- **Negative**: `255 − value` per channel.
- **Safety red**: output pixel = (lum × redMax, 0, 0).
- Conversions are toggles applied non-destructively from the original image.
- Scaling: percent of the screen's fit-to-viewport size; centered; black background. Keep aspect ratio.
- Support large images (downscale to screen resolution for display to save memory).

## 6. Settings persistence

`localStorage` keys per mode: exposure/durations, black times, scale %, switches, test counts. Do not store images.

## 7. Instructions page ("How to use")

Themed (black/white, pixel art, glider illustrations). Two separate sections:

### Gum Bichromate workflow
1. Get watercolor paper.
2. Mix gum arabic solution with watercolor paint.
3. Add potassium bichromate – from now on the mixture is light sensitive (slightly dark room, no safelight needed).
4. Paint the paper with a brush; dry about 2 hours. Optionally add another layer and dry again.
5. Prepare the image in the app: load, convert to B&W if needed, convert to negative.
6. Set exposure time (usually 1–2 h) and black screen time after exposure.
7. For a projector, adjust image size to the paper; set up focus/sharpness.
8. Place dried paper in a clip frame in a dark place, press **Display negative**, put the laptop screen on the frame or point the projector at it.
9. After exposure, put the paper image-down in water for ~20 minutes; check periodically (time varies).
10. When the image is ready, remove and dry.

### Photo Paper workflow
1. Needs photosensitive paper, developer, stop bath, fixer.
2. Work under a red safelight; enable Safety mode.
3. Load photo, convert to B&W and negative, adjust size.
4. Use "device brightness" only before/after exposure, never during.
5. Set pre-display black, display duration, post-display black.
6. Run strip test or multi-image test to find the right exposure; then set display duration.
7. Expose: press Display negative; place the screen on the paper / aim the projector.
8. Process: developer → stop bath → fixer (same times as the test), then dry.

## 8. Project structure (suggested)

```
contact-display-web/
  index.html
  src/
    main.ts
    router.ts
    state/settings.ts
    ui/home.ts, gum.ts, paper.ts, help.ts, splash.ts
    display/player.ts        // fullscreen sequence, 5-tap exit, wake lock
    image/process.ts         // bw, negative, red, scale
    life/life.ts             // Game of Life background + glider splash
  public/icon.svg, manifest.webmanifest, sw.js
```

## 9. Acceptance criteria

- Only two modes are available; no camera usage or permissions.
- Gum bichromate: minutes in 15-min steps, post black time starting from 0, 5-click exit, no test features.
- Photo paper: seconds, safety mode required to display, strip and multi-image test, size slider under the Load button.
- Fullscreen display with wake lock works for 2+ hours without screen sleeping.
- Timing drift under 1 second over 2 hours.
- No data leaves the browser.

## 10. Known limitations

- Browsers cannot set hardware screen brightness; the user adjusts laptop/projector brightness manually.
- Wake Lock requires a secure context (HTTPS or localhost).
- Fullscreen must be started by a user action (the Display button).
