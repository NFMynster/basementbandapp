// Private integration fixture, never bundled as an end-user instrument.
#include <juce_audio_utils/juce_audio_utils.h>
class TestInstrument final : public juce::AudioProcessor {
  bool notes[16][128]{};
  double hostBpm = -1, hostPpq = -1;
  bool hostPlaying = false, hostLooping = false;

public:
  TestInstrument()
      : AudioProcessor(
            BusesProperties().withOutput("Output", juce::AudioChannelSet::stereo(), true)) {}
  const juce::String getName() const override { return "Basement Test Instrument"; }
  void prepareToPlay(double, int) override { reset(); }
  void releaseResources() override {}
  void reset() override { std::memset(notes, 0, sizeof(notes)); }
  bool isBusesLayoutSupported(const BusesLayout &l) const override {
    return l.getMainInputChannelSet().isDisabled() &&
           l.getMainOutputChannelSet() == juce::AudioChannelSet::stereo();
  }
  void processBlock(juce::AudioBuffer<float> &b, juce::MidiBuffer &midi) override {
    if (auto *head = getPlayHead()) if (auto position = head->getPosition()) {
      hostBpm = position->getBpm().orFallback(-1);
      hostPpq = position->getPpqPosition().orFallback(-1);
      hostPlaying = position->getIsPlaying(); hostLooping = position->getIsLooping();
    }
    b.clear();
    for (int i = 0; i < b.getNumSamples(); ++i) {
      for (const auto event : midi)
        if (event.samplePosition == i) {
          const auto m = event.getMessage();
          const int ch = m.getChannel() - 1;
          if (ch < 0)
            continue;
          if (m.isAllNotesOff() || m.isAllSoundOff())
            std::memset(notes[ch], 0, sizeof(notes[ch]));
          if (m.isNoteOn())
            notes[ch][m.getNoteNumber()] = true;
          if (m.isNoteOff())
            notes[ch][m.getNoteNumber()] = false;
        }
      int count = 0;
      for (auto &channel : notes)
        for (bool note : channel)
          count += note ? 1 : 0;
      for (int ch = 0; ch < b.getNumChannels(); ++ch)
        b.setSample(ch, i, notes[0][127] ? (float)(ch == 0 ? (hostPlaying ? hostBpm / 1000 : -0.5) : (hostLooping ? hostPpq / 100 : -0.5)) : juce::jmin(0.9f, count * 0.25f));
    }
  }
  bool acceptsMidi() const override { return true; }
  bool producesMidi() const override { return false; }
  double getTailLengthSeconds() const override { return 0; }
  int getNumPrograms() override { return 1; }
  int getCurrentProgram() override { return 0; }
  void setCurrentProgram(int) override {}
  const juce::String getProgramName(int) override { return {}; }
  void changeProgramName(int, const juce::String &) override {}
  bool hasEditor() const override { return false; }
  juce::AudioProcessorEditor *createEditor() override { return nullptr; }
  void getStateInformation(juce::MemoryBlock &data) override {
    const int version = 1;
    data.replaceAll(&version, sizeof(version));
  }
  void setStateInformation(const void *, int) override {}
};
juce::AudioProcessor *JUCE_CALLTYPE createPluginFilter() { return new TestInstrument(); }
