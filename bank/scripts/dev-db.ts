import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const directory = fileURLToPath(new URL("../.pglite", import.meta.url));
const db = new PGlite(directory);
const server = new PGLiteSocketServer({ db, port: 5438, host: "127.0.0.1" });
await server.start();
console.log("Paper bank database listening on 127.0.0.1:5438");
await new Promise(() => {});
