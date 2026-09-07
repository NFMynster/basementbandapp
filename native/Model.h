#pragma once
#include "Json.h"
#include <atomic>
#include <vector>

namespace basement {
struct Clip {
  bool isMidi = false;
  double midiLength = 0;
  MidiMessageSequence events;
  int eventCursor = 0;
  double eventPosition = -1;
  String id = Uuid().toString(), name, path;
  double start = 0, sampleRate = 48000;
  AudioBuffer<float> audio;
  Array<var> peaks;
  double duration() const { return isMidi ? midiLength : audio.getNumSamples() / sampleRate; }
  var json(bool full) const {
    auto v = object(
        {{"id", id}, {"name", name}, {"start", start}, {"duration", duration()}, {"peaks", peaks}});
    v.getDynamicObject()->setProperty("kind", isMidi ? "midi" : "audio");
    if (isMidi) {
      Array<var> notes;
      for (int i = 0; i < events.getNumEvents() && notes.size() < 2048; ++i) {
        auto *event = events.getEventPointer(i);
        if (event->message.isNoteOn())
          notes.add(object(
              {{"start", event->message.getTimeStamp()},
               {"note", event->message.getNoteNumber()},
               {"duration", event->noteOffObject ? event->noteOffObject->message.getTimeStamp() -
                                                       event->message.getTimeStamp()
                                                 : 0.1}}));
      }
      v.getDynamicObject()->setProperty("notes", notes);
    }
    if (full)
      v.getDynamicObject()->setProperty("path", path);
    return v;
  }
};
struct Track {
  bool isMidi = false;
  String midiDevice;
  int midiChannel = 0;
  MidiMessageCollector collector;
  MidiBuffer liveMidi;
  struct RecordedEvent {
    double time;
    uint8 data[3];
    int size;
  };
  std::vector<RecordedEvent> midiTake;
  bool midiRecording = false, panic = true;
  int latency = 0;
  int64 captureSkip = 0;
  double captureOffset = 0;
  double previousMidiTime = -1;
  String id = Uuid().toString(), name, color;
  int input = 0;
  bool armed = false, mute = false, solo = false, bypass = false;
  float gain = 0.8f, pan = 0;
  std::atomic<float> peak{0};
  std::vector<std::unique_ptr<Clip>> clips;
  std::unique_ptr<AudioFormatWriter::ThreadedWriter> writer;
  String recordingPath;
  double recordStart = 0;
  std::unique_ptr<AudioPluginInstance> plugin;
  String pluginPath, pluginName;
  AudioBuffer<float> scratch;
};

} // namespace basement
