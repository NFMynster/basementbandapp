#include "Engine.h"

namespace basement {
void Engine::sendPanic(Track &t) {
  t.panic = true;
  t.previousMidiTime = -1;
  t.liveMidi.clear();
  if (t.plugin)
    t.plugin->reset();
}

void Engine::prepareTrack(Track &t, double start, bool cycle) {
  sendPanic(t);
  t.latency = t.plugin && !t.bypass ? jmax(0, t.plugin->getLatencySamples()) : 0;
  require(t.latency <= rate * 10, "Plug-in latency exceeds the supported ten-second limit");
  // Recorded regions are available ahead of time. Prime the processor, then
  // read its source L samples ahead so output sample zero remains timeline zero.
  for (int offset = 0; offset < t.latency;) {
    const int n = jmin(jmin(block, 8192), t.latency - offset);
    renderTrack(t, start + offset / rate, n, cycle);
    offset += n;
  }
}

void Engine::preparePlayback(double start, bool cycle) {
  for (auto &t : tracks)
    prepareTrack(*t, start, cycle);
}
} // namespace basement
