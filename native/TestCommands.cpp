#include "Engine.h"
#include <cmath>
#include <limits>

namespace basement {
var Engine::handleTestCommand(const var &c) {
  const auto op = str(c, "op");
  if (op == "testLatency" && testDevice) {
    inputLatency = jlimit(0, 48000, (int)number(c, "input"));
    outputLatency = jlimit(0, 48000, (int)number(c, "output"));
    return state();
  }
  if (op == "testMidi" && testDevice) {
    auto &t = track(c);
    const int channel = jlimit(1, 16, (int)number(c, "channel", 1));
    if (t.isMidi && (t.midiChannel == 0 || t.midiChannel == channel))
      t.liveMidi.addEvent(
          flag(c, "off") ? MidiMessage::noteOff(channel, (int)number(c, "note", 60))
                         : MidiMessage::noteOn(channel, (int)number(c, "note", 60), (uint8)100),
          (int)number(c, "sample"));
    return state();
  }
  if (op == "pump" && testDevice) {
    int n = jlimit(1, 8192, (int)number(c, "frames", 512));
    AudioBuffer<float> in(2, n), out(2, n);
    // `invalid` feeds NaN, which JSON cannot carry, to exercise the guards.
    const bool invalid = c["invalid"].isBool() && (bool)c["invalid"];
    for (int ch = 0; ch < 2; ++ch)
      for (int i = 0; i < n; ++i)
        in.setSample(ch, i, invalid ? std::numeric_limits<float>::quiet_NaN() : (float)(number(c, "frequency") > 0
            ? 0.25 * std::sin(MathConstants<double>::twoPi * number(c, "frequency") * (i + number(c, "sampleOffset")) / rate)
            : number(c, ch == 0 ? "left" : "right")));
    // A test pump may span many hardware blocks. Respect the maximum block
    // promised to VST3 instances, including MIDI event offsets across blocks.
    std::vector<MidiBuffer> queued;
    for (auto &t : tracks)
      queued.push_back(t->liveMidi);
    for (int offset = 0; offset < n; offset += block) {
      const int count = jmin(block, n - offset);
      for (size_t index = 0; index < tracks.size(); ++index) {
        tracks[index]->liveMidi.clear();
        tracks[index]->liveMidi.addEvents(queued[index], offset, count, -offset);
      }
      const float *input[] = {in.getReadPointer(0, offset), in.getReadPointer(1, offset)};
      float *output[] = {out.getWritePointer(0, offset), out.getWritePointer(1, offset)};
      audioDeviceIOCallbackWithContext(input, 2, output, 2, count, {});
    }
    Array<var> left, right;
    for (int i = 0; i < n; ++i) {
      left.add(out.getSample(0, i));
      right.add(out.getSample(1, i));
    }
    return object({{"left", left}, {"right", right}, {"state", state()}});
  }
  throw std::runtime_error("Unknown test command");
}
} // namespace basement
