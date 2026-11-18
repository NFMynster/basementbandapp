#include "Engine.h"
#include <cmath>

namespace basement {
var Engine::handleTransportCommand(const var &c) {
  const auto op = str(c, "op");
  if (op == "limiter") {
    require(c["value"].isBool(), "Invalid output protection switch");
    { const ScopedLock lock(guard); limiterEnabled = flag(c, "value"); outputProtection.reset(); outputClipped = false; }
    return state();
  }
  if (op == "master") {
    const ScopedLock lock(guard);
    masterGain = (float)jlimit(0.0, 2.0, number(c, "value", 1));
    return state();
  }
  if (op == "metronomeVolume") {
    const double gain = number(c, "value", 1);
    require(std::isfinite(gain) && gain >= 0 && gain <= 4, "Invalid metronome volume");
    const ScopedLock lock(guard);
    metronomeGain = (float)gain;
    return state();
  }
  if (op == "metronomeSound") {
    const int sound = metronomeSoundIndex(c["value"]);
    require(sound >= 0, "Invalid metronome sound");
    const ScopedLock lock(guard);
    metronomeSound = sound;
    return state();
  }
  if (op == "metronome" || op == "countIn") {
    const ScopedLock lock(guard);
    if (op == "metronome")
      metronome = flag(c, "value");
    else
      countIn = flag(c, "value");
    return state();
  }
  if (op == "stop") {
    stop();
  } else if (op == "play") {
    require(tunerTrack.isEmpty(), "Close the tuner before playback");
    require(testDevice || devices.getCurrentAudioDevice() != nullptr,
            "Choose an audio device first");
    const ScopedLock l(guard);
    if (looping) position = loopStart;
    preparePlayback(position, looping);
    playing = true;
  } else if (op == "record") {
    require(tunerTrack.isEmpty(), "Close the tuner before recording");
    beginRecording();
  } else if (op == "seek") {
    require(!recording, "Cannot move the playhead while recording");
    // Seeking deliberately restarts playback. Do not classify the silence while
    // resetting/priming processors as a lost recording block.
    const bool resume = playing.exchange(false);
    const ScopedLock l(guard);
    position = jmax(0.0, number(c, "position"));
    preparePlayback(position, looping);
    playing = resume;
  } else if (op == "loop") {
    require(!recording, "Stop recording before changing the loop");
    const ScopedLock l(guard);
    loopStart = jmax(0.0, number(c, "start"));
    loopEnd = jmax(loopStart + 0.05, number(c, "end", 8));
    looping = flag(c, "enabled");
    // Rendering already wraps and chases MIDI at cycle boundaries. Keep processor tails alive.
  } else if (op == "tempo") {
    changeTempo(c);
  } else throw std::runtime_error("Unknown transport command");
  syncAudioInput();
  return state();
}
} // namespace basement
