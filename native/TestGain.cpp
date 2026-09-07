// Test-only plugin: proves native VST3 loading, processing, bypass and saved
// state. This is not bundled with the app and is not an end-user effect.
#include <juce_audio_utils/juce_audio_utils.h>
class TestGain final : public juce::AudioProcessor {
  juce::AudioParameterFloat *gain;
  float delay[2][480]{};
  int cursor = 0;

public:
  TestGain()
      : AudioProcessor(BusesProperties()
                           .withInput("Input", juce::AudioChannelSet::stereo(), true)
                           .withOutput("Output", juce::AudioChannelSet::stereo(), true)) {
    addParameter(gain = new juce::AudioParameterFloat(juce::ParameterID("gain", 1), "Gain", 0.0f,
                                                      1.0f, 0.5f));
#if BASEMENT_TEST_DELAY
    setLatencySamples(480);
#endif
  }
  const juce::String getName() const override { return "Basement Test Gain"; }
  void prepareToPlay(double, int) override { reset(); }
  void reset() override {
    std::memset(delay, 0, sizeof(delay));
    cursor = 0;
  }
  void releaseResources() override {}
  bool isBusesLayoutSupported(const BusesLayout &l) const override {
    return l.getMainInputChannelSet() == juce::AudioChannelSet::stereo() &&
           l.getMainOutputChannelSet() == juce::AudioChannelSet::stereo();
  }
  void processBlock(juce::AudioBuffer<float> &b, juce::MidiBuffer &) override {
#if BASEMENT_TEST_DELAY
    for (int i = 0; i < b.getNumSamples(); ++i) {
      for (int ch = 0; ch < 2; ++ch) {
        const float input = b.getSample(ch, i);
        b.setSample(ch, i, delay[ch][cursor]);
        delay[ch][cursor] = input;
      }
      cursor = (cursor + 1) % 480;
    }
#endif
    b.applyGain(gain->get());
  }
  bool acceptsMidi() const override { return false; }
  bool producesMidi() const override { return false; }
  double getTailLengthSeconds() const override { return 0; }
  int getNumPrograms() override { return 1; }
  int getCurrentProgram() override { return 0; }
  void setCurrentProgram(int) override {}
  const juce::String getProgramName(int) override { return {}; }
  void changeProgramName(int, const juce::String &) override {}
  bool hasEditor() const override { return true; }
  juce::AudioProcessorEditor *createEditor() override {
    return new juce::GenericAudioProcessorEditor(*this);
  }
  void getStateInformation(juce::MemoryBlock &data) override {
    float v = gain->get();
    data.replaceAll(&v, sizeof(v));
  }
  void setStateInformation(const void *data, int size) override {
    if (size == sizeof(float)) {
      float v;
      std::memcpy(&v, data, sizeof(v));
      *gain = v;
    }
  }
};
juce::AudioProcessor *JUCE_CALLTYPE createPluginFilter() { return new TestGain(); }
