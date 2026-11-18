#pragma once
#include "Json.h"
#include <juce_dsp/juce_dsp.h>

namespace basement {
// Built-in effects are non-destructive, with no lookahead. Only the starter
// amp adds delay: its oversampling filters shift the track by a few samples.
struct TrackSound {
  // Starter amp sounds, chosen through factory presets. -1 means no amp.
  static constexpr const char *ampCharacters[] = {"clean", "crunch", "lead", "bass"};
  bool compressorEnabled = false, reverbEnabled = false, gateEnabled = false, ampBypass = false;
  float compressorAmount = 0.35f, reverbAmount = 0.2f, gateThreshold = -45;
  float compressorAttack = 12, compressorRelease = 140;
  float reverbSize = 0.55f, reverbDamping = 0.55f, reverbWidth = 1;
  int ampCharacter = -1;
  void update(const var &settings);
  void write(var &settings) const;
  void prepare(double rate, int block);
  void reset();
  void processGate(AudioBuffer<float> &buffer, int samples);
  void processAmp(AudioBuffer<float> &buffer, int samples);
  void processSound(AudioBuffer<float> &buffer, int samples);
private:
  void voiceAmp();
  void resetAmp();
  dsp::Compressor<float> compressor;
  dsp::NoiseGate<float> gate;
  Reverb reverb;
  AudioBuffer<float> wet;
  SmoothedValue<float> reverbMix{0.2f};
  double sampleRate = 0;
  float ampBias = 0, ampCeiling = 1;
  // Per channel: input shaping before the clipper, then a filtered speaker
  // cabinet after it. The bass voice splits off a clean low band with
  // a Linkwitz-Riley crossover: two low-passes, then two high-passes.
  IIRFilter ampPre[2][2], ampPost[2][6], ampSplit[2][4];
  std::unique_ptr<dsp::Oversampling<float>> oversampling;
  AudioBuffer<float> ampLow, ampDrives;
  SmoothedValue<float> ampDrive{1};
};

// Stereo-linked sample-peak protection: immediate gain reduction and a smooth
// release. No makeup gain, lookahead, or claim of inter-sample peak protection.
struct OutputProtection {
  void prepare(double rate);
  void reset() { gain = 1; }
  bool process(float *const *channels, int channelCount, int samples, float level, bool enabled);
  // True once since the last call if NaN/inf reached the output and was zeroed.
  bool takeInvalid() { return std::exchange(invalid, false); }
private:
  float gain = 1, release = 0;
  bool invalid = false;
};
} // namespace basement
