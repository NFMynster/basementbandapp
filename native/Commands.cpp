#include "Engine.h"

#include <map>

namespace basement {
// Routes each op to the domain file that validates and applies it. This table
// mirrors desktop/commands.cjs; tests/command-contract.test.mjs keeps them equal.
var Engine::command(const var &c) {
  using Handler = var (Engine::*)(const var &);
  static const std::map<juce::String, Handler> routes{
      {"addTrack", &Engine::handleTrackCommand},
      {"duplicateTrack", &Engine::handleTrackCommand},
      {"track", &Engine::handleTrackCommand},
      {"reorderTrack", &Engine::handleTrackCommand},
      {"removeTrack", &Engine::handleTrackCommand},
      {"preset", &Engine::handlePluginCommand},
      {"reorderEffect", &Engine::handlePluginCommand},
      {"removePlugin", &Engine::handlePluginCommand},
      {"bypass", &Engine::handlePluginCommand},
      {"editor", &Engine::handlePluginCommand},
      {"plugin", &Engine::handlePluginCommand},
      {"scanPlugin", &Engine::handlePluginCommand},
      {"play", &Engine::handleTransportCommand},
      {"stop", &Engine::handleTransportCommand},
      {"record", &Engine::handleTransportCommand},
      {"seek", &Engine::handleTransportCommand},
      {"loop", &Engine::handleTransportCommand},
      {"tempo", &Engine::handleTransportCommand},
      {"metronome", &Engine::handleTransportCommand},
      {"countIn", &Engine::handleTransportCommand},
      {"metronomeVolume", &Engine::handleTransportCommand},
      {"metronomeSound", &Engine::handleTransportCommand},
      {"master", &Engine::handleTransportCommand},
      {"limiter", &Engine::handleTransportCommand},
      {"audition", &Engine::handleRegionCommand},
      {"createMidi", &Engine::handleRegionCommand},
      {"editRegions", &Engine::handleRegionCommand},
      {"removeClip", &Engine::handleRegionCommand},
      {"editClip", &Engine::handleRegionCommand},
      {"import", &Engine::handleRegionCommand},
      {"export", &Engine::handleRegionCommand},
      {"state", &Engine::handleSessionCommand},
      {"new", &Engine::handleSessionCommand},
      {"rename", &Engine::handleSessionCommand},
      {"init", &Engine::handleSessionCommand},
      {"restore", &Engine::handleSessionCommand},
      {"snapshot", &Engine::handleSessionCommand},
      {"devices", &Engine::handleDeviceCommand},
      {"configure", &Engine::handleDeviceCommand},
      {"tuner", &Engine::handleDeviceCommand},
      {"clearDiagnostics", &Engine::handleDeviceCommand},
      {"clearWarning", &Engine::handleDeviceCommand},
      {"testLatency", &Engine::handleTestCommand},
      {"testMidi", &Engine::handleTestCommand},
      {"pump", &Engine::handleTestCommand},
  };
  const auto route = routes.find(str(c, "op"));
  if (route == routes.end())
    throw std::runtime_error("Unknown audio command");
  return (this->*route->second)(c);
}
} // namespace basement
