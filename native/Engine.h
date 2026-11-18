#pragma once
#include "Model.h"
#include "PluginWindow.h"
#include <map>

namespace basement {
inline constexpr const char *metronomeSounds[] = {"beep", "woodblock", "stick"};
/** Index of a metronome sound name, or -1 when the value is not a known sound. */
inline int metronomeSoundIndex(const var &value) {
  if (!value.isString()) return -1;
  for (int i = 0; i < (int)std::size(metronomeSounds); ++i)
    if (value.toString() == metronomeSounds[i]) return i;
  return -1;
}
class Engine final : public AudioIODeviceCallback, public MidiInputCallback, private Timer {
  AudioDeviceManager devices;
  AudioFormatManager formats;
  AudioPluginFormatManager plugins;
  TimeSliceThread disk{"Recording writer"};
  CriticalSection guard;
  std::vector<std::unique_ptr<Track>> tracks;
  std::map<String, std::shared_ptr<Clip>> mediaCache;
  std::unique_ptr<PluginWindow> editor;
  String folder, title = "Friday night", deviceError;
  double rate = 48000, loopStart = 0, loopEnd = 8, tempo = 120;
  std::atomic<double> position{0};
  int block = 256;
  std::atomic<bool> playing{false}, recording{false};
  bool looping = false;
  std::atomic<bool> exporting{false}, monitoringActive{false};
  float masterGain = 1.0f;
  float metronomeGain = 1.0f;
  // Index into metronomeSounds; the click noise state only feeds the stick sound.
  int metronomeSound = 0;
  uint32 clickNoise = 0x9e3779b9u;
  float clickNoiseLast = 0;
  std::atomic<float> masterPeak{0};
  bool limiterEnabled = true;
  OutputProtection outputProtection;
  std::atomic<bool> outputClipped{false};
  std::atomic<int> processingDropouts{0}, recordingDropouts{0};
  std::atomic<int> deviceXRunBaseline{0};
  // Device health. The callback only bumps counters and flags; the message
  // thread timer logs them and reopens a device that stopped calling back.
  std::atomic<uint32> callbackCount{0};
  uint32 lastCallbackCount = 0;
  int stalledTicks = 0;
  bool stallRecoveryTried = false;
  int invalidReports = 0;
  std::atomic<bool> outputInvalid{false};
  CriticalSection deviceErrorLock;
  String pendingDeviceError;
  void timerCallback() override;
  void describeDevice(const char *event);
  bool silenceInvalidAudio(Track &track, int samples, int stage);
  bool metronome = false, countIn = false, cycleRecording = false;
  bool countInMidiPrepared = false;
  int64 countRemaining = 0, countTotal = 0;
  double recordingLoopStart = 0, recordingLoopEnd = 8;
  std::atomic<bool> diskOverrun{false};
  bool testDevice = false;
  MidiBuffer midi;
  int inputLatency = 0, outputLatency = 0;
  String tunerTrack;
  std::array<float, 2048> tunerSamples{};
  int tunerWrite = 0, tunerCount = 0, tunerPhase = 0;
  String configuredInput;
  StringArray inputChannelNames;
  bool audioInputActive = false;
  bool needsAudioInput() const;
  bool inputSharesDriver() const;
  void syncAudioInput();

  Track &track(const var &command);
  std::unique_ptr<Clip> readClip(String path, String name, double start);
  void add(String name, String color, int input);
  void stop();
  void loadPlugin(Track &track, const String &path, const String &state = {}, bool effect = false, int uid = 0);

public:
  void initializeAudio(bool inputAllowed = true);
  explicit Engine(bool testing = false);
  ~Engine() override;
  void handleIncomingMidiMessage(MidiInput *source, const MidiMessage &message) override;
  void audioDeviceAboutToStart(AudioIODevice *device) override;
  void audioDeviceStopped() override;
  void audioDeviceError(const String &message) override;
  void audioDeviceIOCallbackWithContext(const float *const *inputs, int inputChannels,
                                        float *const *outputs, int outputChannels, int samples,
                                        const AudioIODeviceCallbackContext &context) override;
  var state(bool full = false, bool pluginState = true);
  var command(const var &command);

private:
  // Message-thread command handlers; mutations lock shared callback state.
  var handleTrackCommand(const var &command);
  var handlePluginCommand(const var &command);
  var handleTransportCommand(const var &command);
  var handleRegionCommand(const var &command);
  var handleSessionCommand(const var &command);
  var handleDeviceCommand(const var &command);
  var handleTestCommand(const var &command);
  var listDevices();
  var configureDevice(const var &command);
  void resetSession(const var &command);
  void restoreSession(const var &command);
  void beginRecording();
  void updateTrack(const var &command);
  void renderTrack(Track &track, double start, int samples, bool cycle,
                   const float *liveInput = nullptr);
  var exportAudio(const var &command);
  void exportMidiTrack(const Track &track, const File &file, double duration);
  std::unique_ptr<Clip> readMidiClip(String path, String name, double start);
  void finishMidiTake(Track &track);
  void persistMidi(Clip &clip, std::shared_ptr<MidiMessageSequence> sequence);
  void preparePlayback(double start, bool cycle);
  void prepareTrack(Track &track, double start, bool cycle);
  void sendPanic(Track &track);
  void splitRecordedTakes(Track &track, size_t first);
  void editClip(const var &command);
  void changeTempo(const var &command);
  void click(float *const *outputs, int channels, int samples, double time);
};
} // namespace basement
