#include "Engine.h"
#include <iostream>
#include <cstdlib>
#include <thread>
#if JUCE_MAC
#import <Cocoa/Cocoa.h>
#endif

using namespace basement;

static void respond(const var &response) {
  std::cout << "BASEMENT:" << JSON::toString(response, true).toStdString() << std::endl;
}

int main(int argc, char **argv) {
#if JUCE_MAC
  // A console target does not enter JUCEApplicationBase::main, which normally
  // creates NSApp. runDispatchLoop sends [NSApp run]; nil returns immediately.
  @autoreleasepool {
    [NSApplication sharedApplication];
    [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
  }
  std::cerr << "macOS application event dispatcher initialized" << std::endl;
#endif
  ScopedJuceInitialiser_GUI gui;
  bool testDevice = false, inputAllowed = true, listening = false;
  var remembered;
  for (int i = 1; i < argc; ++i) {
    const String arg(argv[i]);
    if (arg == "--test-device") testDevice = true;
    else if (arg == "--no-input") inputAllowed = false;
    else if (arg == "--listening") listening = true;
    else if (arg == "--device" && i + 1 < argc) {
      // Hex-encoded UTF-8 JSON: device names survive any command-line code page.
      MemoryBlock utf8;
      utf8.loadFromHexString(String(argv[++i]));
      remembered = JSON::parse(String::fromUTF8((const char *)utf8.getData(), (int)utf8.getSize()));
    }
  }
  Engine engine(testDevice);
  MessageManager::callAsync(
      [&] {
        std::cerr << "Message loop dispatched audio initialization" << std::endl;
        engine.initializeAudio(inputAllowed, remembered, listening);
      });
  std::cerr << "Native engine ready; entering message loop" << std::endl;
  std::atomic<bool> inputEnded{false};
  std::thread reader([&] {
    std::string line;
    while (std::getline(std::cin, line)) {
      WaitableEvent finished;
      MessageManager::callAsync([&, line] {
        try {
          auto c = JSON::parse(String(line));
          auto result = engine.command(c);
          respond(result);
        } catch (const std::exception &e) {
          respond(object({{"error", String(e.what())}}));
        }
        finished.signal();
      });
      finished.wait();
    }
    inputEnded = true;
    MessageManager::callAsync([&] {
      try {
        engine.command(object({{"op", "stop"}}));
      } catch (...) {
      }
      MessageManager::getInstance()->stopDispatchLoop();
    });
  });
  MessageManager::getInstance()->runDispatchLoop();
  std::cerr << "Native message loop stopped" << std::endl;
  if (!inputEnded) {
    // A dead dispatcher cannot service a reader waiting on finished. Exit with
    // a diagnostic rather than joining that thread forever.
    std::cerr << "Fatal: dispatcher exited before stdin EOF" << std::endl;
    std::_Exit(1);
  }
  reader.join();
  return 0;
}
