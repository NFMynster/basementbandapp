import { useWorkspace } from "./hooks/useWorkspace";
import { TitleBar } from "./components/TitleBar";
import { Transport } from "./components/Transport";
import { Arrangement } from "./components/Arrangement";
import { TrackInspector } from "./components/TrackInspector";
import { StatusBar } from "./components/StatusBar";
import { Notices } from "./components/Notices";
import { AudioSetupDialog } from "./components/AudioSetupDialog";
import { HelpDialog } from "./components/HelpDialog";
export function App() {
  const controller = useWorkspace();
  return (
    <div className="app">
      <TitleBar controller={controller} />
      <Transport controller={controller} />
      <Arrangement controller={controller} />
      <TrackInspector controller={controller} />
      <StatusBar controller={controller} />
      <Notices controller={controller} />
      <AudioSetupDialog controller={controller} />
      <HelpDialog controller={controller} />
    </div>
  );
}
