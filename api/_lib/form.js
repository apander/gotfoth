const fs = require("node:fs/promises");
// formidable v3+: default export may be nested when required from CJS.
const formidableImport = require("formidable");
const formidable =
  typeof formidableImport === "function"
    ? formidableImport
    : formidableImport.formidable || formidableImport.default;

function parseForm(req) {
  if (typeof formidable !== "function") {
    return Promise.reject(new Error("formidable parser could not be loaded."));
  }
  return new Promise((resolve, reject) => {
    const form = formidable({
      multiples: false,
      keepExtensions: true,
      maxFileSize: 128 * 1024 * 1024,
    });
    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);
      resolve({ fields, files });
    });
  });
}

function firstField(fields, name) {
  const v = fields[name];
  if (Array.isArray(v)) return v[0];
  return v;
}

function firstFile(files, name) {
  const v = files[name];
  if (Array.isArray(v)) return v[0];
  return v || null;
}

async function fileToBuffer(f) {
  if (!f || !f.filepath) return null;
  return fs.readFile(f.filepath);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(new Error("Invalid JSON body."));
      }
    });
    req.on("error", reject);
  });
}

module.exports = {
  parseForm,
  firstField,
  firstFile,
  fileToBuffer,
  readJsonBody,
};
