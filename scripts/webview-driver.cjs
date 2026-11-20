// Drives the built desktop app for the smoke and visual runs. The app starts
// on the engine's test device with WebView2's DevTools port open, and this
// file speaks the Chrome DevTools Protocol to it (Node's built-in WebSocket),
// offering the small window surface the scripts use: run page scripts, send
// real mouse and key input, capture screenshots, inject CSS and resize.
// Windows only: macOS's WKWebView has no equivalent automation port.
const { spawn, spawnSync } = require("node:child_process");
const {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
} = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

/** @typedef {{ x: number, y: number, width: number, height: number }} Rect */
/**
 * @typedef {{
 *   type: "mouseDown" | "mouseUp" | "mouseMove" | "keyDown" | "keyUp" | "char",
 *   x?: number, y?: number, button?: "left" | "middle" | "right",
 *   clickCount?: number, modifiers?: string[], keyCode?: string
 * }} InputEvent
 *   Electron's sendInputEvent shape, which the scripts were written against.
 */

function appExecutable() {
  if (process.env.BASEMENT_APP) return path.resolve(process.env.BASEMENT_APP);
  const exe = path.join(
    root,
    "desktop/target/release",
    process.platform === "win32" ? "Basement Band.exe" : "Basement Band",
  );
  if (!existsSync(exe))
    throw new Error("Run npm run build:desktop to build the desktop app.");
  return exe;
}

const delay = (/** @type {number} */ ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** One DevTools session over a WebSocket. */
class Cdp {
  /** @param {WebSocket} socket */
  constructor(socket) {
    this.socket = socket;
    this.sequence = 0;
    /** @type {Map<number, { resolve: (v: any) => void, reject: (e: Error) => void }>} */
    this.pending = new Map();
    /** @type {Map<string, Set<(params: any) => void>>} */
    this.listeners = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id !== undefined) {
        const entry = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error)
          entry?.reject(new Error(`${message.error.message} (CDP)`));
        else entry?.resolve(message.result);
      } else
        for (const listener of this.listeners.get(message.method) ?? [])
          listener(message.params);
    });
    socket.addEventListener("close", () => {
      for (const entry of this.pending.values())
        entry.reject(new Error("The desktop app closed"));
      this.pending.clear();
    });
  }
  /** @param {string} method @param {Record<string, unknown>} [params] @returns {Promise<any>} */
  send(method, params = {}) {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  /** @param {string} method @param {(params: any) => void} listener */
  on(method, listener) {
    if (!this.listeners.has(method)) this.listeners.set(method, new Set());
    this.listeners.get(method)?.add(listener);
  }
  /** @param {string} method @returns {Promise<any>} */
  once(method) {
    return new Promise((resolve) => {
      /** @param {any} params */
      const listener = (params) => {
        this.listeners.get(method)?.delete(listener);
        resolve(params);
      };
      this.on(method, listener);
    });
  }
}

/** @param {number} port */
async function pageTarget(port) {
  const deadline = Date.now() + 30000;
  for (;;) {
    try {
      /** @type {{ type: string, url: string, webSocketDebuggerUrl: string }[]} */
      const targets = await (
        await fetch(`http://127.0.0.1:${port}/json/list`)
      ).json();
      const page = targets.find(
        (t) => t.type === "page" && /tauri\.localhost|^tauri:/.test(t.url),
      );
      if (page) return page;
    } catch {
      /* The webview is still starting. */
    }
    if (Date.now() > deadline)
      throw new Error("The desktop app did not open its window");
    await delay(150);
  }
}

const MODIFIERS = /** @type {Record<string, number>} */ ({
  alt: 1,
  control: 2,
  ctrl: 2,
  meta: 4,
  command: 4,
  cmd: 4,
  shift: 8,
});
const BUTTON_BITS = /** @type {Record<string, number>} */ ({
  left: 1,
  right: 2,
  middle: 4,
});
/** @type {Record<string, { key: string, code: string, vk: number, text?: string }>} */
const KEYS = {
  Escape: { key: "Escape", code: "Escape", vk: 27 },
  Return: { key: "Enter", code: "Enter", vk: 13, text: "\r" },
  Enter: { key: "Enter", code: "Enter", vk: 13, text: "\r" },
  Tab: { key: "Tab", code: "Tab", vk: 9 },
  Space: { key: " ", code: "Space", vk: 32, text: " " },
  Backspace: { key: "Backspace", code: "Backspace", vk: 8 },
  Delete: { key: "Delete", code: "Delete", vk: 46 },
  Up: { key: "ArrowUp", code: "ArrowUp", vk: 38 },
  Down: { key: "ArrowDown", code: "ArrowDown", vk: 40 },
  Left: { key: "ArrowLeft", code: "ArrowLeft", vk: 37 },
  Right: { key: "ArrowRight", code: "ArrowRight", vk: 39 },
  Home: { key: "Home", code: "Home", vk: 36 },
  End: { key: "End", code: "End", vk: 35 },
};

/** @param {string} name @param {number} bits */
function keyInfo(name, bits) {
  if (KEYS[name]) return KEYS[name];
  const fn = /^F(\d{1,2})$/.exec(name);
  if (fn) return { key: name, code: name, vk: 111 + Number(fn[1]) };
  if (/^[A-Za-z]$/.test(name)) {
    const upper = name.toUpperCase();
    const shifted = !!(bits & 8);
    const key = shifted ? upper : upper.toLowerCase();
    return {
      key,
      code: `Key${upper}`,
      vk: upper.charCodeAt(0),
      text: bits & 6 ? undefined : key,
    };
  }
  if (/^\d$/.test(name))
    return {
      key: name,
      code: `Digit${name}`,
      vk: name.charCodeAt(0),
      text: name,
    };
  return { key: name, code: name, vk: 0, text: name.length === 1 ? name : "" };
}

/**
 * Starts the app and connects. `fixture` replaces the shell bridge with the
 * visual fixture (scripts/visual-fixture.js) before the UI loads.
 * @param {{ fixture?: boolean, width?: number, height?: number }} [options]
 */
async function launchDesktop({ fixture = false, width, height } = {}) {
  if (process.platform !== "win32")
    throw new Error(
      "The desktop smoke and visual runs drive WebView2 and run on Windows.",
    );
  const port = 9300 + Math.floor(Math.random() * 600);
  // A fresh webview profile each run (no remembered welcome dismissal or
  // layout). Earlier profiles are removed when nothing holds them anymore.
  const profiles = path.join(root, "artifacts/smoke-user/webview");
  mkdirSync(profiles, { recursive: true });
  for (const old of readdirSync(profiles))
    try {
      rmSync(path.join(profiles, old), { recursive: true, force: true });
    } catch {
      /* Still in use by a closing run; a later run removes it. */
    }
  const profile = path.join(profiles, `run-${Date.now()}-${port}`);
  const child = spawn(appExecutable(), [], {
    cwd: root,
    windowsHide: false,
    stdio: ["ignore", "inherit", "inherit"],
    env: {
      ...process.env,
      BASEMENT_SMOKE: "1",
      BASEMENT_TEST_DEVICE: "1",
      BASEMENT_CDP_PORT: String(port),
      BASEMENT_WEBVIEW_PROFILE: profile,
    },
  });
  const exited = new Promise((resolve) => child.once("exit", resolve));
  // The whole tree: the engine and WebView2's helper processes too.
  const close = async () => {
    if (child.exitCode === null)
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
      });
    await exited;
  };
  try {
    const target = await pageTarget(port);
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    const cdp = new Cdp(socket);
    await cdp.send("Runtime.enable");
    await cdp.send("Page.enable");
    const origin = new URL(target.url).origin;

    /** Promises the scripts may not await must never crash the run. @template T @param {Promise<T>} promise */
    const handled = (promise) => {
      promise.catch(() => {});
      return promise;
    };
    const navigating = (/** @type {unknown} */ error) =>
      /context was destroyed|Cannot find (default )?(execution )?context|Inspected target navigated/i.test(
        String(error),
      );
    /** Settles once the latest reload or navigation has loaded. */
    let pendingLoad = Promise.resolve();
    /** Waits out a reload or navigation, as Electron's executeJavaScript does. @param {string} code */
    const evaluate = async (code) => {
      await pendingLoad;
      try {
        return await evaluateOnce(code);
      } catch (error) {
        if (!navigating(error)) throw error;
        await delay(100);
        await loaded();
        return evaluateOnce(code);
      }
    };
    /** @param {string} code */
    const evaluateOnce = async (code) => {
      const reply = await cdp.send("Runtime.evaluate", {
        expression: code,
        awaitPromise: true,
        returnByValue: false,
        userGesture: true,
      });
      if (reply.exceptionDetails) {
        const details = reply.exceptionDetails;
        const reason =
          details.exception?.description ||
          details.exception?.value ||
          details.text;
        throw new Error(`${reason}\n  in: ${code.trim().slice(0, 300)}`);
      }
      const result = reply.result;
      if (!result.objectId) return result.value;
      // Like Electron's executeJavaScript: plain data comes back as a copy,
      // DOM nodes and other unclonable values as an empty object.
      const copy = await cdp.send("Runtime.callFunctionOn", {
        objectId: result.objectId,
        functionDeclaration:
          "function () { if (this instanceof Node) return {}; try { return JSON.parse(JSON.stringify(this)); } catch { return {}; } }",
        returnByValue: true,
      });
      void cdp.send("Runtime.releaseObject", { objectId: result.objectId });
      return copy.result.value;
    };
    const loaded = async () => {
      for (let attempt = 0; attempt < 100; attempt++) {
        try {
          if (
            await evaluateOnce(
              "document.readyState === 'complete' && !window.__driverLeaving && !!window.__TAURI_INTERNALS__",
            )
          )
            return;
        } catch {
          /* Navigating. */
        }
        await delay(50);
      }
      throw new Error("The UI did not finish loading");
    };
    /**
     * Navigates from inside the page: navigations started over DevTools
     * would skip the shell's bridge script. Scripts sent meanwhile wait.
     * @param {string} how
     */
    const navigate = (how) => {
      pendingLoad = (async () => {
        await evaluateOnce(
          `window.__driverLeaving = true; setTimeout(() => { ${how}; }, 0)`,
        );
        await delay(100);
        await loaded();
      })();
      const settled = pendingLoad;
      pendingLoad = settled.catch(() => {});
      return handled(settled);
    };
    /** A shell command; right after a reload the bridge may still be loading. @param {Record<string, unknown>} args @param {string} command */
    const invoke = (command, args = {}) =>
      evaluate(
        `(async () => { for (let i = 0; i < 200 && !window.__TAURI_INTERNALS__; i++) await new Promise((r) => setTimeout(r, 25)); return window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)}, ${JSON.stringify(args)}); })()`,
      );

    let insertedCss = 0;
    /** @type {Set<(event: unknown, level: number, message: string) => void>} */
    const consoleListeners = new Set();
    cdp.on("Runtime.consoleAPICalled", (params) => {
      const level =
        { warning: 2, error: 3, assert: 3 }[
          /** @type {string} */ (params.type)
        ] ?? 1;
      const message = params.args
        .map(
          (/** @type {any} */ a) => a.value ?? a.description ?? String(a.type),
        )
        .join(" ");
      for (const listener of consoleListeners) listener({}, level, message);
    });

    const webContents = {
      /** @param {string} code @returns {Promise<any>} */
      executeJavaScript: (code) => evaluate(code),
      /** @param {InputEvent} event */
      sendInputEvent(event) {
        const names = (event.modifiers ?? []).map((m) => m.toLowerCase());
        const bits = names.reduce((sum, m) => sum | (MODIFIERS[m] ?? 0), 0);
        if (event.type.startsWith("mouse")) {
          // As in Electron, held buttons come only from this event: the
          // button pressed, a move that names its button, or
          // "leftButtonDown"-style modifiers. A bare move has none held.
          let held = 0;
          for (const name of names) {
            const pressed = /^(left|right|middle)buttondown$/.exec(name);
            if (pressed) held |= BUTTON_BITS[pressed[1]];
          }
          const button = event.button ?? "left";
          if (event.type === "mouseDown" || event.button)
            held |= BUTTON_BITS[button];
          if (event.type === "mouseUp") held &= ~BUTTON_BITS[button];
          const params = {
            type: {
              mouseDown: "mousePressed",
              mouseUp: "mouseReleased",
              mouseMove: "mouseMoved",
            }[
              /** @type {"mouseDown" | "mouseUp" | "mouseMove"} */ (event.type)
            ],
            x: event.x ?? 0,
            y: event.y ?? 0,
            modifiers: bits,
            buttons: held,
            button:
              event.type !== "mouseMove"
                ? button
                : held & 1
                  ? "left"
                  : held & 2
                    ? "right"
                    : held & 4
                      ? "middle"
                      : "none",
            clickCount:
              event.type === "mouseMove" ? 0 : (event.clickCount ?? 1),
          };
          return handled(cdp.send("Input.dispatchMouseEvent", params));
        }
        const info = keyInfo(event.keyCode ?? "", bits);
        const down = event.type !== "keyUp";
        return handled(
          cdp.send("Input.dispatchKeyEvent", {
            type: down ? (info.text ? "keyDown" : "rawKeyDown") : "keyUp",
            key: info.key,
            code: info.code,
            windowsVirtualKeyCode: info.vk,
            nativeVirtualKeyCode: info.vk,
            modifiers: bits,
            ...(down && info.text ? { text: info.text } : {}),
          }),
        );
      },
      /** @param {Rect} [rect] */
      async capturePage(rect) {
        await evaluate(
          "new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))",
        );
        const { data } = await cdp.send("Page.captureScreenshot", {
          format: "png",
          ...(rect ? { clip: { ...rect, scale: 1 } } : {}),
        });
        const png = Buffer.from(data, "base64");
        return {
          toPNG: () => png,
          getSize: () => ({
            width: png.readUInt32BE(16),
            height: png.readUInt32BE(20),
          }),
        };
      },
      /** @param {string} css */
      async insertCSS(css) {
        const key = `inserted-${++insertedCss}`;
        await evaluate(
          `(() => { const style = document.createElement('style'); style.dataset.inserted = ${JSON.stringify(key)}; style.textContent = ${JSON.stringify(css)}; document.head.append(style); })()`,
        );
        return key;
      },
      /** @param {string} key */
      removeInsertedCSS: (key) =>
        evaluate(
          `document.querySelector('style[data-inserted="${key}"]')?.remove()`,
        ),
      reload: () => navigate("location.reload()"),
      /** @param {"console-message"} _name @param {(event: unknown, level: number, message: string) => void} listener */
      on(_name, listener) {
        consoleListeners.add(listener);
      },
    };

    const win = {
      webContents,
      /** Resizes the content area. @param {number} w @param {number} h */
      setSize: (w, h) =>
        handled(invoke("smoke_set_size", { width: w, height: h })),
      showInactive() {},
      /** Opens the UI again, optionally with a query string. @param {string} _file @param {{ query?: Record<string, string> }} [options] */
      loadFile(_file, options = {}) {
        const query = new URLSearchParams(options.query ?? {}).toString();
        const url = `${origin}/index.html${query ? `?${query}` : ""}`;
        return navigate(`location.href = ${JSON.stringify(url)}`);
      },
      /** Native file dialogs never open in the smoke run; they wait here. */
      dialogs: {
        /** @returns {Promise<number>} dialogs opened so far */
        opened: async () => (await invoke("smoke_dialog", {})).opened,
        /** Answers the waiting dialog with a path, or cancels it. @param {string | null} answer */
        answer: async (answer) =>
          (await invoke("smoke_dialog", { answer, resolve: true })).answered,
      },
      destroy: () => void close(),
    };
    /** @type {import("../desktop/types").Request} */
    const request = (command) => invoke("smoke_request", { command });

    await loaded();
    if (fixture) {
      await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
        source: readFileSync(path.join(__dirname, "visual-fixture.js"), "utf8"),
      });
      await webContents.reload();
    }
    if (width && height) await win.setSize(width, height);
    const app = {
      quit: () => close(),
      /** @param {number} code */
      exit: async (code) => {
        process.exitCode = code;
        await close();
      },
    };
    return { win, request, app };
  } catch (error) {
    await close();
    throw error;
  }
}

module.exports = { launchDesktop };
