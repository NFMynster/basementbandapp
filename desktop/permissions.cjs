const { systemPreferences } = require("electron");
async function microphoneAccess() {
  if (process.platform !== "darwin" || process.env.BASEMENT_TEST_DEVICE === "1")
    return true;
  const status = systemPreferences.getMediaAccessStatus("microphone");
  console.log("Microphone permission:", status);
  const granted =
    status === "granted" ||
    (status === "not-determined" &&
      (await systemPreferences.askForMediaAccess("microphone")));
  console.log(
    "Microphone permission result:",
    granted ? "granted" : "denied; starting output-only",
  );
  return granted;
}
module.exports = { microphoneAccess };
