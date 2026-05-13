const BASE_URL = process.env.CAMPAIGN_SERVICE_URL ||
    process.env.NEXT_PUBLIC_CAMPAIGN_SERVICE_URL ||
    "http://127.0.0.1:4002";
function fullUrl(path) {
    return `${BASE_URL.replace(/\/+$/, "")}${path}`;
}
export async function fetchActiveMultiplier(payload) {
    try {
        const res = await fetch(fullUrl("/campaigns/multiplier"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        if (!res.ok)
            return null;
        const json = await res.json();
        return json?.result;
    }
    catch {
        return null;
    }
}
