"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanString = cleanString;
exports.numberValue = numberValue;
exports.normalizeTier = normalizeTier;
exports.nowIso = nowIso;
exports.hasTemplateToken = hasTemplateToken;
function cleanString(value) {
    const text = Array.isArray(value) ? value[0] : value;
    const normalized = typeof text === "string" ? text.trim() : "";
    return normalized.includes("{{") || normalized.includes("}}") ? "" : normalized;
}
function numberValue(value, fallback = 0) {
    const next = Number(value);
    return Number.isFinite(next) ? next : fallback;
}
function normalizeTier(points) {
    if (points >= 1500)
        return "Platinum";
    if (points >= 750)
        return "Gold";
    if (points >= 250)
        return "Silver";
    return "Bronze";
}
function nowIso() {
    return new Date().toISOString();
}
function hasTemplateToken(value) {
    return typeof value === "string" && (value.includes("{{") || value.includes("}}"));
}
//# sourceMappingURL=utils.js.map