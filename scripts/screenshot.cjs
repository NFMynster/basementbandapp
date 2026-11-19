// Development-only visual smoke test. Runs in Electron, with no microphone capture.
const { app, BrowserWindow } = require("electron");
const { mkdirSync, writeFileSync } = require("node:fs");
const path = require("node:path");
app
  .whenReady()
  .then(async () => {
    const win = new BrowserWindow({
      width: 1440,
      height: 960,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, "screenshot-preload.cjs"),
        contextIsolation: true,
        sandbox: true,
        backgroundThrottling: false,
      },
    });
    win.webContents.on("console-message", (_, level, message) => {
      if (level >= 2) console.error(message);
    });
    await win.loadFile(path.join(__dirname, "../dist/index.html"));
    await win.webContents.insertCSS(
      "*, *::before, *::after { animation: none !important; transition: none !important; }",
    );
    for (let attempt = 0; attempt < 40; ++attempt) {
      if (
        await win.webContents.executeJavaScript(
          "!!document.querySelector('.app') && !document.querySelector('.app').inert",
        )
      )
        break;
      await new Promise((r) => setTimeout(r, 100));
    }
    await win.webContents.executeJavaScript(
      `document.querySelector('.welcome-dialog .modal-close')?.click()`,
    );
    await new Promise((r) => setTimeout(r, 100));
    mkdirSync("artifacts/screenshots", { recursive: true });
    writeFileSync(
      "artifacts/screenshots/workspace.png",
      (await win.webContents.capturePage()).toPNG(),
    );
    const footerActions = await win.webContents.executeJavaScript(`(() => ({
      feedbackRemoved: !document.querySelector('.footer-feedback'),
      update: document.querySelector('.update-available')?.textContent.trim()
    }))()`);
    if (
      !footerActions.feedbackRemoved ||
      footerActions.update !== "update available"
    )
      throw new Error(
        "Only the update action should appear in the footer: " +
          JSON.stringify(footerActions),
      );
    await win.webContents.executeJavaScript(
      `document.querySelector('[title="Quick guide"]').click()`,
    );
    await new Promise((r) => setTimeout(r, 100));
    const guide = await win.webContents.executeJavaScript(`(() => {
      const dialog = document.querySelector('.help-modal');
      return {
        recording: dialog?.textContent.includes('on-screen R control'),
        feedback: dialog?.querySelector('.help-feedback')?.textContent.trim(),
        links: dialog?.querySelectorAll('.help-links button').length
      };
    })()`);
    if (
      !guide.recording ||
      guide.feedback !== "Feedback, bugs & suggestions" ||
      guide.links !== 3
    )
      throw new Error(
        "Quick guide actions are incomplete: " + JSON.stringify(guide),
      );
    await win.webContents.executeJavaScript(
      "new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))",
    );
    await win.webContents.capturePage();
    await new Promise((r) => setTimeout(r, 100));
    writeFileSync(
      "artifacts/screenshots/help.png",
      (await win.webContents.capturePage()).toPNG(),
    );
    await win.webContents.executeJavaScript(
      `document.querySelector('.help-feedback').click()`,
    );
    await new Promise((r) => setTimeout(r, 100));
    const feedback = await win.webContents.executeJavaScript(`(() => {
      const dialog = document.querySelector('.feedback-dialog');
      const box = dialog?.getBoundingClientRect();
      return {
        title: dialog?.getAttribute('aria-label'),
        personal: dialog?.textContent.includes('comes straight to me'),
        address: dialog?.textContent.includes('nfmynster@footstomp.studio'),
        onScreen: !!box && box.top >= 0 && box.bottom <= innerHeight
      };
    })()`);
    if (
      feedback.title !== "Write to me" ||
      !feedback.personal ||
      !feedback.address ||
      !feedback.onScreen
    )
      throw new Error(
        "Feedback dialog is incomplete or clipped: " + JSON.stringify(feedback),
      );
    await win.webContents.executeJavaScript(
      "new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))",
    );
    await win.webContents.capturePage();
    await new Promise((r) => setTimeout(r, 100));
    writeFileSync(
      "artifacts/screenshots/feedback.png",
      (await win.webContents.capturePage()).toPNG(),
    );
    await win.webContents.executeJavaScript(
      `document.querySelector('.feedback-dialog .modal-close').click()`,
    );
    await win.webContents.executeJavaScript(
      `document.querySelector('[aria-label="Track appearance"]').click()`,
    );
    await new Promise((r) => setTimeout(r, 80));
    const meterStyle = await win.webContents.insertCSS(
      ".level-slider { --signal: 62% !important; }",
    );
    await new Promise((r) => setTimeout(r, 100));
    console.log(
      await win.webContents.executeJavaScript(
        `(() => { const e = document.querySelector('.level-slider-trough i'); const s = getComputedStyle(e); return { level: getComputedStyle(e.parentElement.parentElement).getPropertyValue('--signal'), width: s.width, height: s.height, background: s.backgroundImage }; })()`,
      ),
    );
    writeFileSync(
      "artifacts/screenshots/appearance.png",
      (await win.webContents.capturePage()).toPNG(),
    );
    await win.webContents.removeInsertedCSS(meterStyle);
    win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
    await new Promise((r) => setTimeout(r, 50));
    const result = await win.webContents.executeJavaScript(
      `({title:document.title,tracks:document.querySelectorAll('.track-header').length,clips:document.querySelectorAll('.clip').length,overflow:document.documentElement.scrollWidth>window.innerWidth})`,
    );
    console.log(JSON.stringify(result));
    await win.webContents.executeJavaScript(
      `document.querySelector('[aria-label="Tuner"]').click()`,
    );
    await new Promise((r) => setTimeout(r, 150));
    const tuner = await win.webContents.executeJavaScript(`(() => {
      const dialog = document.querySelector('.tuner-dialog');
      const cover = dialog?.closest('.modal-backdrop');
      return { label: dialog?.textContent.includes('6th string'),
        coversTimeline: document.elementFromPoint(20, innerHeight / 2) === cover,
        modes: dialog?.querySelectorAll('.tuner-modes button').length };
    })()`);
    if (!tuner.label || !tuner.coversTimeline || tuner.modes !== 3)
      throw new Error(
        "Tuner must cover the workspace and name guitar strings: " +
          JSON.stringify(tuner),
      );
    await win.webContents.executeJavaScript(
      "new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))",
    );
    await win.webContents.capturePage();
    await new Promise((r) => setTimeout(r, 150));
    writeFileSync(
      "artifacts/screenshots/tuner.png",
      (await win.webContents.capturePage()).toPNG(),
    );
    await win.webContents.executeJavaScript(
      `document.querySelector('.tuner-dialog .modal-close').click()`,
    );
    await new Promise((r) => setTimeout(r, 100));
    await win.webContents.executeJavaScript(
      `document.querySelector('[title="Input settings"]').click()`,
    );
    await new Promise((r) => setTimeout(r, 200));
    writeFileSync(
      "artifacts/screenshots/setup.png",
      (await win.webContents.capturePage()).toPNG(),
    );
    win.setSize(1100, 700);
    await win.webContents.capturePage();
    for (const scroll of [0, 100000]) {
      await win.webContents.executeJavaScript(
        `document.querySelector('.modal-scroll').scrollTop = ${scroll}`,
      );
      await win.webContents.capturePage();
      const visible = await win.webContents.executeJavaScript(`(() => {
        const panel = document.querySelector('.modal');
        const body = document.querySelector('.modal-scroll');
        const button = document.querySelector('.modal-fixed-footer .primary').getBoundingClientRect();
        return button.top >= 0 && button.bottom <= innerHeight && getComputedStyle(panel).overflow === 'hidden'
          && body.getBoundingClientRect().bottom <= button.top;
      })()`);
      if (!visible)
        throw new Error(
          "Settings Done must remain visible outside the clipped scrolling body",
        );
    }
    writeFileSync(
      "artifacts/screenshots/setup-small.png",
      (await win.webContents.capturePage()).toPNG(),
    );
    for (const output of ["Unavailable", "Headphones"]) {
      await win.webContents.executeJavaScript(`(() => {
      const select = [...document.querySelectorAll('label')].find(l => l.textContent.trim().startsWith('Output device')).querySelector('select');
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, ${JSON.stringify(output)});
      select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
      await new Promise((r) => setTimeout(r, 100));
      const appliedOutput = await win.webContents.executeJavaScript(
        `(async () => (await window.basement.command({op:'devices'})).output)()`,
      );
      if (output === "Headphones" && appliedOutput !== output)
        throw new Error("Output selection must apply before Done");
      await win.webContents.executeJavaScript(
        `document.querySelector('.modal-bottom .primary').click()`,
      );
      await new Promise((r) => setTimeout(r, 100));
      const result = await win.webContents.executeJavaScript(
        `(async () => ({dialogs:[...document.querySelectorAll('[role="dialog"]')].map(e=>e.getAttribute("aria-label")),done:document.querySelector(".modal-bottom .primary")?.outerHTML,open:!!document.querySelector('[role="dialog"]'), error:!!document.querySelector('[role="alert"]'), output:(await window.basement.command({op:'devices'})).output}))()`,
      );
      if (
        output === "Unavailable"
          ? !result.open || !result.error
          : result.open || result.output !== "Headphones"
      )
        throw new Error(
          "Done did not apply audio settings safely: " + JSON.stringify(result),
        );
    }
    console.log(
      "Audio setup: selections apply immediately; failures keep the dialog open.",
    );
    await win.webContents.executeJavaScript(`(() => {
      document.querySelector('.modal-close')?.click();
      document.querySelector('.toast.error button[title="Dismiss"]')?.click();
      document.querySelector('[data-track-header="m"]').click();
      [...document.querySelectorAll('.tabs button')].find(b => b.textContent.includes('Plug-ins')).click();
    })()`);
    await new Promise((r) => setTimeout(r, 100));
    const chain = await win.webContents.executeJavaScript(`(() => {
      const slots = document.querySelectorAll('.plugin-slot');
      const button = [...document.querySelectorAll('.plugin-details button')].find(b => b.textContent.includes('Add VST3 effect'));
      button.scrollIntoView({ block: 'nearest' });
      return slots.length;
    })()`);
    if (chain !== 3)
      throw new Error("Instrument and both effect slots must render");
    if (
      await win.webContents.executeJavaScript(
        "!!document.querySelector('.instrument-empty')",
      )
    )
      throw new Error(
        "The instrument hint must hide once an instrument is loaded",
      );
    win.showInactive();
    await new Promise((r) => setTimeout(r, 250));
    writeFileSync(
      "artifacts/screenshots/plugin-chain.png",
      (await win.webContents.capturePage()).toPNG(),
    );
    // Without an instrument, a MIDI track explains why it is silent.
    await win.webContents.executeJavaScript(
      `document.querySelector('.plugin-slot button[title="Remove plug-in"]').click()`,
    );
    await new Promise((r) => setTimeout(r, 150));
    const hint = await win.webContents.executeJavaScript(`(() => {
      // The explanation lives inside the instrument slot, next to its button.
      const card = document.querySelector('.plugin-slot.instrument-empty');
      const add = card?.querySelector('.instrument-empty-add');
      return add && add.textContent.includes('Add VST3 instrument') ? card.textContent : "";
    })()`);
    if (!hint.includes("no sound yet"))
      throw new Error("An empty MIDI track must show the instrument hint");
    writeFileSync(
      "artifacts/screenshots/midi-instrument-hint.png",
      (await win.webContents.capturePage()).toPNG(),
    );
    win.destroy();
    app.quit();
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
