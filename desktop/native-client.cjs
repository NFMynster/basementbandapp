const { createInterface } = require("node:readline");
// Serialize native commands; plug-in stdout is diagnostic, not protocol.
class NativeClient {
  constructor(child, timeout = 60000) {
    this.child = child;
    this.queue = Promise.resolve();
    this.timeout = timeout;
    createInterface({ input: child.stdout }).on("line", (line) => {
      if (!line.startsWith("BASEMENT:")) {
        console.log("Native:", line);
        return;
      }
      try {
        const result = JSON.parse(line.slice(9)),
          pending = this.pending;
        if (!pending) return;
        this.pending = null;
        clearTimeout(pending.timer);
        result.error
          ? pending.reject(new Error(result.error))
          : pending.resolve(result);
      } catch (error) {
        this.fail(error);
      }
    });
    child.stderr.on("data", (data) => console.error(data.toString()));
    child.on("error", (error) => this.fail(error));
    child.stdin.on("error", (error) => this.fail(error));
    child.on("close", (code, signal) => {
      console.log("Audio engine exited", {
        code,
        signal,
        expected: !!this.closing,
      });
      this.fail(
        new Error(
          "The audio engine stopped. Restart the app. Completed recordings remain in the session folder.",
        ),
        this.closing,
      );
    });
  }
  request(command) {
    const result = this.queue.then(() => {
      if (this.failure) throw this.failure;
      return new Promise((resolve, reject) => {
        if (command.op && !["state", "pump", "testMidi"].includes(command.op))
          console.log("Audio command:", command.op);
        const timer = setTimeout(
          () =>
            this.fail(
              new Error(
                `The audio engine timed out during ${command.op}. Open logs for startup/device details, then restart the app.`,
              ),
            ),
          command.op === "export" ? 1800000 : this.timeout,
        );
        this.pending = { resolve, reject, timer };
        this.child.stdin.write(JSON.stringify(command) + "\n");
      });
    });
    this.queue = result.catch(() => {});
    return result;
  }
  fail(error, quiet = false) {
    if (!this.failure && !quiet) console.error("Audio engine failure", error);
    this.failure ??= error;
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.reject(this.failure);
      this.pending = null;
    }
  }
  close() {
    this.closing = true;
    this.child.stdin.end();
    const timer = setTimeout(() => this.child.kill(), 5000);
    timer.unref();
    this.child.once("close", () => clearTimeout(timer));
  }
}
module.exports = { NativeClient };
