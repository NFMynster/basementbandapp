#include "Engine.h"
#include <cmath>

namespace basement {
void Engine::audioDeviceAboutToStart(AudioIODevice *d) {
  const ScopedLock l(guard);
  rate = d->getCurrentSampleRate();
  block = d->getCurrentBufferSizeSamples();
  for (auto &t : tracks) {
    t->scratch.setSize(2, jmax(block, 8192));
    if (t->plugin)
      t->plugin->prepareToPlay(rate, block);
  }
}

void Engine::audioDeviceStopped() {}

void Engine::audioDeviceIOCallbackWithContext(const float *const *inputs, int ni,
                                              float *const *outputs, int no, int n,
                                              const AudioIODeviceCallbackContext &) {
  for (int ch = 0; ch < no; ++ch)
    if (outputs[ch])
      FloatVectorOperations::clear(outputs[ch], n);
  const ScopedTryLock l(guard);
  if (!l.isLocked()) {
    if (playing.load())
      diskOverrun = true;
    return;
  }
  bool anySolo = false;
  for (auto &t : tracks)
    anySolo |= t->solo;
  for (auto &t : tracks) {
    t->peak = 0;
    if (t->input < ni && t->input >= 0 && inputs[t->input]) {
      auto range = FloatVectorOperations::findMinAndMax(inputs[t->input], n);
      t->peak = jmax(std::abs(range.getStart()), std::abs(range.getEnd()));
      if (recording && t->writer) {
        const float *p[] = {inputs[t->input]};
        if (!t->writer->write(p, n))
          diskOverrun = true;
      }
    }
    if (!playing || t->mute || (anySolo && !t->solo) || n > t->scratch.getNumSamples())
      continue;
    renderTrack(*t, position, n, looping && !recording);
    t->peak = jmax(t->peak.load(), t->scratch.getMagnitude(0, n) * t->gain);
    const float left = t->gain * (t->pan > 0 ? 1 - t->pan : 1),
                right = t->gain * (t->pan < 0 ? 1 + t->pan : 1);
    for (int ch = 0; ch < jmin(no, 2); ++ch)
      if (outputs[ch])
        FloatVectorOperations::addWithMultiply(outputs[ch], t->scratch.getReadPointer(ch),
                                               ch == 0 ? left : right, n);
  }
  if (playing) {
    position += n / rate;
    if (looping && !recording && position >= loopEnd && loopEnd > loopStart)
      position = loopStart + std::fmod(position - loopStart, loopEnd - loopStart);
  }
  for (int ch = 0; ch < no; ++ch)
    if (outputs[ch])
      for (int i = 0; i < n; ++i)
        outputs[ch][i] = jlimit(-1.0f, 1.0f, outputs[ch][i]);
}
} // namespace basement
