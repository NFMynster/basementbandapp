/** @param {import("../types").Window} win @param {import("../types").Request} request */
async function verifyMidiRouting(win, request) {
  await win.webContents.executeJavaScript(
    `document.querySelector('[title="Add track"]').click()`,
  );
  await new Promise((r) => setTimeout(r, 100));
  await win.webContents.executeJavaScript(
    `document.querySelectorAll('.track-types button')[1].click()`,
  );
  await new Promise((r) => setTimeout(r, 100));
  await win.webContents.executeJavaScript(
    `document.querySelector('.create-track-dialog .primary').click()`,
  );
  await new Promise((r) => setTimeout(r, 250));
  if ((await request({ op: "state" })).tracks.at(-1)?.kind !== "midi")
    throw new Error("UI did not create a MIDI track");
  if (
    !(await win.webContents.executeJavaScript(
      `document.querySelector('.plugin-slot').textContent.includes('Add VST3 instrument')`,
    ))
  )
    throw new Error("New MIDI track did not show instrument setup");
  await win.webContents.executeJavaScript(
    `document.querySelector('[title="Input settings"]').click()`,
  );
  await new Promise((r) => setTimeout(r, 200));
  if (
    !(await win.webContents.executeJavaScript(
      `!!document.querySelector('[aria-label="MIDI 3 MIDI device"]')`,
    ))
  )
    throw new Error("MIDI device routing was not exposed");
  console.log(
    "MIDI desktop check passed: add track, instrument setup and device routing.",
  );
}

/** @param {import("../types").Window} win @param {import("../types").Request} request */
async function verifyProjectCreation(win, request) {
  await win.webContents.executeJavaScript(
    `window.confirm = () => { throw new Error('Blocking browser confirmation used'); }; document.querySelector('[title="New session"]').click()`,
  );
  await new Promise((r) => setTimeout(r, 100));
  if (
    !(await win.webContents.executeJavaScript(
      `!!document.querySelector('.confirmation-dialog')`,
    ))
  )
    throw new Error("Unsaved changes need an in-app confirmation");
  await win.webContents.executeJavaScript(
    `document.querySelector('.confirmation-dialog .primary').click()`,
  );
  await new Promise((r) => setTimeout(r, 200));
  if ((await request({ op: "state" })).tracks.length !== 2)
    throw new Error("New session failed");
  if (
    !(await win.webContents.executeJavaScript(`(() => {
        if(document.querySelector('.modal-backdrop,.menu-shield')) return false;
        if([...document.querySelectorAll('.inspector .tab')].some(t => t.textContent.includes('Export'))) return false;
        return ['Session name','Track name'].every(label => getComputedStyle(document.querySelector('[aria-label="'+label+'"]')).backgroundImage === 'none');
      })()`))
  )
    throw new Error(
      "Stale overlay, Export tab or incorrect name-field styling",
    );
  await win.webContents.executeJavaScript(
    `document.activeElement?.blur(); window.previousNotice = document.querySelector('.toast.notice');`,
  );
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
  await new Promise((r) => setTimeout(r, 120));
  if (
    !(await win.webContents.executeJavaScript(
      `document.querySelector('.toast.notice') === window.previousNotice`,
    ))
  )
    throw new Error("Empty undo created a notice");
  await win.webContents.executeJavaScript(
    `[...document.querySelectorAll('.tab')].find(t => t.textContent.includes('Plug-ins')).click()`,
  );
  await new Promise((r) => setTimeout(r, 60));
  if (
    (await win.webContents.executeJavaScript(
      `[...document.querySelectorAll('.plugin-chain button')].filter(b => b.textContent.includes('Add VST3')).length`,
    )) !== 1
  )
    throw new Error("Empty track has duplicate add-plugin controls");
  const verifyDropdown = async () => {
    await win.webContents.executeJavaScript(
      `[...document.querySelectorAll('.tab')].find(t => t.textContent.trim()==='EQ & Effects').click()`,
    );
    await new Promise((r) => setTimeout(r, 80));
    const bounds = await win.webContents.executeJavaScript(
      `(() => { const e=document.querySelector('[aria-label="Equalizer preset"]'); const r=e.getBoundingClientRect(); return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}; })()`,
    );
    win.webContents.sendInputEvent({
      type: "mouseDown",
      ...bounds,
      button: "left",
      clickCount: 1,
    });
    win.webContents.sendInputEvent({
      type: "mouseUp",
      ...bounds,
      button: "left",
      clickCount: 1,
    });
    await new Promise((r) => setTimeout(r, 100));
    win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Down" });
    win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Down" });
    win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Return" });
    win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Return" });
    await new Promise((r) => setTimeout(r, 200));
    if (
      !(await win.webContents.executeJavaScript(
        `document.querySelector('[aria-label="Equalizer preset"]').value === 'Warm'`,
      ))
    )
      throw new Error("Dropdown failed after creating a session/track");
  };
  await verifyDropdown();
  await win.webContents.executeJavaScript(
    `document.querySelector('[title="Add track"]').click()`,
  );
  await new Promise((r) => setTimeout(r, 100));
  await win.webContents.executeJavaScript(
    `document.querySelectorAll('.track-types button')[1].click()`,
  );
  await new Promise((r) => setTimeout(r, 80));
  await win.webContents.executeJavaScript(
    `document.querySelector('.create-track-dialog .primary').click()`,
  );
  await new Promise((r) => setTimeout(r, 250));
  if ((await request({ op: "state" })).tracks.at(-1)?.kind !== "midi")
    throw new Error("MIDI creation failed");
  await verifyDropdown();
  console.log(
    "Dropdowns work after New and MIDI creation; name fields and properties tabs verified.",
  );
}
module.exports = { verifyMidiRouting, verifyProjectCreation };
