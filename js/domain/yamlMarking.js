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
        const score = data.score;
        if (score == null || Number.isNaN(Number(score))) {
            warnings.push("Missing or invalid score in YAML.");
        }
        if (data.qa && data.qa.math_consistent === false) {
            warnings.push("QA flag: math_consistent is false — verify score before saving.");
        }
        if (data.qa && Array.isArray(data.questions) && data.questions.length) {
            const sum = data.questions.reduce((s, q) => s + (Number(q.marks_awarded) || 0), 0);
            if (data.qa.raw_total_awarded != null) {
                const qaAwarded = Number(data.qa.raw_total_awarded);
                if (!Number.isNaN(qaAwarded) && Math.abs(qaAwarded - sum) > 0.01) {
                    warnings.push("Question marks_awarded sum does not match qa.raw_total_awarded.");
                }
            }
        }
        return { data, error: null, warnings };
    };
    G.summaryFromParsed = function (data) {
        if (!data) return "";
        if (typeof data.feedback_summary === "string") return data.feedback_summary;
        return "";
    };
    G.scoreFromParsed = function (data) {
        if (!data || data.score == null) return null;
        const n = parseInt(String(data.score), 10);
        return Number.isNaN(n) ? null : n;
    };
})(window);
