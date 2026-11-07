/* Serve extension/test at http://localhost:5178 so the unpacked extension can fill the test forms. */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

const DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "../extension/test");
createServer(async (req, res) => {
  const name = path.basename(new URL(req.url ?? "/", "http://x").pathname) || "index.html";
  try {
    const body = await readFile(path.join(DIR, name.endsWith(".html") ? name : `${name}.html`));
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(body);
  } catch {
    res.writeHead(404).end("Not found");
  }
}).listen(5178, () => console.log("Test forms at http://localhost:5178 (greenhouse, lever, workday)"));
