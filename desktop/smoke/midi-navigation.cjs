const { required } = require("./required.cjs");
/** @param {import("../types").Window} win @param {import("../types").Request} request */
async function verifyMidiNavigation(win, request) {
  await win.webContents.executeJavaScript(
    `[...document.querySelectorAll('.tab')].find(t=>t.textContent.trim()==='MIDI').click()`,
  );
  await new Promise((r) => setTimeout(r, 80));
  win.showInactive();
  await win.webContents.executeJavaScript(
    `document.querySelector('.arrangement-scroll').scrollLeft=0; document.querySelector('.piano-scroll').scrollLeft=0`,
  );
  await new Promise((r) => setTimeout(r, 120));
  await win.webContents.capturePage();
  const mainPoint = await win.webContents.executeJavaScript(
    `(() => { const r=document.querySelector('.playhead > span').getBoundingClientRect(); return {x:Math.round(r.left+r.width/2+3), y:Math.round(r.top+4)}; })()`,
  );
  const midiBefore = await win.webContents.executeJavaScript(
    `parseFloat(document.querySelector('.midi-playhead').style.left)`,
  );
  win.webContents.sendInputEvent({ type: "mouseMove", ...mainPoint });
  win.webContents.sendInputEvent({
    type: "mouseDown",
    ...mainPoint,
    button: "left",
    clickCount: 1,
  });
  await new Promise((r) => setTimeout(r, 50));
  win.webContents.sendInputEvent({
    type: "mouseMove",
    x: mainPoint.x + 40,
    y: mainPoint.y,
    modifiers: ["leftbuttondown"],
    button: "left",
  });
  await new Promise((r) => setTimeout(r, 50));
  await win.webContents.capturePage();
  if (
    (await win.webContents.executeJavaScript(
      `parseFloat(document.querySelector('.midi-playhead').style.left)`,
    )) <= midiBefore
  )
    throw new Error(
      "Main drag did not preview in MIDI editor: " +
        JSON.stringify(
          await win.webContents.executeJavaScript(
            `({point:${JSON.stringify(mainPoint)}, hit:document.elementFromPoint(${mainPoint.x},${mainPoint.y})?.outerHTML, main:document.querySelector('.playhead').style.cssText})`,
          ),
        ),
    );
  win.webContents.sendInputEvent({
    type: "mouseUp",
    x: mainPoint.x + 40,
    y: mainPoint.y,
    button: "left",
    clickCount: 1,
  });
  await new Promise((r) => setTimeout(r, 80));
  const midiPoint = await win.webContents.executeJavaScript(
    `(() => {const r=document.querySelector('.midi-playhead').getBoundingClientRect(), p=document.querySelector('.piano-scroll').getBoundingClientRect(); return {x:Math.round(r.left),y:Math.round(p.top+40)};})()`,
  );
  const mainBefore = await win.webContents.executeJavaScript(
    `parseFloat(document.querySelector('.playhead').style.left)`,
  );
  win.webContents.sendInputEvent({ type: "mouseMove", ...midiPoint });
  win.webContents.sendInputEvent({
    type: "mouseDown",
    ...midiPoint,
    button: "left",
    clickCount: 1,
  });
  await new Promise((r) => setTimeout(r, 50));
  win.webContents.sendInputEvent({
    type: "mouseMove",
    x: midiPoint.x + 80,
    y: midiPoint.y,
    modifiers: ["leftbuttondown"],
    button: "left",
  });
  await new Promise((r) => setTimeout(r, 50));
  await win.webContents.capturePage();
  if (
    (await win.webContents.executeJavaScript(
      `parseFloat(document.querySelector('.playhead').style.left)`,
    )) <= mainBefore
  )
    throw new Error(
      "MIDI playhead drag did not preview on timeline: " +
        JSON.stringify(
          await win.webContents.executeJavaScript(
            `({before:${mainBefore}, point:${JSON.stringify(midiPoint)}, after:document.querySelector('.playhead').style.left, head:document.querySelector('.midi-playhead').style.cssText, hit:document.elementFromPoint(${midiPoint.x},${midiPoint.y})?.outerHTML.slice(0,200), ruler:document.querySelector('.note-ruler').getAttribute('aria-valuenow')})`,
          ),
        ),
    );
  win.webContents.sendInputEvent({
    type: "mouseUp",
    x: midiPoint.x + 80,
    y: midiPoint.y,
    button: "left",
    clickCount: 1,
  });
  await new Promise((r) => setTimeout(r, 80));
  const editorHeight = await win.webContents.executeJavaScript(
    `document.querySelector('.piano-scroll').clientHeight`,
  );
  await win.webContents.executeJavaScript(
    `document.querySelector('[aria-label="Maximize MIDI editor"]').click()`,
  );
  await new Promise((r) => setTimeout(r, 80));
  if (
    (await win.webContents.executeJavaScript(
      `document.querySelector('.piano-scroll').clientHeight`,
    )) <= editorHeight
  )
    throw new Error("MIDI maximize did not expand piano roll");
  await win.webContents.executeJavaScript(
    `document.querySelector('[aria-label="Restore editor"]').click()`,
  );
  await win.webContents.executeJavaScript(
    `document.querySelector('[aria-label="Play region"]').click()`,
  );
  await new Promise((r) => setTimeout(r, 70));
  if (!(await request({ op: "state" })).playing)
    throw new Error("Play region did not start transport");
  await win.webContents.capturePage();
  const midiHeadBefore = await win.webContents.executeJavaScript(
    `parseFloat(document.querySelector('.midi-playhead').style.left)`,
  );
  await new Promise((r) => setTimeout(r, 25));
  await win.webContents.capturePage();
  if (
    (await win.webContents.executeJavaScript(
      `parseFloat(document.querySelector('.midi-playhead').style.left)`,
    )) <= midiHeadBefore
  )
    throw new Error("MIDI playhead is not moving");
  await win.webContents.executeJavaScript(
    `document.querySelector('[aria-label="Stop playback"]').click()`,
  );
  await new Promise((r) => setTimeout(r, 80));
  await win.webContents.executeJavaScript(
    `document.querySelector('.note-ruler').dispatchEvent(new KeyboardEvent('keydown', {key:'Home',bubbles:true}))`,
  );
  await new Promise((r) => setTimeout(r, 80));
  const midiOrigin = (await request({ op: "state" })).position;
  await win.webContents.executeJavaScript(
    `document.querySelector('.note-ruler').dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowRight',bubbles:true}))`,
  );
  await new Promise((r) => setTimeout(r, 80));
  if ((await request({ op: "state" })).position <= midiOrigin)
    throw new Error("MIDI ruler did not seek");
  const midiWidth = await win.webContents.executeJavaScript(
    `document.querySelector('.piano-grid').getBoundingClientRect().width`,
  );
  if (
    !(await win.webContents.executeJavaScript(
      `document.querySelector('.piano-grid').clientWidth >= document.querySelector('.piano-scroll').clientWidth`,
    ))
  )
    throw new Error("MIDI region does not fill editor width");
  await win.webContents.executeJavaScript(
    `(() => { const e=document.querySelector('.piano-scroll'),r=e.getBoundingClientRect();e.dispatchEvent(new WheelEvent('wheel',{ctrlKey:true,deltaY:-100,clientX:r.left+200,bubbles:true,cancelable:true})); })()`,
  );
  await new Promise((r) => setTimeout(r, 100));
  if (
    (await win.webContents.executeJavaScript(
      `document.querySelector('.piano-grid').getBoundingClientRect().width`,
    )) <= midiWidth
  )
    throw new Error("MIDI pinch/Ctrl-wheel zoom did not work");
  await win.webContents.executeJavaScript(
    `(() => { const slider=document.querySelector('[aria-label="Timeline zoom"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(slider,'60'); slider.dispatchEvent(new Event('input',{bubbles:true})); })()`,
  );
  await new Promise((r) => setTimeout(r, 100));
  await win.webContents.executeJavaScript(
    `document.querySelector('.clip.chosen').scrollIntoView({block:'center',inline:'center'})`,
  );
  await new Promise((r) => setTimeout(r, 80));
  await win.webContents.capturePage();
  const loopRegion = await win.webContents.executeJavaScript(
    `(() => {const r=document.querySelector('.clip.chosen').getBoundingClientRect();return {x:Math.round(r.right-2), y:Math.round(r.top+10), width:r.width,hit:document.elementFromPoint(Math.round(r.right-2),Math.round(r.top+10))?.outerHTML.slice(0,180)};})()`,
  );
  win.webContents.sendInputEvent({
    type: "mouseMove",
    x: loopRegion.x,
    y: loopRegion.y,
  });
  await win.webContents.capturePage();
  win.webContents.sendInputEvent({
    type: "mouseDown",
    x: loopRegion.x,
    y: loopRegion.y,
    button: "left",
    clickCount: 1,
  });
  win.webContents.sendInputEvent({
    type: "mouseMove",
    x: Math.round(loopRegion.x + loopRegion.width * 1.5),
    y: loopRegion.y,
    modifiers: ["leftbuttondown"],
  });
  await new Promise((r) => setTimeout(r, 80));
  win.webContents.sendInputEvent({
    type: "mouseUp",
    x: Math.round(loopRegion.x + loopRegion.width * 1.5),
    y: loopRegion.y,
    button: "left",
    clickCount: 1,
  });
  await new Promise((r) => setTimeout(r, 180));
  const looped = required(
    (await request({ op: "state" })).tracks.at(-1),
    "the last track",
  ).clips;
  if (looped.length < 2)
    throw new Error(
      "Upper right region drag did not create loops: " +
        JSON.stringify(loopRegion),
    );
  for (let i = 1; i < looped.length; i++)
    if (
      Math.abs(looped[i].start - looped[i - 1].start - looped[i - 1].duration) >
      0.001
    )
      throw new Error("Loop copies overlap or leave gaps");
  await win.webContents.executeJavaScript(
    `document.querySelector('.track-header input[type="range"]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`,
  );
  await new Promise((r) => setTimeout(r, 150));
  if ((await request({ op: "state" })).tracks[0].gain !== 1)
    throw new Error("Level reset did not restore unity gain");
  await win.webContents.executeJavaScript(`document.activeElement.blur()`);
  win.webContents.sendInputEvent({
    type: "keyDown",
    keyCode: "N",
    modifiers: ["shift"],
  });
  win.webContents.sendInputEvent({
    type: "keyUp",
    keyCode: "N",
    modifiers: ["shift"],
  });
  await new Promise((r) => setTimeout(r, 100));
  if (
    !(await win.webContents.executeJavaScript(
      `!!document.querySelector('.create-track-dialog')`,
    ))
  )
    throw new Error("Shift+N did not open New track");
  win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
  win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
  await new Promise((r) => setTimeout(r, 60));
  win.webContents.sendInputEvent({
    type: "keyDown",
    keyCode: "N",
    modifiers: ["control"],
  });
  win.webContents.sendInputEvent({
    type: "keyUp",
    keyCode: "N",
    modifiers: ["control"],
  });
  await new Promise((r) => setTimeout(r, 100));
  if (
    !(await win.webContents.executeJavaScript(
      `!!document.querySelector('.confirmation-dialog')`,
    ))
  )
    throw new Error("Ctrl+N did not request New project");
  console.log(
    "Export focus, MIDI gesture zoom, fill width, level reset and creation shortcuts passed.",
  );
}
module.exports = { verifyMidiNavigation };
