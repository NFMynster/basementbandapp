// Included inside JUCE's CoreAudio implementation by PatchCoreAudio.cmake.
// Keep the user's channel numbering while CoreAudio synchronises the two clocks.
class BasementCoreAudioAggregate final : public AudioIODevice,
                                         private AudioIODeviceCallback
{
public:
    BasementCoreAudioAggregate (const String& name, CoreAudioIODeviceType* type,
                               AudioDeviceID input, AudioDeviceID output, int outputOffset,
                               std::unique_ptr<AudioIODeviceCombiner> legacy)
        : AudioIODevice (name, "CoreAudio"), owner (type), inputID (input), outputID (output),
          outputChannelOffset (outputOffset), fallback (std::move (legacy)) {}

    ~BasementCoreAudioAggregate() override { close(); }

    int getIndexOfDevice (bool input) const { return fallback->getIndexOfDevice (input); }
    StringArray getInputChannelNames() override { return fallback->getInputChannelNames(); }
    StringArray getOutputChannelNames() override { return fallback->getOutputChannelNames(); }
    Array<double> getAvailableSampleRates() override { return fallback->getAvailableSampleRates(); }
    Array<int> getAvailableBufferSizes() override { return fallback->getAvailableBufferSizes(); }
    int getDefaultBufferSize() override { return fallback->getDefaultBufferSize(); }
    bool isOpen() override { return device().isOpen(); }
    bool isPlaying() override { return device().isPlaying(); }
    String getLastError() override { return device().getLastError(); }
    double getCurrentSampleRate() override { return device().getCurrentSampleRate(); }
    int getCurrentBufferSizeSamples() override { return device().getCurrentBufferSizeSamples(); }
    int getCurrentBitDepth() override { return device().getCurrentBitDepth(); }
    int getInputLatencyInSamples() override { return device().getInputLatencyInSamples(); }
    int getOutputLatencyInSamples() override { return device().getOutputLatencyInSamples(); }
    int getXRunCount() const noexcept override { return device().getXRunCount(); }
    AudioWorkgroup getWorkgroup() const override { return device().getWorkgroup(); }
    BigInteger getActiveInputChannels() const override { return device().getActiveInputChannels(); }
    BigInteger getActiveOutputChannels() const override
    {
        auto channels = device().getActiveOutputChannels();
        if (aggregate) channels >>= outputChannelOffset;
        return channels;
    }

    String open (const BigInteger& inputs, const BigInteger& outputs, double rate, int block) override
    {
        close();
        // The first subdevice supplies input; output channels belonging to that
        // interface must be skipped so sound still goes to the selected speakers.
        if (createAggregate())
        {
            // HAL publishes aggregate subdevices asynchronously. Wait briefly on
            // the setup thread, before installing any audio callback.
            bool layoutReady = false;
            const auto inputUID = deviceUID (inputID), outputUID = deviceUID (outputID);
            for (int attempt = 0; attempt < 20; ++attempt)
            {
                const auto active = audioObjectGetProperties<AudioObjectID> (aggregateID,
                    { kAudioAggregateDevicePropertyActiveSubDeviceList, kAudioObjectPropertyScopeGlobal,
                      juceAudioObjectPropertyElementMain });
                const CFUniquePtr<CFArrayRef> order (audioObjectGetProperty<CFArrayRef> (aggregateID,
                    { kAudioAggregateDevicePropertyFullSubDeviceList, kAudioObjectPropertyScopeGlobal,
                      juceAudioObjectPropertyElementMain }).value_or (nullptr));
                layoutReady = active.size() == 2 && order && CFArrayGetCount (order.get()) == 2
                    && inputUID && outputUID && CFEqual (CFArrayGetValueAtIndex (order.get(), 0), inputUID.get())
                    && CFEqual (CFArrayGetValueAtIndex (order.get(), 1), outputUID.get());
                if (layoutReady) break;
                Thread::sleep (10);
            }
            aggregate = std::make_unique<CoreAudioIODevice> (owner, getName(), aggregateID, aggregateID);
            const bool channelsReady = layoutReady
                && aggregate->getInputChannelNames().size() >= getInputChannelNames().size()
                && aggregate->getOutputChannelNames().size() >= outputChannelOffset + getOutputChannelNames().size();
            if (channelsReady)
            {
                BigInteger mappedInputs, mappedOutputs;
                for (int i = 0; i < getInputChannelNames().size(); ++i) mappedInputs.setBit (i, inputs[i]);
                for (int i = 0; i < getOutputChannelNames().size(); ++i) mappedOutputs.setBit (i + outputChannelOffset, outputs[i]);
                const auto error = aggregate->open (mappedInputs, mappedOutputs, rate, block);
                if (error.isEmpty())
                {
                    Logger::writeToLog ("Basement CoreAudio: private aggregate active (input " + String (inputID)
                        + ", output " + String (outputID) + ", " + String (getCurrentSampleRate()) + " Hz, "
                        + String (getCurrentBufferSizeSamples()) + " samples)");
                    return {};
                }
                Logger::writeToLog ("Basement CoreAudio: aggregate open failed: " + error);
            }
            else Logger::writeToLog ("Basement CoreAudio: aggregate channel layout unavailable");
            releaseAggregate();
        }
        Logger::writeToLog ("Basement CoreAudio: using separate-device fallback");
        return fallback->open (inputs, outputs, rate, block);
    }

    void start (AudioIODeviceCallback* next) override { callback = next; device().start (this); }
    void stop() override { device().stop(); callback = nullptr; }
    void close() override
    {
        stop();
        fallback->close();
        releaseAggregate();
    }

    static bool isInternalDevice (AudioDeviceID id)
    {
        const auto uid = deviceUID (id);
        return uid && String::fromCFString (uid.get()).startsWith ("studio.basementband.aggregate.");
    }

private:
    CoreAudioIODeviceType* owner;
    AudioDeviceID inputID, outputID, aggregateID = kAudioObjectUnknown;
    int outputChannelOffset;
    std::unique_ptr<AudioIODeviceCombiner> fallback;
    std::unique_ptr<CoreAudioIODevice> aggregate;
    AudioIODeviceCallback* callback = nullptr;

    AudioIODevice& device() const { return aggregate ? static_cast<AudioIODevice&> (*aggregate) : *fallback; }

    static CFUniquePtr<CFStringRef> deviceUID (AudioDeviceID id)
    {
        return CFUniquePtr<CFStringRef> (audioObjectGetProperty<CFStringRef> (id,
            { kAudioDevicePropertyDeviceUID, kAudioObjectPropertyScopeGlobal,
              juceAudioObjectPropertyElementMain }).value_or (nullptr));
    }

    bool createAggregate()
    {
        // Diagnostic escape hatch, without changing the user's device selection.
        if (SystemStats::getEnvironmentVariable ("BASEMENT_COREAUDIO_AGGREGATE", "1") == "0") return false;
        const auto inputUID = deviceUID (inputID), outputUID = deviceUID (outputID);
        if (!inputUID || !outputUID) return false;
        const CFUniquePtr<CFMutableDictionaryRef> description (CFDictionaryCreateMutable (nullptr, 0,
            &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks));
        const CFUniquePtr<CFMutableArrayRef> children (CFArrayCreateMutable (nullptr, 0, &kCFTypeArrayCallBacks));
        const CFUniquePtr<CFStringRef> uid (("studio.basementband.aggregate." + Uuid().toString()).toCFString());
        const int one = 1, zero = 0;
        const CFUniquePtr<CFNumberRef> yes (CFNumberCreate (nullptr, kCFNumberIntType, &one));
        const CFUniquePtr<CFNumberRef> no (CFNumberCreate (nullptr, kCFNumberIntType, &zero));
        for (const auto isInput : { true, false })
        {
            const CFUniquePtr<CFMutableDictionaryRef> child (CFDictionaryCreateMutable (nullptr, 0,
                &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks));
            CFDictionarySetValue (child.get(), CFSTR (kAudioSubDeviceUIDKey), isInput ? inputUID.get() : outputUID.get());
            // Output is the clock source. Resample the USB input to follow it.
            CFDictionarySetValue (child.get(), CFSTR (kAudioSubDeviceDriftCompensationKey), isInput ? yes.get() : no.get());
            CFArrayAppendValue (children.get(), child.get());
        }
        CFDictionarySetValue (description.get(), CFSTR (kAudioAggregateDeviceNameKey), CFSTR ("Basement Band audio"));
        CFDictionarySetValue (description.get(), CFSTR (kAudioAggregateDeviceUIDKey), uid.get());
        CFDictionarySetValue (description.get(), CFSTR (kAudioAggregateDeviceIsPrivateKey), yes.get());
        CFDictionarySetValue (description.get(), CFSTR (kAudioAggregateDeviceIsStackedKey), yes.get());
        CFDictionarySetValue (description.get(), CFSTR (kAudioAggregateDeviceSubDeviceListKey), children.get());
        CFDictionarySetValue (description.get(), CFSTR (kAudioAggregateDeviceMainSubDeviceKey), outputUID.get());
        const auto status = AudioHardwareCreateAggregateDevice (description.get(), &aggregateID);
        if (status == noErr && aggregateID != kAudioObjectUnknown) return true;
        Logger::writeToLog ("Basement CoreAudio: aggregate creation failed: " + String (status));
        releaseAggregate();
        return false;
    }

    void releaseAggregate()
    {
        // Stop callbacks and remove JUCE's listeners before destroying the HAL object.
        if (aggregate) { aggregate->stop(); aggregate->close(); aggregate.reset(); }
        if (aggregateID != kAudioObjectUnknown)
        {
            AudioHardwareDestroyAggregateDevice (aggregateID);
            aggregateID = kAudioObjectUnknown;
        }
    }

    void audioDeviceAboutToStart (AudioIODevice*) override
    {
        if (callback) callback->audioDeviceAboutToStart (this);
    }
    void audioDeviceStopped() override { if (callback) callback->audioDeviceStopped(); }
    void audioDeviceError (const String& error) override { if (callback) callback->audioDeviceError (error); }
    void audioDeviceIOCallbackWithContext (const float* const* in, int ni, float* const* out, int no,
                                         int n, const AudioIODeviceCallbackContext& context) override
    {
        if (callback) callback->audioDeviceIOCallbackWithContext (in, ni, out, no, n, context);
        else for (int ch = 0; ch < no; ++ch) if (out[ch]) FloatVectorOperations::clear (out[ch], n);
    }
};
