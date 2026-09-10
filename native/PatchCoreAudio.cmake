# JUCE 8.0.12: use a private HAL aggregate for different input/output devices.
# Fail closed on upstream changes, and do not rewrite the source on every build.
set(coreaudio "${juce_SOURCE_DIR}/modules/juce_audio_devices/native/juce_CoreAudio_mac.cpp")
file(READ "${coreaudio}" source)
function(replace_coreaudio old new)
    string(FIND "${source}" "${new}" patched)
    if(NOT patched EQUAL -1)
        return()
    endif()
    string(FIND "${source}" "${old}" found)
    if(found EQUAL -1)
        message(FATAL_ERROR "Recheck the CoreAudio aggregate patch for this JUCE version")
    endif()
    string(REPLACE "${old}" "${new}" source "${source}")
    set(source "${source}" PARENT_SCOPE)
endfunction()
replace_coreaudio("class CoreAudioIODeviceType final : public AudioIODeviceType,"
    "#include \"CoreAudioAggregate.h\"\n\nclass CoreAudioIODeviceType final : public AudioIODeviceType,")
replace_coreaudio("if (auto* d = dynamic_cast<AudioIODeviceCombiner*> (device))"
    "if (auto* d = dynamic_cast<BasementCoreAudioAggregate*> (device))\n            return d->getIndexOfDevice (asInput);\n\n        if (auto* d = dynamic_cast<AudioIODeviceCombiner*> (device))")
replace_coreaudio("for (const auto audioDevice : audioDevices)\n        {"
    "for (const auto audioDevice : audioDevices)\n        {\n            if (BasementCoreAudioAggregate::isInternalDevice (audioDevice)) continue;")
replace_coreaudio("return combo.release();"
    "return std::make_unique<BasementCoreAudioAggregate> (combinedName, this, inputDeviceID, outputDeviceID,\n            getNumChannels (inputDeviceID, false), std::move (combo)).release();")
# Aggregate channels may skip the first output stream (the USB interface).
# Report latency for the streams actually selected, rather than streams.front().
replace_coreaudio("latency (getLatencyFromDevice (isInput, parent)),"
    "latency (getLatencyFromDevice (isInput, parent, activeRequested)),")
replace_coreaudio("static int getLatencyFromDevice (bool isInput, CoreAudioInternal& parent)"
    "static int getLatencyFromDevice (bool isInput, CoreAudioInternal& parent, const BigInteger& selected)")
set(old [=[                streamLatency = audioObjectGetProperty<UInt32> (streams.front(), { kAudioStreamPropertyLatency,
                                                                                   scope,
                                                                                   juceAudioObjectPropertyElementMain }).value_or (0);]=])
set(new [=[                for (auto stream : streams)
                {
                    const auto first = audioObjectGetProperty<UInt32> (stream, { kAudioStreamPropertyStartingChannel,
                        kAudioObjectPropertyScopeGlobal, juceAudioObjectPropertyElementMain }).value_or (1) - 1;
                    const auto format = audioObjectGetProperty<AudioStreamBasicDescription> (stream, { kAudioStreamPropertyVirtualFormat,
                        kAudioObjectPropertyScopeGlobal, juceAudioObjectPropertyElementMain });
                    const auto selectedChannel = selected.findNextSetBit (static_cast<int> (first));
                    if (format && selectedChannel >= 0 && selectedChannel < static_cast<int> (first + format->mChannelsPerFrame))
                        streamLatency = jmax (streamLatency, audioObjectGetProperty<UInt32> (stream, { kAudioStreamPropertyLatency,
                            kAudioObjectPropertyScopeGlobal, juceAudioObjectPropertyElementMain }).value_or (0));
                }]=])
replace_coreaudio("${old}" "${new}")
file(READ "${coreaudio}" original)
if(NOT source STREQUAL original)
    file(WRITE "${coreaudio}" "${source}")
endif()
