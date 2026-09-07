import { createInterface } from "node:readline";
createInterface({ input: process.stdin }).on("line", (line) => {
  const c = JSON.parse(line);
  if (c.op === "exit") {
    process.exit(1);
  }
  if (c.op === "hang") return;
  if (c.op === "invalid") {
    console.log("not protocol");
    return;
  }
  setTimeout(
    () => console.log(JSON.stringify({ id: c.id, result: c.value })),
    c.delay ?? 0,
  );
});
