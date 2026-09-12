async function verifySoundControls(win, request) {
  await win.webContents.executeJavaScript(
    `document.querySelector('.confirmation-dialog .modal-close')?.click(); [...document.querySelectorAll('.tab')].find(b=>b.textContent.trim()==='EQ & Effects').click()`,
  );
  await new Promise((r) => setTimeout(r, 100));
  await win.webContents.executeJavaScript(
    `document.querySelector('[aria-label="Enable compressor"]').click()`,
  );
  await new Promise((r) => setTimeout(r, 120));
  await win.webContents.executeJavaScript(
    `document.querySelector('[aria-label="Enable reverb"]').click()`,
  );
  await new Promise((r) => setTimeout(r, 120));
  const soundState = await request({ op: "state" });
  if (!soundState.tracks.some((t) => t.compressorEnabled && t.reverbEnabled))
    throw new Error("Built-in effect switches did not reach engine");
  await win.webContents.executeJavaScript(
    `document.querySelector('[aria-label="Audio status"]').click()`,
  );
  await new Promise((r) => setTimeout(r, 100));
  if (
    !(await win.webContents.executeJavaScript(
      `document.querySelector('.audio-diagnostics').textContent.includes('Estimated monitoring delay')`,
    ))
  )
    throw new Error("Diagnostics missing");
  if (
    await win.webContents.executeJavaScript(
      `!!document.querySelector('.audio-diagnostics input[type="checkbox"]')`,
    )
  )
    throw new Error("Diagnostics should not contain export settings");
  console.log(
    "Built-in effects and audio diagnostics verified through UI-to-engine commands.",
  );
}
module.exports = { verifySoundControls };
