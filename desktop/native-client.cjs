const { createInterface } = require("node:readline");
// Serialize native commands; plug-in stdout is diagnostic, not protocol.
class NativeClient {
  /**
   * @param {import("node:child_process").ChildProcessWithoutNullStreams} child
   */
  constructor(child, timeout = 60000) {
    this.child = child;
    /** @type {Error | undefined} */
    this.failure = undefined;
    /** @type {{ resolve: (value: any) => void, reject: (error: Error) => void, timer: NodeJS.Timeout } | null} */
    this.pending = null;
    this.closing = false;
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
        this.fail(/** @type {Error} */ (error));
      }
    });
    child.stderr.on("data", (data) => console.error(String(data)));
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
  /** @param {import("./types").EngineCommand} command @returns {Promise<any>} */
  request(command) {
    const result = this.queue.then(() => {
      if (this.failure) throw this.failure;
      return new Promise((resolve, reject) => {
        if (
          command.op &&
          !["state", "pump", "testMidi", "snapshot"].includes(command.op)
        )
          console.log("Audio command:", command.op);
        const timer = setTimeout(
          () =>
            this.fail(
              new Error(
                `The audio engine timed out during ${command.op}. Open logs for startup/device details, then restart the app.`,
              ),
            ),
          command.op === "export" ||
            (command.op === "tempo" && command.match === "all")
            ? 1800000
            : this.timeout,
        );
        this.pending = { resolve, reject, timer };
        this.child.stdin.write(JSON.stringify(command) + "\n");
      });
    });
    this.queue = result.catch(() => {});
    return result;
  }
  /** @param {Error} error */
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
    if (this.closing) return;
    this.closing = true;
    this.failure ??= new Error("The audio engine is closing.");
    // Drain an in-flight reply before ending stdin. Queued/new requests reject.
    void this.queue.finally(() => this.child.stdin.end());
    const timer = setTimeout(() => this.child.kill(), 5000);
    timer.unref();
    this.child.once("close", () => clearTimeout(timer));
  }
}
module.exports = { NativeClient };
