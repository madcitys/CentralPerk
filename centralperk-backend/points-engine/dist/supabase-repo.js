import { memberDb, pointsDb, rewardDb, pointsSupabase } from "./supabase-client.js";
import { normalizeTierRules } from "./core/utils.js";
import { config } from "./config.js";
function mapMember(row) {
    return {
        id: Number(row.id ?? row.member_id),
        member_number: row.member_number,
        email: row.email,
        points_balance: Math.max(0, Math.floor(Number(row.points_balance) || 0)),
        tier: row.tier,
    };
}
function parseNumericId(value) {
    if (typeof value === "number" && Number.isInteger(value) && value >= 0)
        return value;
    if (typeof value !== "string")
        return null;
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed))
        return null;
    return Number(trimmed);
}
function parseUuid(value) {
    if (typeof value !== "string")
        return null;
    const trimmed = value.trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)) {
        return null;
    }
    return trimmed;
}
function extractMissingColumn(error) {
    const message = String(error?.message ?? "");
    const schemaCacheMatch = message.match(/could not find the '([^']+)' column/i);
    if (schemaCacheMatch?.[1])
        return schemaCacheMatch[1];
    const relationMatch = message.match(/column\s+[a-z0-9_."]+\.([a-z0-9_]+)\s+does not exist/i);
    if (relationMatch?.[1])
        return relationMatch[1];
    return null;
}
function errorMessage(error) {
    return String(error?.message ?? error ?? "");
}
function isLegacyTransactionCompatibilityError(error) {
    const message = errorMessage(error).toLowerCase();
    return (message.includes('relation "public.member_badge_awards" does not exist') ||
        message.includes('relation "public.badge_definitions" does not exist') ||
        message.includes('relation "public.notification_outbox" does not exist'));
}
const CACHE_TTL_MS = 60_000;
let tierRulesCache = null;
const rewardCatalogIdCache = new Map();
async function findMember(identifier, fallbackEmail) {
    const trimmed = identifier.trim();
    const normalizedEmail = String(fallbackEmail ?? trimmed).trim();
    if (trimmed) {
        const memberNumberLookup = await memberDb
            .from("loyalty_members")
            .select("id,member_id,member_number,email,points_balance,tier")
            .eq("member_number", trimmed)
            .limit(1)
            .maybeSingle();
        if (memberNumberLookup.error)
            throw memberNumberLookup.error;
        if (memberNumberLookup.data)
            return mapMember(memberNumberLookup.data);
    }
    const numericMemberId = parseNumericId(trimmed);
    if (numericMemberId !== null) {
        const memberIdLookup = await memberDb
            .from("loyalty_members")
            .select("id,member_id,member_number,email,points_balance,tier")
            .eq("member_id", numericMemberId)
            .limit(1)
            .maybeSingle();
        if (memberIdLookup.error)
            throw memberIdLookup.error;
        if (memberIdLookup.data)
            return mapMember(memberIdLookup.data);
    }
    if (normalizedEmail) {
        const emailLookup = await memberDb
            .from("loyalty_members")
            .select("id,member_id,member_number,email,points_balance,tier")
            .ilike("email", normalizedEmail)
            .limit(1)
            .maybeSingle();
        if (emailLookup.error)
            throw emailLookup.error;
        if (emailLookup.data)
            return mapMember(emailLookup.data);
    }
    return null;
}
async function resolveRewardCatalogId(rewardCatalogId) {
    if (rewardCatalogId === undefined || rewardCatalogId === null)
        return null;
    const numericId = parseNumericId(rewardCatalogId);
    if (numericId !== null)
        return numericId;
    const rewardId = String(rewardCatalogId).trim();
    if (!rewardId)
        return null;
    const cached = rewardCatalogIdCache.get(rewardId);
    if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS)
        return cached.value;
    const tables = ["rewards_catalog", "reward_catalog"];
    let resolved = null;
    for (const table of tables) {
        const lookup = await rewardDb.from(table).select("id").eq("reward_id", rewardId).limit(1).maybeSingle();
        if (!lookup.error && lookup.data) {
            resolved = parseNumericId(lookup.data.id) ?? null;
            break;
        }
    }
    rewardCatalogIdCache.set(rewardId, { loadedAt: Date.now(), value: resolved });
    return resolved;
}
async function fetchTierRules() {
    if (tierRulesCache && Date.now() - tierRulesCache.loadedAt < CACHE_TTL_MS) {
        return tierRulesCache.rules;
    }
    const { data, error } = await pointsDb
        .from("points_tiers")
        .select("tier_label,min_points,is_active")
        .eq("is_active", true)
        .order("min_points", { ascending: false });
    const rules = error ? normalizeTierRules(null) : normalizeTierRules(data);
    tierRulesCache = { loadedAt: Date.now(), rules };
    return rules;
}
async function insertLedger(entry) {
    let payload = { ...entry };
    let lastError = null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
        const { data, error } = await pointsDb.from("points_ledger").insert(payload).select("id").single();
        if (!error)
            return data;
        lastError = error;
        const missingColumn = extractMissingColumn(error);
        if (!missingColumn || !(missingColumn in payload))
            throw error;
        const { [missingColumn]: _removed, ...rest } = payload;
        payload = rest;
    }
    throw lastError;
}
async function insertTransaction(entry) {
    let payload = { ...entry };
    let lastError = null;
    for (let attempt = 0; attempt < 10; attempt += 1) {
        const { error } = await pointsDb.from("loyalty_transactions").insert(payload);
        if (!error)
            return;
        lastError = error;
        const missingColumn = extractMissingColumn(error);
        if (!missingColumn)
            throw error;
        if (missingColumn === "reason" && "reason" in payload) {
            const { reason, ...rest } = payload;
            payload = "description" in rest ? rest : { ...rest, description: reason };
            continue;
        }
        if (!(missingColumn in payload))
            throw error;
        const { [missingColumn]: _removed, ...rest } = payload;
        payload = rest;
    }
    throw lastError;
}
async function loadLedgerHistory(memberId) {
    const { data, error } = await pointsDb
        .from("points_ledger")
        .select("id,member_id,change_type,points_delta,balance_after,reason,reward_catalog_id,promotion_campaign_id,transaction_id,expiry_date,expired_at,source,created_at")
        .eq("member_id", memberId)
        .order("created_at", { ascending: false })
        .limit(200);
    if (error)
        throw error;
    return (data || []).map((row) => ({
        id: row.id,
        member_id: row.member_id,
        transaction_type: row.change_type,
        points: row.points_delta,
        reason: row.reason,
        reward_catalog_id: row.reward_catalog_id,
        promotion_campaign_id: row.promotion_campaign_id,
        transaction_id: row.transaction_id,
        expiry_date: row.expiry_date,
        transaction_date: row.created_at,
        created_at: row.created_at,
        balance_after: row.balance_after,
        source: row.source,
        receipt_id: null,
    }));
}
function historyRowTimestamp(row) {
    const value = row.transaction_date ?? row.created_at;
    const timestamp = new Date(String(value || 0)).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
}
function historyRowReason(row) {
    return String(row.reason ?? row.description ?? "").trim().toLowerCase();
}
function historyRowType(row) {
    return String(row.transaction_type ?? row.change_type ?? row.type ?? "").trim().toUpperCase();
}
function historyRowPoints(row) {
    return Math.trunc(Number(row.points ?? row.points_delta ?? 0) || 0);
}
function isDuplicateHistoryRow(left, right) {
    if (historyRowType(left) !== historyRowType(right))
        return false;
    if (historyRowPoints(left) !== historyRowPoints(right))
        return false;
    if (historyRowReason(left) !== historyRowReason(right))
        return false;
    const leftReceipt = String(left.receipt_id ?? "").trim();
    const rightReceipt = String(right.receipt_id ?? "").trim();
    if (leftReceipt && rightReceipt && leftReceipt === rightReceipt)
        return true;
    return Math.abs(historyRowTimestamp(left) - historyRowTimestamp(right)) <= 5_000;
}
async function loadMemberHistory(identifier, fallbackEmail) {
    const member = await findMember(identifier, fallbackEmail);
    if (!member)
        return { member: null, transactions: [] };
    const [{ data, error }, ledgerHistory] = await Promise.all([
        pointsDb
            .from("loyalty_transactions")
            .select("*")
            .eq("member_id", member.id)
            .order("transaction_date", { ascending: false })
            .limit(200),
        loadLedgerHistory(member.id),
    ]);
    if (error && !ledgerHistory.length)
        throw error;
    const transactionRows = (data || []).map((row) => ({
        ...row,
        transaction_date: row.transaction_date ?? row.created_at,
    }));
    for (const row of ledgerHistory) {
        const duplicate = transactionRows.some((existing) => isDuplicateHistoryRow(existing, row));
        if (!duplicate) {
            transactionRows.push(row);
        }
    }
    transactionRows.sort((left, right) => new Date(String(right.transaction_date || right.created_at || 0)).getTime() -
        new Date(String(left.transaction_date || left.created_at || 0)).getTime());
    return {
        member,
        transactions: transactionRows.slice(0, 200),
    };
}
async function updateMemberBalance(memberId, newBalance, newTier) {
    const { error } = await memberDb
        .from("loyalty_members")
        .update({ points_balance: newBalance, tier: newTier })
        .eq("id", memberId);
    if (error)
        throw error;
}
async function syncSharedMemberBalanceIfNeeded(memberId, newBalance, newTier) {
    const { data, error } = await memberDb
        .from("loyalty_members")
        .select("points_balance,tier")
        .eq("id", memberId)
        .limit(1)
        .maybeSingle();
    if (error)
        throw error;
    const currentBalance = Math.max(0, Math.floor(Number(data?.points_balance) || 0));
    const currentTier = String(data?.tier || "");
    if (currentBalance === newBalance && currentTier === newTier)
        return;
    await updateMemberBalance(memberId, newBalance, newTier);
}
async function ensureRedeemablePointLots(member) {
    const { data, error } = await pointsDb
        .from("points_lots")
        .select("id,remaining_points,expired_at")
        .eq("member_id", member.id);
    if (error)
        throw error;
    const remaining = (data || []).reduce((sum, row) => {
        if (row?.expired_at)
            return sum;
        return sum + Math.max(0, Math.floor(Number(row?.remaining_points) || 0));
    }, 0);
    const balanceGap = Math.max(0, Math.floor(member.points_balance - remaining));
    if (balanceGap <= 0)
        return;
    const seedLot = {
        member_id: member.id,
        source_transaction_id: null,
        original_points: balanceGap,
        remaining_points: balanceGap,
        earned_at: new Date().toISOString(),
        expiry_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    };
    const { error: insertError } = await pointsDb.from("points_lots").insert(seedLot);
    if (insertError)
        throw insertError;
}
async function rollbackMutation(member, ledgerId) {
    await Promise.allSettled([
        ledgerId ? pointsDb.from("points_ledger").delete().eq("id", ledgerId) : Promise.resolve(),
        memberDb.from("loyalty_members").update({ points_balance: member.points_balance, tier: member.tier }).eq("id", member.id),
    ]);
}
async function insertAward(member, input, newBalance, newTier) {
    const ledgerEntry = {
        member_id: member.id,
        change_type: input.transactionType,
        points_delta: Math.max(0, Math.floor(input.points)),
        balance_after: newBalance,
        reason: input.reason,
        expiry_date: input.transactionType === "PURCHASE"
            ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
            : null,
        promotion_campaign_id: null,
        reward_catalog_id: null,
        source: "points-engine",
    };
    const ledger = await insertLedger(ledgerEntry);
    let skippedTransactionInsert = false;
    try {
        await insertTransaction({
            member_id: member.id,
            transaction_type: input.transactionType,
            points: Math.max(0, Math.floor(input.points)),
            amount_spent: input.amountSpent ?? 0,
            reason: input.reason,
            transaction_id: Math.trunc(Date.now() * 10),
            product_code: input.productCode ?? null,
            product_category: input.productCategory ?? null,
            expiry_date: ledgerEntry.expiry_date,
            points_ledger_id: ledger.id,
        });
    }
    catch (error) {
        if (!isLegacyTransactionCompatibilityError(error)) {
            await rollbackMutation(member, ledger.id);
            throw error;
        }
        skippedTransactionInsert = true;
        console.warn("Skipping loyalty_transactions award insert due to legacy dependency:", errorMessage(error));
    }
    if (skippedTransactionInsert) {
        try {
            await updateMemberBalance(member.id, newBalance, newTier);
        }
        catch (error) {
            await rollbackMutation(member, ledger.id);
            throw error;
        }
    }
    else if (config.useSharedSupabase) {
        try {
            await syncSharedMemberBalanceIfNeeded(member.id, newBalance, newTier);
        }
        catch (error) {
            await rollbackMutation(member, ledger.id);
            throw error;
        }
    }
    else {
        try {
            await updateMemberBalance(member.id, newBalance, newTier);
        }
        catch (error) {
            await rollbackMutation(member, ledger.id);
            throw error;
        }
    }
    return { ...ledgerEntry, id: ledger.id };
}
async function insertRedemption(member, input, newBalance, newTier) {
    await ensureRedeemablePointLots(member);
    const rewardCatalogIdPromise = resolveRewardCatalogId(input.rewardCatalogId);
    const rewardCatalogId = await rewardCatalogIdPromise;
    const promotionCampaignId = parseUuid(input.promotionCampaignId);
    const ledgerEntry = {
        member_id: member.id,
        change_type: input.transactionType ?? "REDEEM",
        points_delta: -Math.abs(Math.floor(input.points)),
        balance_after: newBalance,
        reason: input.reason,
        promotion_campaign_id: promotionCampaignId,
        reward_catalog_id: rewardCatalogId,
        source: "points-engine",
    };
    const ledger = await insertLedger(ledgerEntry);
    let skippedTransactionInsert = false;
    try {
        await insertTransaction({
            member_id: member.id,
            transaction_type: input.transactionType ?? "REDEEM",
            points: -Math.abs(Math.floor(input.points)),
            reason: input.reason,
            transaction_id: Math.trunc(Date.now() * 10),
            receipt_id: input.receiptId ?? null,
            promotion_campaign_id: ledgerEntry.promotion_campaign_id,
            reward_catalog_id: ledgerEntry.reward_catalog_id,
            points_ledger_id: ledger.id,
        });
    }
    catch (error) {
        if (!isLegacyTransactionCompatibilityError(error)) {
            await rollbackMutation(member, ledger.id);
            throw error;
        }
        skippedTransactionInsert = true;
        console.warn("Skipping loyalty_transactions redemption insert due to legacy dependency:", errorMessage(error));
    }
    if (skippedTransactionInsert) {
        try {
            await updateMemberBalance(member.id, newBalance, newTier);
        }
        catch (error) {
            await rollbackMutation(member, ledger.id);
            throw error;
        }
    }
    else if (config.useSharedSupabase) {
        try {
            await syncSharedMemberBalanceIfNeeded(member.id, newBalance, newTier);
        }
        catch (error) {
            await rollbackMutation(member, ledger.id);
            throw error;
        }
    }
    else {
        try {
            await updateMemberBalance(member.id, newBalance, newTier);
        }
        catch (error) {
            await rollbackMutation(member, ledger.id);
            throw error;
        }
    }
    void (async () => {
        try {
            const { error } = await pointsSupabase.rpc("loyalty_consume_points_fifo", {
                p_member_id: member.id,
                p_points_to_consume: Math.abs(Math.floor(input.points)),
            });
            if (error)
                console.warn("FIFO point consumption skipped:", error.message);
        }
        catch (error) {
            console.warn("FIFO point consumption skipped:", error instanceof Error ? error.message : error);
        }
    })();
    return { ...ledgerEntry, id: ledger.id };
}
async function runExpiryJob() {
    const { data, error } = await pointsSupabase.rpc("points_run_nightly_expiry");
    if (error)
        throw error;
    const result = Array.isArray(data) && data.length > 0 ? data[0] : data;
    return {
        membersProcessed: Number(result?.members_processed ?? 0),
        pointsExpired: Number(result?.points_expired ?? result ?? 0),
    };
}
export const supabaseRepo = {
    findMember,
    fetchTierRules,
    insertAward,
    insertRedemption,
    runExpiryJob,
};
export { loadMemberHistory };
