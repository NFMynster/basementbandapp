#include "Engine.h"
#include <cmath>

namespace basement {
// Shared sample interpolation and plug-in processing for playback and export.
void Engine::renderTrack(Track &t, double start, int n, bool cycle) {
  t.scratch.clear();
  for (int i = 0; i < n; ++i) {
    double time = start + i / rate;
    if (cycle && loopEnd > loopStart && time >= loopEnd)
      time = loopStart + std::fmod(time - loopStart, loopEnd - loopStart);
    for (auto &c : t.clips) {
      double sample = (time - c->start) * c->sampleRate;
      if (sample < 0 || sample >= c->audio.getNumSamples())
        continue;
      int a = (int)sample, b = jmin(a + 1, c->audio.getNumSamples() - 1);
      float f = (float)(sample - a);
      for (int ch = 0; ch < 2; ++ch) {
        int source = jmin(ch, c->audio.getNumChannels() - 1);
        float v = c->audio.getSample(source, a) * (1 - f) + c->audio.getSample(source, b) * f;
        t.scratch.addSample(ch, i, v);
      }
    }
  }
  if (t.plugin && !t.bypass) {
    midi.clear();
    AudioBuffer<float> view(t.scratch.getArrayOfWritePointers(), 2, n);
    t.plugin->processBlock(view, midi);
  }
}
} // namespace basement
