(function (w) {
    const G = w.GF;
    G.extractYamlBlock = function (text) {
        const fence = text.match(/```(?:yaml)?\s*([\s\S]*?)```/i);
        return fence ? fence[1].trim() : text.trim();
    };
    /** js-yaml global from CDN: `jsyaml` */
    G.resolveYamlApi = function () {
        const y = w.jsyaml;
        if (y && typeof y.load === "function") return y;
        return {};
    };
    G.parseMarkingYaml = function (yamlText, yamlApi) {
        const api = yamlApi && yamlApi.load ? yamlApi : G.resolveYamlApi();
        const load = api.load ?? api.default?.load;
        const warnings = [];
        const inner = G.extractYamlBlock(yamlText);
        let data = null;
        if (typeof load !== "function") {
            return { data: null, error: "YAML parser not available (load js-yaml before app)", warnings };
        }
        try {
            data = load(inner);
        } catch (e) {
            return { data: null, error: e.message || "Invalid YAML", warnings };
        }
        if (!data || typeof data !== "object") {
            return { data: null, error: "YAML did not parse to an object", warnings };
        }
        const score = data.total_percentage;
        if (score == null || Number.isNaN(Number(score))) {
            warnings.push("Missing or invalid score in YAML.");
        }
        if (data.qa && data.qa.math_consistent === false) {
            warnings.push("QA flag: math_consistent is false — verify score before saving.");
        }
        if (data.qa && Array.isArray(data.questions) && data.questions.length) {
            const sum = data.questions.reduce(
                (s, q) =>
                    s +
                    (Number(q && q.score != null ? q.score : 0) || 0),
                0
            );
            if (data.qa.raw_total_awarded != null) {
                const qaAwarded = Number(data.qa.raw_total_awarded);
                if (!Number.isNaN(qaAwarded) && Math.abs(qaAwarded - sum) > 0.01) {
                    warnings.push("Question score sum does not match qa.raw_total_awarded.");
                }
            }
        }
        return { data, error: null, warnings };
    };
    G.summaryFromParsed = function (data) {
        if (!data) return "";
        if (typeof data.overall_summary === "string") return data.overall_summary;
        return "";
    };
    G.scoreFromParsed = function (data) {
        if (!data) return null;
        const raw = data.total_percentage;
        if (raw == null) return null;
        const n = parseInt(String(raw), 10);
        return Number.isNaN(n) ? null : n;
    };

    /** Stored in `full_yaml` when the real body is uploaded as `file_marking_yaml` (PocketBase text limit). */
    G.MARKING_YAML_STUB = "_gotfoth_marking_yaml_storage: file\n";

    G.hasMarkingYamlContent = function (paper) {
        if (!paper) return false;
        const fy = paper.full_yaml != null ? String(paper.full_yaml) : "";
        const stub = typeof G.MARKING_YAML_STUB === "string" ? String(G.MARKING_YAML_STUB).trim() : "";
        const inline = fy.trim();
        const hasRealInlineYaml = !!(inline && (!stub || inline !== stub));
        const hasMarkingAttachment = !!(
            (paper.file_marking_yaml_path && String(paper.file_marking_yaml_path).trim()) ||
            (paper.file_marking_yaml && String(paper.file_marking_yaml).trim())
        );
        return hasRealInlineYaml || hasMarkingAttachment;
    };

    /**
     * @param {string} yamlText raw pasted YAML
     * @param {{ hadMarkingFile?: boolean }} opts hadMarkingFile if record already has file_marking_yaml
     * @returns {{ full_yaml: string, markingBlob: Blob|null, clearMarkingFile: boolean }}
     */
    G.packMarkingYamlForSave = function (yamlText, opts) {
        opts = opts || {};
        const hadFile = !!opts.hadMarkingFile;
        const t = yamlText != null ? String(yamlText) : "";
        const max = typeof G.FULL_YAML_TEXT_MAX === "number" ? G.FULL_YAML_TEXT_MAX : 5000;
        if (t.length <= max) {
            return {
                full_yaml: t,
                markingBlob: null,
                clearMarkingFile: hadFile,
            };
        }
        return {
            full_yaml: G.MARKING_YAML_STUB,
            markingBlob: new Blob([t], { type: "text/yaml;charset=utf-8" }),
            clearMarkingFile: false,
        };
    };

    /** Full marking YAML: attached file wins when present, else `full_yaml` text. */
    G.resolveMarkingYamlText = async function (paper) {
        if (!paper) return "";
        const fy = paper.full_yaml != null ? String(paper.full_yaml) : "";
        const stub = typeof G.MARKING_YAML_STUB === "string" ? String(G.MARKING_YAML_STUB).trim() : "";
        const inline = fy.trim();
        const inlineIsStubOnly = !!(inline && stub && inline === stub);
        const hasInlineRealYaml = !!(inline && (!stub || inline !== stub));

        // If inline YAML already contains the real document, don't hit `/api/files` unnecessarily.
        if (hasInlineRealYaml) return fy;

        if ((paper.file_marking_yaml || paper.file_marking_yaml_path) && typeof G.fileUrl === "function") {
            const u = G.fileUrl(paper, "file_marking_yaml");
            if (u) {
                try {
                    const r = await fetch(u);
                    if (r.ok) {
                        const txt = await r.text();
                        if (txt) return txt;
                    }
                } catch (ignore) {}
            }
        }
        if (inlineIsStubOnly) return "";
        return paper.full_yaml != null ? String(paper.full_yaml) : "";
    };
})(window);
