import { createInterface } from "node:readline";
createInterface({ input: process.stdin }).on("line", (line) => {
  const c = JSON.parse(line);
  if (c.op === "exit") {
    process.exit(1);
  }
  if (c.op === "hang") return;
  if (c.op === "invalid") {
    console.log("BASEMENT:invalid");
    return;
  }
  setTimeout(() => {
    console.log("plug-in diagnostic");
    console.log("BASEMENT:" + JSON.stringify(c.value));
  }, c.delay ?? 0);
});
