const path = require("node:path");
const { sanitizePathPart, storageUpload } = require("./storage");
const { fileToBuffer, firstField, firstFile } = require("./form");

const FILE_TO_BUCKET = {
  file_paper: "papers",
  file_scheme: "schemes",
  file_attempt: "attempts",
  file_marking_yaml: "marking-yaml",
};

const FILE_TO_PATH_FIELD = {
  file_paper: "file_paper_path",
  file_scheme: "file_scheme_path",
  file_attempt: "file_attempt_path",
  file_marking_yaml: "file_marking_yaml_path",
};

function asText(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function asInt(v) {
  if (v == null || v === "") return null;
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

function normalizePaperRow(row) {
  const out = { ...row };
  out.collectionId = "papers";
  out.file_paper = row.file_paper_path ? path.basename(row.file_paper_path) : "";
  out.file_scheme = row.file_scheme_path ? path.basename(row.file_scheme_path) : "";
  out.file_attempt = row.file_attempt_path ? path.basename(row.file_attempt_path) : "";
  out.file_marking_yaml = row.file_marking_yaml_path ? path.basename(row.file_marking_yaml_path) : "";
  return out;
}

function fieldsToPaperPatch(fields) {
  const patch = {};
  const setIf = (key, value) => {
    if (value !== undefined) patch[key] = value;
  };

  const subject = firstField(fields, "subject");
  const year = firstField(fields, "year");
  const paperType = firstField(fields, "paper_type");
  const status = firstField(fields, "status");
  const scheduled = firstField(fields, "scheduled_date");
  const score = firstField(fields, "score");
  const maxScore = firstField(fields, "max_score");
  const aiSummary = firstField(fields, "ai_summary");
  const fullYaml = firstField(fields, "full_yaml");

  if (subject !== undefined) setIf("subject", asText(subject));
  if (year !== undefined) setIf("year", asText(year));
  if (paperType !== undefined) setIf("paper_type", asText(paperType));
  if (status !== undefined) setIf("status", asText(status));
  if (scheduled !== undefined) setIf("scheduled_date", asText(scheduled));
  if (score !== undefined) setIf("score", asInt(score));
  if (maxScore !== undefined) setIf("max_score", asInt(maxScore));
  if (aiSummary !== undefined) setIf("ai_summary", asText(aiSummary));
  if (fullYaml !== undefined) setIf("full_yaml", fullYaml == null ? null : String(fullYaml));
  return patch;
}

async function uploadFilesAndBuildPatch(recordId, files) {
  const patch = {};
  for (const inputField of Object.keys(FILE_TO_BUCKET)) {
    const f = firstFile(files, inputField);
    if (!f) continue;
    const bytes = await fileToBuffer(f);
    if (!bytes) continue;
    const bucket = FILE_TO_BUCKET[inputField];
    const pathField = FILE_TO_PATH_FIELD[inputField];
    const ext = path.extname(f.originalFilename || "").toLowerCase();
    const stem = sanitizePathPart(path.basename(f.originalFilename || inputField, ext));
    const objectPath = `${recordId}/${inputField}/${Date.now()}_${stem || inputField}${ext || ""}`;
    const storagePath = `${bucket}/${objectPath}`;
    await storageUpload(storagePath, bytes, f.mimetype || "application/octet-stream");
    patch[pathField] = storagePath;
  }
  return patch;
}

module.exports = {
  normalizePaperRow,
  fieldsToPaperPatch,
  uploadFilesAndBuildPatch,
  FILE_TO_PATH_FIELD,
};
