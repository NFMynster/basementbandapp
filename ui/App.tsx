import type { CSSProperties } from "react";
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
  if (controller.starting) {
    return (
      <main className="startup" data-startup role="status" aria-live="polite">
        <div className="startup-mark" aria-hidden="true">
          <img
            src={new URL("../desktop/assets/icon.svg", import.meta.url).href}
            width="72"
            height="72"
            alt=""
          />
        </div>
        <h1>Basement Band</h1>
        {controller.error ? (
          <>
            <p>We couldn’t connect to your recording room.</p>
            <pre role="alert">{controller.error}</pre>
            <button onClick={() => void api.restart()}>Restart app</button>
            <button onClick={() => void api.openLogs()}>Open logs</button>
          </>
        ) : (
          <>
              <p>Initializing audio engine…</p>
            <span className="startup-spinner" aria-hidden="true" />
          </>
        )}
      </main>
    );
  }
  return (
    <div
      className="app"
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
      <SettingsDialog controller={controller} />
      <HelpDialog controller={controller} />
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
        <div className="count-in-overlay" role="status" aria-live="polite">
          <span>GET READY</span>
          <strong key={controller.s.countdown}>{controller.s.countdown}</strong>
          <button onClick={() => controller.run({ op: "stop" })}>Cancel</button>
        </div>
      )}
      {controller.exporting && (
        <div
          className="count-in-overlay export-wait"
          role="dialog"
          aria-modal="true"
          aria-label="Exporting audio"
        >
          <span>EXPORTING AUDIO</span>
          <div
            className="startup-spinner"
            role="progressbar"
            aria-label="Rendering audio"
          />
          <p>Please wait while your audio is rendered…</p>
        </div>
      )}
    </div>
  );
}
