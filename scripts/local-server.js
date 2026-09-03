const fs = require("fs");
const http = require("http");
const path = require("path");

const root = path.resolve(process.argv[2] || "dist");
const preferredPort = Number(process.argv[3] || process.env.PORT || 8080);

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function sendFile(res, file, statusCode) {
  fs.readFile(file, (error, data) => {
    if (error) {
      res.writeHead(statusCode || 404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(statusCode === 403 ? "Forbidden" : "Not found");
      return;
    }

    res.writeHead(statusCode || 200, {
      "Content-Type": types[path.extname(file).toLowerCase()] || "application/octet-stream"
    });
    res.end(data);
  });
}

function handler(req, res) {
  const url = new URL(req.url, "http://localhost");
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith("/")) pathname += "index.html";

  const file = path.resolve(root, "." + pathname);
  if (file !== root && !file.startsWith(root + path.sep)) {
    sendFile(res, file, 403);
    return;
  }

  fs.stat(file, (error, stat) => {
    if (!error && stat.isFile()) {
      sendFile(res, file, 200);
      return;
    }

    sendFile(res, path.join(root, "404.html"), 404);
  });
}

function listen(port) {
  const server = http.createServer(handler);
  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      listen(port + 1);
      return;
    }

    console.error(error);
    process.exitCode = 1;
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`Serving ${root} at http://localhost:${port}/`);
  });
}

listen(Number.isFinite(preferredPort) && preferredPort > 0 ? preferredPort : 8080);
