import { MidiExportDialog } from "./components/MidiExportDialog";
import { useEffect, useState, type CSSProperties } from "react";
import { desktop as api } from "./services/desktop";
import { useWorkspace } from "./hooks/useWorkspace";
import { TitleBar } from "./components/TitleBar";
import { Transport } from "./components/Transport";
import { Arrangement } from "./components/Arrangement";
import { TrackInspector } from "./components/TrackInspector";
import { StatusBar } from "./components/StatusBar";
import { Notices } from "./components/Notices";
import { SettingsDialog } from "./components/SettingsDialog";
import { HelpDialog } from "./components/HelpDialog";
import { CreateTrackDialog } from "./components/CreateTrackDialog";
import { SoundBrowser } from "./components/SoundBrowser";
import { Modal } from "./components/Modal";
import { WelcomeDialog } from "./components/WelcomeDialog";
export function App() {
  const controller = useWorkspace();
  const [startupVisible, setStartupVisible] = useState(true);
  const [startupEntered, setStartupEntered] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let first = 0;
    let second = 0;
    // The webview can paint before the window is shown. Start the fade only once
    // the user can see it, with a painted transparent frame first.
    void Promise.resolve(api.waitUntilVisible?.()).then(() => {
      if (cancelled) return;
      first = requestAnimationFrame(() => {
        second = requestAnimationFrame(() => setStartupEntered(true));
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, []);
  // Reveal as soon as the engine is ready; the app is usable during the fade.
  const startupLeaving = startupEntered && !controller.starting;
  useEffect(() => {
    if (!startupLeaving) return;
    // Fallback for reduced motion or a window hidden during the transition.
    const finish = setTimeout(() => setStartupVisible(false), 600);
    return () => clearTimeout(finish);
  }, [startupLeaving]);
  return (
    <>
      <div
        className={`app ${startupVisible ? "startup-pending" : ""} ${startupLeaving ? "startup-revealing" : ""}`}
        inert={startupVisible && !startupLeaving}
        style={
          { "--sidebar-width": `${controller.sidebarWidth}px` } as CSSProperties
        }
      >
        <TitleBar controller={controller} />
        <Transport controller={controller} />
        <Arrangement controller={controller} animateReady={!startupVisible} />
        <TrackInspector controller={controller} />
        <StatusBar controller={controller} />
        <Notices controller={controller} />
        {(startupLeaving || !startupVisible) && (
          <>
            <SettingsDialog controller={controller} />
            <HelpDialog controller={controller} />
            {controller.midiExportTrack && (
              <MidiExportDialog
                key={controller.midiExportTrack}
                controller={controller}
              />
            )}
            {controller.creatingTrack && (
              <CreateTrackDialog controller={controller} />
            )}
            {controller.welcome && <WelcomeDialog controller={controller} />}
            {controller.soundBrowser && (
              <SoundBrowser
                key={`${controller.soundBrowser.track}:${controller.soundBrowser.append}:${controller.soundBrowser.presets}`}
                controller={controller}
              />
            )}
            {controller.pendingTempo !== null && (
              <Modal
                title="Match recordings with new tempo?"
                onClose={() => {
                  if (!controller.busy) controller.setPendingTempo(null);
                }}
              >
                <h2>Match recordings with new tempo?</h2>
                <p>
                  Change to {controller.pendingTempo} BPM. Matching keeps
                  regions on their beats and preserves pitch.
                </p>
                {controller.busy ? (
                  <p role="status">
                    Matching recordings. This may take a moment...
                  </p>
                ) : (
                  <div className="modal-bottom">
                    <button onClick={() => controller.setPendingTempo(null)}>
                      Cancel
                    </button>
                    <button onClick={() => void controller.applyTempo("none")}>
                      Keep timing
                    </button>
                    <button onClick={() => void controller.applyTempo("midi")}>
                      Match MIDI only
                    </button>
                    <button
                      className="primary"
                      onClick={() => void controller.applyTempo("all")}
                    >
                      Match all recordings
                    </button>
                  </div>
                )}
              </Modal>
            )}
            {controller.confirmation && (
              <Modal
                title="Confirm action"
                className="confirmation-dialog"
                onClose={() => controller.finishConfirmation(false)}
              >
                <h2>{controller.confirmation.acceptLabel}</h2>
                <p>{controller.confirmation.message}</p>
                <div className="modal-bottom">
                  <button onClick={() => controller.finishConfirmation(false)}>
                    Cancel
                  </button>
                  <button
                    className="primary"
                    onClick={() => controller.finishConfirmation(true)}
                  >
                    {controller.confirmation.acceptLabel}
                  </button>
                </div>
              </Modal>
            )}
            {!!controller.s.countdown && (
              <div
                className="count-in-overlay"
                role="status"
                aria-live="polite"
              >
                <span>GET READY</span>
                <strong key={controller.s.countdown}>
                  {controller.s.countdown}
                </strong>
                <button onClick={() => controller.run({ op: "stop" })}>
                  Cancel
                </button>
              </div>
            )}
            {controller.exporting && (
              <div
                className="count-in-overlay export-wait"
                role="dialog"
                aria-modal="true"
                aria-label="Exporting tracks"
              >
                <span>EXPORTING TRACKS</span>
                <div
                  className="startup-spinner"
                  role="progressbar"
                  aria-label="Exporting tracks"
                />
                <p>Please wait while your audio is rendered…</p>
              </div>
            )}
          </>
        )}
      </div>
      {startupVisible && (
        <div
          className={`count-in-overlay export-wait startup-overlay ${startupEntered ? "entered" : ""} ${startupLeaving ? "leaving" : ""}`}
          data-startup
          onTransitionEnd={(event) => {
            if (
              startupLeaving &&
              event.target === event.currentTarget &&
              event.propertyName === "opacity"
            )
              setStartupVisible(false);
          }}
          role="status"
          aria-live="polite"
        >
          <div className="startup-content">
            <span>BASEMENT BAND</span>
            {controller.error ? (
              <>
                <p>Could not start the audio engine.</p>
                <pre role="alert">{controller.error}</pre>
                <div>
                  <button onClick={() => void api.restart()}>
                    Restart app
                  </button>
                  <button onClick={() => void api.openLogs()}>Open logs</button>
                </div>
              </>
            ) : (
              <>
                <div className="startup-spinner" aria-hidden="true" />
                <p>Initializing...</p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
