const { dialog } = require("electron");
/**
 * @param {import("../types").Window} win
 * @param {import("../types").Request} request
 * @param {string} takeChoice
 */
async function verifyExportAndShortcuts(win, request, takeChoice) {
  await win.webContents.executeJavaScript(
    `document.activeElement?.blur(); document.querySelector('[data-clip="${takeChoice}"]').click()`,
  );
  win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Backspace" });
  win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Backspace" });
  await new Promise((r) => setTimeout(r, 150));
  if (
    (await request({ op: "state" })).tracks.some((t) =>
      t.clips.some((c) => c.id === takeChoice),
    )
  )
    throw new Error("Backspace did not delete the selected region");
  win.webContents.sendInputEvent({
    type: "keyDown",
    keyCode: "Z",
    modifiers: ["control"],
  });
  win.webContents.sendInputEvent({
    type: "keyUp",
    keyCode: "Z",
    modifiers: ["control"],
  });
  await new Promise((r) => setTimeout(r, 180));
  if (
    !(await request({ op: "state" })).tracks.some((t) =>
      t.clips.some((c) => c.id === takeChoice),
    )
  )
    throw new Error("Undo shortcut did not restore the deleted region");
  const zoomBefore = await win.webContents.executeJavaScript(
    `Number(document.querySelector('[aria-label="Timeline zoom"]').value)`,
  );
  await win.webContents.executeJavaScript(
    `document.querySelector('.timeline-scroll').dispatchEvent(new WheelEvent('wheel', { deltaY: -50, ctrlKey: true, clientX: 650, bubbles: true, cancelable: true }))`,
  );
  await new Promise((r) => setTimeout(r, 100));
  if (
    (await win.webContents.executeJavaScript(
      `Number(document.querySelector('[aria-label="Timeline zoom"]').value)`,
    )) <= zoomBefore
  )
    throw new Error("Ctrl-wheel/pinch zoom did not change timeline scale");
  const originalPicker = dialog.showOpenDialog;
  let pickerCalled = false;
  /** @type {(() => void) | undefined} */
  let cancelExport;
  try {
    dialog.showOpenDialog = async () => {
      pickerCalled = true;
      return new Promise((resolve) => {
        cancelExport = () => resolve({ canceled: true, filePaths: [] });
      });
    };
    await win.webContents.executeJavaScript(
      `[...document.querySelectorAll('.file-actions button')].find(b => b.textContent.trim() === 'Export').click()`,
    );
    await new Promise((r) => setTimeout(r, 100));
    if (
      !pickerCalled ||
      !(await win.webContents.executeJavaScript(
        `!!document.querySelector('.export-wait') && !document.querySelector('.modal[aria-label="Export audio"]')`,
      ))
    )
      throw new Error(
        "Export must open picker directly with waiting UI, not a settings dialog",
      );
    cancelExport?.();
    await new Promise((r) => setTimeout(r, 100));
    if (
      await win.webContents.executeJavaScript(
        `!!document.querySelector('.export-wait')`,
      )
    )
      throw new Error("Cancelled export did not dismiss waiting UI");
    await win.webContents.executeJavaScript(
      `document.querySelector('[aria-label="Audio timing settings"]').click()`,
    );
    await new Promise((r) => setTimeout(r, 100));
    await win.webContents.executeJavaScript(
      `[...document.querySelectorAll('.settings-tabs button')].find(b=>b.textContent.includes('Export')).click()`,
    );
    await new Promise((r) => setTimeout(r, 60));
    await win.webContents.executeJavaScript(
      `document.querySelector('.export-settings button').click();document.activeElement.blur()`,
    );
    await new Promise((r) => setTimeout(r, 100));
    cancelExport?.();
    await new Promise((r) => setTimeout(r, 150));
    if (
      !(await win.webContents.executeJavaScript(
        `!!document.activeElement.closest('.modal')`,
      ))
    )
      throw new Error(
        "Export settings did not regain keyboard focus: " +
          (await win.webContents.executeJavaScript(
            `JSON.stringify({active:document.activeElement.tagName, waiting:!!document.querySelector(".export-wait"),disabled:document.querySelector(".export-settings button")?.disabled})`,
          )),
      );
    win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
    win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
    await new Promise((r) => setTimeout(r, 100));
    if (
      await win.webContents.executeJavaScript(
        `!!document.querySelector('.modal')`,
      )
    )
      throw new Error("Escape did not close export settings after export");
  } finally {
    dialog.showOpenDialog = originalPicker;
    cancelExport?.();
  }
  console.log(
    "Direct export, delete/undo shortcuts and Ctrl-wheel zoom passed.",
  );
}
module.exports = { verifyExportAndShortcuts };
