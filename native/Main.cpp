#include "Engine.h"
#include <iostream>
#include <thread>

using namespace basement;

static void respond(const var &response) {
  std::cout << "BASEMENT:" << JSON::toString(response, true).toStdString() << std::endl;
}

int main(int argc, char **argv) {
  ScopedJuceInitialiser_GUI gui;
  Engine engine(argc > 1 && String(argv[1]) == "--test-device");
  MessageManager::callAsync(
      [&] { engine.initializeAudio(!(argc > 1 && String(argv[1]) == "--no-input")); });
  std::cerr << "Native engine ready; entering message loop" << std::endl;
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
    MessageManager::callAsync([&] {
      try {
        engine.command(object({{"op", "stop"}}));
      } catch (...) {
      }
      MessageManager::getInstance()->stopDispatchLoop();
    });
  });
  MessageManager::getInstance()->runDispatchLoop();
  reader.join();
  return 0;
}
