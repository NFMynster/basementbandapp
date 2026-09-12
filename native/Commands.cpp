#include "Engine.h"

namespace basement {
var Engine::command(const var &c) {
  const auto op = str(c, "op");
  if (op == "duplicateTrack" || op == "addTrack" || op == "track" || op == "reorderTrack" ||
      op == "removeTrack")
    return handleTrackCommand(c);
  if (op == "preset" || op == "reorderEffect" || op == "scanPlugin" || op == "removePlugin" ||
      op == "plugin" || op == "bypass" || op == "editor")
    return handlePluginCommand(c);
  if (op == "play" || op == "stop" || op == "record" || op == "seek" || op == "loop" ||
      op == "tempo" || op == "metronome" || op == "countIn" || op == "metronomeVolume" ||
      op == "master" || op == "limiter")
    return handleTransportCommand(c);
  if (op == "audition" || op == "createMidi" || op == "import" || op == "editRegions" ||
      op == "removeClip" || op == "editClip" || op == "export")
    return handleRegionCommand(c);
  if (op == "init" || op == "new" || op == "restore" || op == "rename" || op == "snapshot" ||
      op == "state")
    return handleSessionCommand(c);
  if (op == "devices" || op == "configure" || op == "tuner" || op == "clearDiagnostics" ||
      op == "clearWarning")
    return handleDeviceCommand(c);
  if (op == "testLatency" || op == "testMidi" || op == "pump")
    return handleTestCommand(c);
  throw std::runtime_error("Unknown audio command");
}
} // namespace basement
