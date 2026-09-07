#pragma once
#include <juce_audio_utils/juce_audio_utils.h>

namespace basement {
using namespace juce;
inline var object(std::initializer_list<std::pair<String, var>> values) {
  auto *d = new DynamicObject();
  for (auto &[k, v] : values)
    d->setProperty(Identifier(k), v);
  return var(d);
}
inline String str(const var &v, const char *key) { return v.getProperty(key, {}).toString(); }
inline double number(const var &v, const char *key, double fallback = 0) {
  return (double)v.getProperty(key, fallback);
}
inline bool flag(const var &v, const char *key, bool fallback = false) {
  return (bool)v.getProperty(key, fallback);
}
inline void require(bool condition, const char *message) {
  if (!condition)
    throw std::runtime_error(message);
}

} // namespace basement
