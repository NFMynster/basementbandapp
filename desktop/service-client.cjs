const { createInterface } = require("node:readline");

// Owns request correlation and failures, independently of Electron window state.
class ServiceClient {
  #output;
  #pending = new Map();
  #nextId = 0;
  #failure;
  #timeout;

  constructor(child, timeoutMs = 60000) {
    this.#output = child.stdin ?? child;
    this.#timeout = timeoutMs;
    createInterface({ input: child.stdout ?? child }).on("line", (line) => {
      try {
        const data = JSON.parse(line);
        const request = this.#pending.get(data.id);
        if (!request) return;
        clearTimeout(request.timer);
        this.#pending.delete(data.id);
        data.error
          ? request.reject(new Error(data.error))
          : request.resolve(data.result);
      } catch {
        this.#fail(
          new Error(
            "The audio service returned an invalid response. Restart the app.",
          ),
        );
      }
    });
    child.stderr?.on("data", (data) => console.error(data.toString()));
    child.stdin?.on("error", (error) => this.#fail(error));
    child.on("error", (error) => this.#fail(error));
    child.on("close", () =>
      this.#fail(
        new Error(
          "The audio service stopped. Restart the app. Completed recordings remain in the session folder.",
        ),
      ),
    );
  }

  request(command) {
    if (this.#failure) return Promise.reject(this.#failure);
    return new Promise((resolve, reject) => {
      const id = ++this.#nextId;
      const timer =
        this.#timeout > 0
          ? setTimeout(
              () =>
                this.#fail(
                  new Error(
                    "The audio service timed out. Restart the app before continuing.",
                  ),
                ),
              command.op === "export"
                ? Math.max(this.#timeout, 31 * 60 * 1000)
                : this.#timeout,
            )
          : undefined;
      this.#pending.set(id, { resolve, reject, timer });
      this.#output.write(JSON.stringify({ ...command, id }) + "\n");
    });
  }

  close() {
    // EOF asks C# to finalize recording and shut down JUCE. Do not call this
    // from before-quit: an unsaved-work confirmation can still cancel quitting.
    this.#output.end();
  }

  #fail(error) {
    this.#failure ??= error;
    for (const request of this.#pending.values()) {
      clearTimeout(request.timer);
      request.reject(this.#failure);
    }
    this.#pending.clear();
  }
}
module.exports = { ServiceClient };
