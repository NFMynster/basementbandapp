async function verifyMidiEditing(win, request) {
  await win.webContents.executeJavaScript(
    `[...document.querySelectorAll('.tab')].find(t=>t.textContent.trim()==='MIDI').click()`,
  );
  await new Promise((r) => setTimeout(r, 60));
  await win.webContents.executeJavaScript(
    `document.querySelector('.new-midi-region').click()`,
  );
  await new Promise((r) => setTimeout(r, 180));
  for (let i = 0; i < 2; i++) {
    await win.webContents.executeJavaScript(
      `(() => {const grid=document.querySelector('.piano-grid'), rect=grid.getBoundingClientRect();grid.dispatchEvent(new MouseEvent('dblclick',{bubbles:true,clientX:rect.left+100+${i}*80,clientY:rect.top+24+(84-60+${i})*20+10}));})()`,
    );
    await new Promise((r) => setTimeout(r, 120));
  }
  if (
    (await request({ op: "state" })).tracks.at(-1).clips.at(-1).notes.length !==
    2
  )
    throw new Error("Drawing MIDI notes failed");
  await win.webContents.executeJavaScript(
    `document.querySelector('.piano-grid').focus()`,
  );
  for (const key of ["A", "C", "V"]) {
    win.webContents.sendInputEvent({
      type: "keyDown",
      keyCode: key,
      modifiers: ["control"],
    });
    win.webContents.sendInputEvent({
      type: "keyUp",
      keyCode: key,
      modifiers: ["control"],
    });
    await new Promise((r) => setTimeout(r, 100));
  }
  if (
    (await request({ op: "state" })).tracks.at(-1).clips.at(-1).notes.length !==
    4
  )
    throw new Error("Multiple-note copy/paste failed");
  await win.webContents.executeJavaScript(
    `document.querySelector('[aria-label="Delete notes"]').click()`,
  );
  await new Promise((r) => setTimeout(r, 120));
  if (
    (await request({ op: "state" })).tracks.at(-1).clips.at(-1).notes.length !==
    2
  )
    throw new Error("Selected-note delete failed");
  await win.webContents.executeJavaScript(
    `[...document.querySelectorAll('.tab')].find(t=>t.textContent.includes('Plug-ins')).click()`,
  );
  await new Promise((r) => setTimeout(r, 60));
  await win.webContents.executeJavaScript(
    `[...document.querySelectorAll('.plugin-chain button')].find(b=>b.textContent.includes('Add VST3')).click()`,
  );
  await new Promise((r) => setTimeout(r, 150));
  if (
    !(await win.webContents.executeJavaScript(
      `!!document.querySelector('[aria-label="Search plug-ins"]')`,
    ))
  )
    throw new Error("Plug-in browser did not open");
  await win.webContents.executeJavaScript(
    `document.querySelector('.sound-browser .modal-close').click()`,
  );
  console.log(
    "MIDI draw, multiple selection, copy/paste, delete and plug-in browser passed.",
  );
}
module.exports = { verifyMidiEditing };
