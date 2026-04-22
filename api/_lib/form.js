const fs = require("node:fs/promises");
const formidable = require("formidable");

function parseForm(req) {
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
