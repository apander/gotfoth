(function (w) {
    const G = w.GF;

    function apiPath(path) {
        const base = G.API_BASE != null ? String(G.API_BASE) : "";
        return `${base}${path}`;
    }

    G.authMe = async function () {
        const res = await fetch(apiPath("/api/auth/me"), {
            method: "GET",
            credentials: "include",
        });
        if (!res.ok) throw new Error("Auth check failed: " + res.status);
        return res.json();
    };

    G.authLogin = async function (username, password, rememberMe) {
        const res = await fetch(apiPath("/api/auth/login"), {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password, rememberMe: !!rememberMe }),
        });
        const payload = await res.json().catch(function () {
            return {};
        });
        if (!res.ok) {
            const msg = payload && payload.error ? payload.error : "Login failed.";
            throw new Error(msg);
        }
        return payload;
    };

    G.authLogout = async function () {
        await fetch(apiPath("/api/auth/logout"), {
            method: "POST",
            credentials: "include",
        });
    };
})(window);
