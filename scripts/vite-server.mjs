import { createServer } from "vite";

// Readiness is an IPC message, never parsed from colored terminal output.
// Each debug session gets an available local port, including after an aborted F5.
try {
  const server = await createServer({
    server: { host: "127.0.0.1", port: 0, strictPort: false },
  });
  await server.listen();
  const address = server.httpServer.address();
  if (!address || typeof address === "string")
    throw new Error("No UI server port was assigned");
  const url = `http://127.0.0.1:${address.port}/`;
  console.log(`UI server ready at ${url}`);
  process.send?.({ type: "ready", url });
  process.on("disconnect", async () => {
    await server.close();
    process.exit();
  });
} catch (error) {
  console.error(error);
  process.exitCode = 1;
  process.disconnect?.();
}
