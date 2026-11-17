// Captures the app screens used by the product video. Runs in Electron against
// dist/ with a demo bridge, so no audio hardware is needed: `npm run video:capture`.
// Besides the PNGs it writes src/layout.json: where the elements the video
// points at sit in each shot, in CSS pixels.
const { app, BrowserWindow } = require("electron");
const { mkdirSync, writeFileSync } = require("node:fs");
const path = require("node:path");

// A typical laptop window, so the UI appears close to its real size in the video.
const viewport = { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false };
const out = path.join(__dirname, "public/shots");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app
  .whenReady()
  .then(async () => {
    const win = new BrowserWindow({
      width: viewport.width,
      height: viewport.height,
      show: false,
      useContentSize: true,
      webPreferences: {
        preload: path.join(__dirname, "capture-preload.cjs"),
        contextIsolation: true,
        sandbox: true,
        backgroundThrottling: false,
        // Keeps painting while hidden, so the track rows' fade-in animations finish.
        offscreen: true,
      },
    });
    win.webContents.on("console-message", (event) => {
      if (event.level === "error") console.error(event.message);
    });
    const cdp = win.webContents.debugger;
    const run = (js) => win.webContents.executeJavaScript(js);
    const shot = async (name, settle = 600) => {
      await wait(settle);
      await run("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))");
      const { data } = await cdp.sendCommand("Page.captureScreenshot", { format: "png" });
      writeFileSync(path.join(out, name + ".png"), Buffer.from(data, "base64"));
      console.log("captured", name);
    };
    const tab = (label) =>
      run(`[...document.querySelectorAll('.tab')].find(b => b.textContent.trim() === ${JSON.stringify(label)})?.click()`);
    const byText = (selector, text) =>
      `[...document.querySelectorAll(${JSON.stringify(selector)})].find(e => e.textContent.trim().startsWith(${JSON.stringify(text)}))`;
    // Rects of the given element expressions, rounded to whole CSS pixels.
    const measure = async (elements) => {
      const rects = await run(`(() => {
        const box = (e) => { if (!e) return null; const r = e.getBoundingClientRect();
          return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }; };
        return { ${Object.entries(elements).map(([k, js]) => `${JSON.stringify(k)}: box(${js})`).join(", ")} };
      })()`);
      for (const [k, r] of Object.entries(rects)) if (!r) throw new Error("Could not find " + k);
      return rects;
    };
    const layout = { viewport: { width: viewport.width, height: viewport.height } };

    mkdirSync(out, { recursive: true });
    await win.loadFile(path.join(__dirname, "../dist/index.html"));
    // The viewport is emulated so the shots don't depend on the size of this machine's screen.
    cdp.attach("1.3");
    await cdp.sendCommand("Emulation.setDeviceMetricsOverride", viewport);
    win.webContents.setFrameRate(60);
    for (let attempt = 0; attempt < 40; ++attempt) {
      if (await run("!!document.querySelector('.app') && !document.querySelector('.app').inert")) break;
      await wait(100);
    }
    await run(`document.querySelector('.welcome-dialog .modal-close')?.click()`);
    // The video draws its own moving playhead, so the app's own one is hidden throughout.
    await win.webContents.insertCSS(
      `.level-slider { --signal: 58% !important; } *, *::before, *::after { caret-color: transparent !important; }
       .playhead { visibility: hidden !important; }`,
    );

    // A shorter properties panel leaves room for all four tracks.
    await run(`document.querySelector('[aria-label="Properties panel height"]').focus()`);
    for (const keyCode of ["Home", "Up", "Up", "Up", "Up"]) {
      win.webContents.sendInputEvent({ type: "keyDown", keyCode });
      win.webContents.sendInputEvent({ type: "keyUp", keyCode });
    }
    await run(`document.querySelector('[data-track-header="g"]')?.click()`);
    await tab("Recording");
    await shot("workspace", 1200);
    layout.workspace = await measure({
      record: "document.querySelector('.record-button')",
      lanes: "document.querySelector('.lanes')",
      timeline: "document.querySelector('.timeline-scroll')",
      ruler: "document.querySelector('.ruler')",
    });

    await tab("EQ & Effects");
    await run(`document.querySelector('[aria-label="Expand equalizer"], [aria-label="Open equalizer editor"]')?.click()`);
    // The video draws its own animated curve over the plot.
    const bare = await win.webContents.insertCSS(".eq-fill, .eq-curve, .eq-node { visibility: hidden; }");
    await shot("eq-blank");
    await win.webContents.removeInsertedCSS(bare);
    layout.eq = await measure({ plot: `document.querySelector('svg[aria-label="Equalizer frequency response"]')` });
    await run(`document.querySelector('[aria-label="Restore editor"]')?.click()`);

    await run("window.basement.demoLoop(true)");
    await run(`document.querySelector('[data-track-header="b"]')?.click()`);
    await run(`document.querySelector('[data-clip="b1"]')?.click()`);
    await tab("Region");
    await shot("takes", 900);
    layout.takes = await measure({
      loop: "document.querySelector('.cycle-region')",
      picker: byText("select", "Take"),
    });
    await run("window.basement.demoLoop(false)");

    await run(`document.querySelector('[data-track-header="m"]')?.click()`);
    await tab("Recording");
    await run(`${byText("button", "MIDI device")}.click()`);
    await shot("midi-input", 800);
    layout.midiInput = await measure({
      device: `[...document.querySelectorAll('select')].find(s => s.value === 'pad')`,
      header: `document.querySelector('[data-track-header="m"]')`,
    });
    await run(`document.querySelector('.modal-close')?.click()`);
    await wait(300);

    await run(`document.querySelector('[data-clip="m1"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`);
    await wait(900);
    await run(`document.querySelector('[aria-label="Maximize MIDI editor"]').click()`);
    await shot("midi-max", 500);
    layout.midi = await measure({
      roll: "document.querySelector('.piano-scroll')",
      draw: byText("button", "Draw"),
      // The box around every note, as if it were one element.
      notes: `(() => { const rs = [...document.querySelectorAll('.piano-note')].map(e => e.getBoundingClientRect());
        const x = Math.min(...rs.map(r => r.left)), y = Math.min(...rs.map(r => r.top));
        return { getBoundingClientRect: () => ({ x, y, width: Math.max(...rs.map(r => r.right)) - x, height: Math.max(...rs.map(r => r.bottom)) - y }) }; })()`,
    });
    const noNotes = await win.webContents.insertCSS(".piano-note { visibility: hidden; }");
    await shot("midi-max-empty", 300);
    await win.webContents.removeInsertedCSS(noNotes);
    await run(`document.querySelector('[aria-label="Restore editor"]').click()`);

    await tab("Plug-ins");
    await shot("plugins", 700);
    layout.plugins = await measure({
      chain: "document.querySelector('.plugin-slot')?.parentElement",
      add: byText("button", "Add VST3 effect"),
      replace: byText("button", "Replace"),
    });
    await run(`${byText("button", "Replace")}.click()`);
    await shot("browser", 900);
    layout.browser = await measure({
      dialog: "document.querySelector('.sound-browser')",
      list: "document.querySelector('.library-list')",
    });
    await run(`document.querySelector('.sound-browser .modal-close')?.click()`);

    await run(`document.querySelector('[data-track-header="g"]')?.click()`);
    await tab("Recording");
    await run("window.basement.demoClear()");
    await shot("empty", 1000);
    await run("window.basement.demoRecord()");
    await shot("recording", 1000);

    writeFileSync(path.join(__dirname, "src/layout.json"), JSON.stringify(layout, null, 2) + "\n");
    win.destroy();
    app.quit();
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
