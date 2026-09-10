#pragma once
#include "Json.h"
#include "SoundProcessing.h"
#include <array>
#include <atomic>
#include <vector>

namespace basement {
struct Clip {
  bool isMidi = false;
  double midiLength = 0;
  std::shared_ptr<MidiMessageSequence> events = std::make_shared<MidiMessageSequence>();
  int eventCursor = 0;
  double eventPosition = -1;
  String id = Uuid().toString(), name, path;
  float gain = 1;
  double fadeIn = 0, fadeOut = 0;
  double start = 0, sampleRate = 48000, offset = 0, length = -1;
  double sourceStart = 0, sourceEnd = -1;
  double trimEnd() const { return sourceEnd < 0 ? sourceDuration() : sourceEnd; }
  String takeGroup;
  int take = 0;
  bool active = true;
  std::shared_ptr<AudioBuffer<float>> audio = std::make_shared<AudioBuffer<float>>();
  Array<var> peaks;
  mutable String cachedKey;
  mutable var cachedJson;
  double sourceDuration() const {
    return isMidi ? midiLength : audio->getNumSamples() / sampleRate;
  }
  double duration() const { return length >= 0 ? length : sourceDuration() - offset; }
  var json(bool full) const {
    const auto key = id + name + path + takeGroup + String(take) + String(start, 15) +
                     String(offset, 15) + String(length, 15) + String((int)active) +
                     String((int)full) + String(gain, 8) + String(fadeIn, 12) + String(fadeOut, 12);
    if (key == cachedKey && !cachedJson.isVoid())
      return cachedJson;
    Array<var> preview;
    if (active && !isMidi && !peaks.isEmpty())
      for (int i = 0; i < 400; ++i) {
        const int index =
            jlimit(0, peaks.size() - 1,
                   (int)((offset + i * duration() / 400) / sourceDuration() * peaks.size()));
        preview.add(peaks[index]);
      }
    auto v = object({{"id", id},
                     {"name", name},
                     {"start", start},
                     {"duration", duration()},
                     {"peaks", preview}, {"gain", gain}, {"fadeIn", fadeIn}, {"fadeOut", fadeOut},
                     {"offset", offset},
                     {"sourceStart", sourceStart},
                     {"sourceEnd", trimEnd()},
                     {"length", length},
                     {"takeGroup", takeGroup},
                     {"take", take},
                     {"active", active}});
    v.getDynamicObject()->setProperty("kind", isMidi ? "midi" : "audio");
    if (active && isMidi) {
      Array<var> notes;
      for (int i = 0; i < events->getNumEvents() && notes.size() < 2048; ++i) {
        auto *event = events->getEventPointer(i);
        const double begin = event->message.getTimeStamp();
        const double end =
            event->noteOffObject ? event->noteOffObject->message.getTimeStamp() : begin + 0.1;
        if (event->message.isNoteOn() && end > offset && begin < offset + duration())
          notes.add(object({{"event", i}, {"start", jmax(0.0, begin - offset)},
                            {"note", event->message.getNoteNumber()},
                            {"velocity", (int)event->message.getVelocity()}, {"channel", event->message.getChannel()},
                            {"duration", jmin(end, offset + duration()) - jmax(begin, offset)}}));
      }
      v.getDynamicObject()->setProperty("notes", notes);
    }
    if (full)
      v.getDynamicObject()->setProperty("path", path);
    cachedKey = key;
    cachedJson = v;
    return v;
  }
};
struct Effect {
  int uid = 0;
  String id = Uuid().toString(), path, name;
  bool bypass = false;
  std::unique_ptr<AudioPluginInstance> plugin;
};
struct TrackPlayHead final : AudioPlayHead {
  PositionInfo info;
  Optional<PositionInfo> getPosition() const override { return info; }
};
struct Track {
  TrackPlayHead playHead;
  bool isMidi = false;
  String midiDevice;
  int midiChannel = 0;
  MidiMessageCollector collector;
  MidiBuffer liveMidi, auditionMidi;
  int auditionNote = 60, auditionChannel = 1, auditionSamples = 0, auditionTail = 0;
  struct RecordedEvent {
    double time;
    uint8 data[3];
    int size;
  };
  struct RecordingPreviewNote {
    double start;
    double duration;
    int note;
  };
  std::vector<RecordedEvent> midiTake;
  std::vector<float> recordingPeaks;
  int recordingPeakFrames = 0, recordingPeakInterval = 1;
  float recordingPeakValue = 0;
  std::atomic<float> recordingPartialPeak{0};
  std::atomic<int> recordingPeakCount{0};
  std::array<RecordingPreviewNote, 2048> recordingPreviewNotes{};
  std::atomic<int> recordingPreviewNoteCount{0};
  std::array<std::atomic<double>, 16 * 128> recordingNoteStarts{};
  bool midiRecording = false, panic = true;
  int latency = 0;
  int64 captureSkip = 0;
  double captureOffset = 0;
  double previousMidiTime = -1;
  Clip *previousClip = nullptr;
  String id = Uuid().toString(), name, color, icon = "guitar";
  int input = 0;
  bool armed = false, mute = false, solo = false, bypass = false, monitor = false;
  float gain = 0.8f, pan = 0;
  TrackSound sound;
  bool eqEnabled = true;
  float eqBass = 0, eqMid = 0, eqTreble = 0;
  double eqRate = 0;
  std::array<float, 3> eqApplied{999, 999, 999};
  IIRFilter eqFilters[2][3];
  std::atomic<float> peak{0};
  std::vector<std::unique_ptr<Clip>> clips;
  std::unique_ptr<AudioFormatWriter::ThreadedWriter> writer;
  String recordingPath;
  double recordStart = 0;
  std::unique_ptr<AudioPluginInstance> plugin;
  String pluginPath, pluginName;
  int pluginUid = 0;
  std::vector<Effect> effects;
  int pluginLatency() const {
    int total = plugin && !bypass ? jmax(0, plugin->getLatencySamples()) : 0;
    for (auto &effect : effects)
      if (!effect.bypass) total += jmax(0, effect.plugin->getLatencySamples());
    return total;
  }
  AudioBuffer<float> scratch;
};

} // namespace basement
