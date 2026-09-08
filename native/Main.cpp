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
  Engine engine(argc > 1 && String(argv[1]) == "--test-device");
  MessageManager::callAsync(
      [&] {
        std::cerr << "Message loop dispatched audio initialization" << std::endl;
        engine.initializeAudio(!(argc > 1 && String(argv[1]) == "--no-input"));
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
