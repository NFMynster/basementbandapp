#pragma once
#include "Model.h"
#include "PluginWindow.h"

namespace basement {
class Engine final : public AudioIODeviceCallback {
  AudioDeviceManager devices;
  AudioFormatManager formats;
  AudioPluginFormatManager plugins;
  TimeSliceThread disk{"Recording writer"};
  CriticalSection guard;
  std::vector<std::unique_ptr<Track>> tracks;
  std::unique_ptr<PluginWindow> editor;
  String folder, title = "Friday night", deviceError;
  double rate = 48000, loopStart = 0, loopEnd = 8, tempo = 120;
  std::atomic<double> position{0};
  int block = 512;
  std::atomic<bool> playing{false}, recording{false};
  bool looping = false;
  std::atomic<bool> diskOverrun{false};
  bool testDevice = false;
  MidiBuffer midi;

  Track &track(const var &command);
  std::unique_ptr<Clip> readClip(String path, String name, double start);
  void add(String name, String color, int input);
  void stop();
  void loadPlugin(Track &track, const String &path, const String &state = {});

public:
  explicit Engine(bool testing = false);
  ~Engine() override;
  void audioDeviceAboutToStart(AudioIODevice *device) override;
  void audioDeviceStopped() override;
  void audioDeviceIOCallbackWithContext(const float *const *inputs, int inputChannels,
                                        float *const *outputs, int outputChannels, int samples,
                                        const AudioIODeviceCallbackContext &context) override;
  var state(bool full = false);
  var command(const var &command);

private:
  var listDevices();
  var configureDevice(const var &command);
  void resetSession(const var &command);
  void restoreSession(const var &command);
  void beginRecording();
  void updateTrack(const var &command);
};
} // namespace basement
