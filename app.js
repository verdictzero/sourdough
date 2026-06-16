// Phusion Passenger entry point for DreamHost (and any Passenger host).
//
// Passenger looks for this file at the app root and starts it, setting PORT to
// a socket/port it owns. We boot Next.js in production mode and let it handle
// every request. This file is plain CommonJS on purpose (Passenger runs it
// directly with Node, not through Next's build).
//
// Requires a prior `npm run build` so `.next/` exists.

const { createServer } = require("http");
const next = require("next");

const app = next({ dev: false, dir: __dirname });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => handle(req, res)).listen(process.env.PORT || 3000);
});
