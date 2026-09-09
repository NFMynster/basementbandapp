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
  const [startupLeaving, setStartupLeaving] = useState(false);
  useEffect(() => {
    let second = 0;
    // Hidden/minimized windows may not deliver animation frames.
    const fallback = setTimeout(() => setStartupEntered(true), 80);
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setStartupEntered(true));
    });
    return () => {
      clearTimeout(fallback);
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, []);
  useEffect(() => {
    if (controller.starting || !startupEntered) return;
    let finish: ReturnType<typeof setTimeout>;
    const timer = setTimeout(() => {
      setStartupLeaving(true);
      finish = setTimeout(() => setStartupVisible(false), 260);
    }, 260);
    return () => {
      clearTimeout(timer);
      clearTimeout(finish);
    };
  }, [controller.starting, startupEntered]);
  return (
    <>
      <div
        className="app"
        inert={startupVisible}
        style={
          { "--sidebar-width": `${controller.sidebarWidth}px` } as CSSProperties
        }
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => e.preventDefault()}
      >
        <TitleBar controller={controller} />
        <Transport controller={controller} />
        <Arrangement controller={controller} />
        <TrackInspector controller={controller} />
        <StatusBar controller={controller} />
        <Notices controller={controller} />
        {!startupVisible && (
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
                <p>Getting your session ready...</p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
