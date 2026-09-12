#pragma once
#include "Json.h"
#include <juce_dsp/juce_dsp.h>

namespace basement {
// Built-in effects are non-destructive, with no lookahead or added latency.
struct TrackSound {
  bool compressorEnabled = false, reverbEnabled = false, gateEnabled = false;
  float compressorAmount = 0.35f, reverbAmount = 0.2f, gateThreshold = -45;
  float compressorAttack = 12, compressorRelease = 140;
  float reverbSize = 0.55f, reverbDamping = 0.55f, reverbWidth = 1;
  void update(const var &settings);
  void write(var &settings) const;
  void prepare(double rate, int block);
  void reset();
  void processGate(AudioBuffer<float> &buffer, int samples);
  void processSound(AudioBuffer<float> &buffer, int samples);
private:
  dsp::Compressor<float> compressor;
  dsp::NoiseGate<float> gate;
  Reverb reverb;
  AudioBuffer<float> wet;
  SmoothedValue<float> reverbMix{0.2f};
};

// Stereo-linked sample-peak protection: immediate gain reduction and a smooth
// release. No makeup gain, lookahead, or claim of inter-sample peak protection.
struct OutputProtection {
  void prepare(double rate);
  void reset() { gain = 1; }
  bool process(float *const *channels, int channelCount, int samples, float level, bool enabled);
private:
  float gain = 1, release = 0;
};
} // namespace basement
