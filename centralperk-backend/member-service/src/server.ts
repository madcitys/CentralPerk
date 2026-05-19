import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { config } from "./config.js";
import { supabase } from "./supabase-client.js";

const resolveQuerySchema = z.object({
  identifier: z.string().trim().min(1).max(120).optional(),
  fallbackEmail: z.string().trim().email().optional(),
});

const profileSchema = z.object({
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().max(40).optional(),
  birthdate: z.string().trim().max(40).optional(),
  address: z.string().trim().max(500).nullable().optional(),
  profilePhotoUrl: z.string().trim().max(1000).nullable().optional(),
});

const profilePatchSchema = profileSchema.partial().extend({
  fallbackEmail: z.string().trim().email().max(254).optional(),
});

const duplicatesQuerySchema = z.object({
  email: z.string().trim().email().max(254).optional(),
  phone: z.string().trim().max(40).optional(),
});

const communicationPreferenceSchema = z.object({
  sms: z.boolean().optional(),
  email: z.boolean().optional(),
  push: z.boolean().optional(),
  promotionalOptIn: z.boolean().optional(),
  frequency: z.enum(["daily", "weekly", "never"]).optional(),
});

const loginActivitySchema = z.object({
  channel: z.enum(["web", "mobile", "kiosk", "system"]).default("web"),
  source: z.string().trim().max(80).default("customer_portal"),
});

const reengagementActionSchema = z.object({
  memberIdentifier: z.string().trim().min(1).max(120),
  fallbackEmail: z.string().trim().email().optional(),
  riskLevel: z.enum(["Low", "Medium", "High"]),
  actionType: z.string().trim().min(1).max(80),
  recommendedAction: z.string().trim().min(1).max(500),
  actionNotes: z.string().trim().max(1000).optional(),
  status: z.enum(["planned", "sent", "completed", "dismissed"]).default("planned"),
  followUpDueAt: z.string().trim().max(80).optional(),
});

const reengagementPatchSchema = z.object({
  status: z.enum(["planned", "sent", "completed", "dismissed"]).optional(),
  success: z.boolean().nullable().optional(),
  successMetric: z.string().trim().max(200).optional(),
  sentAt: z.string().trim().max(80).nullable().optional(),
  completedAt: z.string().trim().max(80).nullable().optional(),
});

const balanceSchema = z.object({
  pointsBalance: z.number().int().min(0).max(1_000_000_000),
  tier: z.string().trim().min(1).max(80),
});

const socialShareSchema = z.object({
  memberIdentifier: z.string().trim().min(1).max(120),
  referralCode: z.string().trim().max(120).optional(),
  channel: z.string().trim().min(1).max(40),
  achievement: z.string().trim().min(1).max(240),
  tier: z.string().trim().max(80).optional(),
  badgeLabel: z.string().trim().max(120).optional(),
  shareText: z.string().trim().max(500).optional(),
  destinationUrl: z.string().trim().max(1000).optional(),
});

const referralSchema = z.object({
  referrerMemberId: z.string().trim().min(1).max(120),
  refereeEmail: z.string().trim().email().max(254),
});

const referralApplySchema = z.object({
  referralCode: z.string().trim().min(1).max(80),
  refereeMemberId: z.string().trim().min(1).max(120),
  refereeEmail: z.string().trim().email().max(254),
});

const feedbackSchema = z.object({
  memberId: z.string().trim().min(1).max(120),
  memberName: z.string().trim().min(1).max(180),
  category: z.enum(["points", "rewards", "service", "app"]),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().min(1).max(500),
  contactOptIn: z.boolean().default(false),
  contactInfo: z.string().trim().max(254).nullable().optional(),
});

const birthdaySettingsSchema = z.object({
  amounts: z.object({
    Bronze: z.number().int().min(0).max(1_000_000),
    Silver: z.number().int().min(0).max(1_000_000),
    Gold: z.number().int().min(0).max(1_000_000),
  }),
  releaseTiming: z.enum(["first_day_of_birthday_month", "birthday_date"]),
  fulfillmentMode: z.enum(["manual_claim", "auto_credit"]),
  claimWindow: z.enum(["birthday_month_only", "birthday_week"]),
});

const birthdayClaimSchema = z.object({
  memberId: z.string().trim().min(1).max(120),
  fallbackEmail: z.string().trim().email().optional(),
  pointsAwarded: z.number().int().min(0).max(1_000_000).default(0),
  voucherCode: z.string().trim().max(120).nullable().optional(),
  badgeLabel: z.string().trim().max(120).nullable().optional(),
});

const surveyQuestionInputSchema = z.object({
  id: z.string().trim().max(120).optional(),
  prompt: z.string().trim().min(1).max(500),
  type: z.enum(["multiple-choice", "rating", "free-text"]),
  options: z.array(z.string().trim().min(1).max(160)).optional(),
});

const surveyInputSchema = z.object({
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().max(1000),
  segment: z.string().trim().max(80).default("All Members"),
  bonusPoints: z.number().int().min(0).max(1_000_000),
  status: z.enum(["draft", "live", "closed"]).default("draft"),
  questions: z.array(surveyQuestionInputSchema).default([]),
});

const surveyResponseSchema = z.object({
  memberIdentifier: z.string().trim().min(1).max(120),
  answers: z.record(z.string(), z.union([z.string(), z.number()])),
  bonusPoints: z.number().int().min(0).max(1_000_000).optional(),
});

const engagementSettingsSchema = z.object({
  showName: z.boolean().optional(),
  showReferralCode: z.boolean().optional(),
  publicProfile: z.boolean().optional(),
});

function tableMissing(error: unknown, table: string) {
  const message = String((error as { message?: unknown; details?: unknown; hint?: unknown })?.message ?? "").toLowerCase();
  return message.includes(table.toLowerCase()) && (message.includes("does not exist") || message.includes("schema cache"));
}

function missingColumn(error: unknown) {
  const code = String((error as { code?: unknown })?.code ?? "");
  const message = String((error as { message?: unknown; details?: unknown })?.message ?? "").toLowerCase();
  return code === "42703" || (message.includes("column") && message.includes("does not exist"));
}

function duplicateMemberNumber(error: unknown) {
  const code = String((error as { code?: unknown })?.code ?? "");
  const message = String((error as { message?: unknown; details?: unknown })?.message ?? "").toLowerCase();
  return code === "23505" && message.includes("member_number");
}

function generatedIdTypeMismatch(error: unknown) {
  const code = String((error as { code?: unknown })?.code ?? "");
  const message = String((error as { message?: unknown })?.message ?? "").toLowerCase();
  return code === "22P02" && message.includes("invalid input syntax for type bigint");
}

async function insertLifecycleRow(table: string, payload: Record<string, unknown>) {
  let result = await supabase.from(table).insert(payload).select("*").single();
  if (result.error && payload.id !== undefined && generatedIdTypeMismatch(result.error)) {
    const { id: _id, ...payloadWithoutId } = payload;
    result = await supabase.from(table).insert(payloadWithoutId).select("*").single();
  }
  return result;
}

function memberSelect() {
  return "id,member_id,member_number,first_name,last_name,email,phone,birthdate,points_balance,tier,enrollment_date,address,profile_photo_url";
}

function memberBaseSelect() {
  return "id,member_id,member_number,first_name,last_name,email,points_balance,tier";
}

const defaultBirthdaySettings = {
  amounts: { Bronze: 100, Silver: 500, Gold: 1000 },
  releaseTiming: "first_day_of_birthday_month",
  fulfillmentMode: "auto_credit",
  claimWindow: "birthday_month_only",
};

const defaultEngagementPrivacySettings = {
  showName: true,
  showReferralCode: true,
  publicProfile: true,
};

async function maybeSingleMember(buildQuery: (columns: string) => any) {
  const full = await buildQuery(memberSelect());
  if (!full.error || !missingColumn(full.error)) return full;
  return buildQuery(memberBaseSelect());
}

async function listMembers(buildQuery: (columns: string) => any) {
  const full = await buildQuery(memberSelect());
  if (!full.error || !missingColumn(full.error)) return full;
  return buildQuery(memberBaseSelect());
}

function mapMember(row: any) {
  return {
    id: Number(row.id ?? row.member_id),
    memberId: Number(row.member_id ?? row.id),
    memberNumber: String(row.member_number ?? row.member_id ?? row.id ?? ""),
    member_number: String(row.member_number ?? row.member_id ?? row.id ?? ""),
    email: row.email ? String(row.email) : null,
    firstName: row.first_name ? String(row.first_name) : null,
    lastName: row.last_name ? String(row.last_name) : null,
    first_name: row.first_name ? String(row.first_name) : null,
    last_name: row.last_name ? String(row.last_name) : null,
    phone: row.phone ? String(row.phone) : null,
    birthdate: row.birthdate ? String(row.birthdate) : null,
    enrollment_date: row.enrollment_date ? String(row.enrollment_date) : null,
    address: row.address ? String(row.address) : null,
    profile_photo_url: row.profile_photo_url ? String(row.profile_photo_url) : null,
    pointsBalance: Math.max(0, Math.floor(Number(row.points_balance ?? 0))),
    points_balance: Math.max(0, Math.floor(Number(row.points_balance ?? 0))),
    tier: String(row.tier || "Bronze"),
    lastActivityAt: row.last_activity_at ? String(row.last_activity_at) : null,
    last_activity_at: row.last_activity_at ? String(row.last_activity_at) : null,
  };
}

function buildReferralCode(memberNumber: string) {
  return `REF${memberNumber.replace(/\D/g, "").slice(-6).padStart(6, "0")}`;
}

function mapReferral(row: any) {
  return {
    id: String(row.id ?? ""),
    referrerMemberId: String(row.referrer_member_number ?? row.referrer_member_id ?? ""),
    referrerCode: String(row.referrer_code ?? ""),
    refereeEmail: String(row.referee_email ?? ""),
    refereeMemberId: row.referee_member_number ? String(row.referee_member_number) : undefined,
    status: String(row.status || "pending") === "joined" ? "joined" : "pending",
    createdAt: String(row.created_at ?? new Date().toISOString()),
    convertedAt: row.converted_at ? String(row.converted_at) : undefined,
    bonusAwarded: Boolean(row.bonus_awarded),
  };
}

function mapFeedback(row: any) {
  return {
    id: String(row.id ?? ""),
    memberId: String(row.member_number ?? row.member_id ?? ""),
    memberName: String(row.member_name ?? ""),
    category: String(row.category ?? "service"),
    rating: Math.max(1, Math.min(5, Number(row.rating || 5))),
    comment: String(row.comment ?? ""),
    contactOptIn: Boolean(row.contact_opt_in),
    contactInfo: row.contact_info ? String(row.contact_info) : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function mapBirthdaySettings(row: any) {
  const amounts = row?.amounts && typeof row.amounts === "object" ? row.amounts : defaultBirthdaySettings.amounts;
  return {
    amounts: {
      Bronze: Math.max(0, Number(amounts.Bronze ?? defaultBirthdaySettings.amounts.Bronze) || 0),
      Silver: Math.max(0, Number(amounts.Silver ?? defaultBirthdaySettings.amounts.Silver) || 0),
      Gold: Math.max(0, Number(amounts.Gold ?? defaultBirthdaySettings.amounts.Gold) || 0),
    },
    releaseTiming:
      row?.release_timing === "birthday_date" ? "birthday_date" : defaultBirthdaySettings.releaseTiming,
    fulfillmentMode: row?.fulfillment_mode === "manual_claim" ? "manual_claim" : defaultBirthdaySettings.fulfillmentMode,
    claimWindow: row?.claim_window === "birthday_week" ? "birthday_week" : defaultBirthdaySettings.claimWindow,
  };
}

function mapShareEvent(row: any, member?: any) {
  const fullName = `${String(member?.first_name ?? "").trim()} ${String(member?.last_name ?? "").trim()}`.trim();
  return {
    id: String(row.id ?? ""),
    memberId: String(member?.member_number ?? member?.member_id ?? row.member_id ?? ""),
    memberName: fullName || String(member?.member_number ?? row.member_id ?? "Member"),
    tier: String(row.tier_at_share ?? member?.tier ?? "Bronze"),
    channel: String(row.channel ?? "facebook"),
    achievement: String(row.achievement ?? "Shared achievement"),
    referralCode: String(row.referral_code ?? ""),
    conversions: Math.max(0, Number(row.conversion_count ?? 0)),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function normalizeSegment(value: string | null | undefined) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "bronze") return "Bronze";
  if (raw === "silver") return "Silver";
  if (raw === "gold") return "Gold";
  if (raw === "high value") return "High Value";
  if (raw === "inactive 60+ days") return "Inactive 60+ Days";
  return "All Members";
}

function normalizeChallengeType(value: string | null | undefined) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "points-earned") return "points-earned";
  if (raw === "survey-completion") return "survey-completion";
  return "purchase-count";
}

function challengeUnitLabel(type: string) {
  if (type === "points-earned") return "points";
  if (type === "survey-completion") return "surveys";
  return "purchases";
}

function normalizeQuestionType(value: string | null | undefined) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "rating") return "rating";
  if (raw === "free-text") return "free-text";
  return "multiple-choice";
}

function questionTypeToColumn(value: string | null | undefined) {
  const normalized = normalizeQuestionType(value);
  return normalized === "multiple-choice" ? "multiple-choice" : normalized;
}

function formatMemberName(member?: any | null, fallbackMemberId?: number | string) {
  const fullName = `${member?.first_name || ""} ${member?.last_name || ""}`.trim();
  if (fullName) return fullName;
  if (member?.member_number) return String(member.member_number);
  const fallback = String(member?.member_id || fallbackMemberId || "").trim();
  return fallback ? `Member ${fallback}` : "Member";
}

function normalizePrivacySettings(value: unknown) {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    showName: raw.showName === undefined ? defaultEngagementPrivacySettings.showName : Boolean(raw.showName),
    showReferralCode:
      raw.showReferralCode === undefined ? defaultEngagementPrivacySettings.showReferralCode : Boolean(raw.showReferralCode),
    publicProfile:
      raw.publicProfile === undefined ? defaultEngagementPrivacySettings.publicProfile : Boolean(raw.publicProfile),
  };
}

function normalizeSurveyDefinition(survey: any, questions: any[] = [], responses: any[] = []) {
  return {
    id: String(survey.id),
    title: String(survey.title || "Survey"),
    description: String(survey.description || ""),
    segment: normalizeSegment(survey.segment),
    bonusPoints: Math.max(0, Number(survey.bonus_points ?? survey.bonusPoints ?? 0)),
    status: survey.status === "live" || survey.status === "closed" ? survey.status : "draft",
    createdAt: String(survey.created_at ?? survey.createdAt ?? new Date().toISOString()),
    questions: questions.map((row) => ({
      id: String(row.id),
      prompt: String(row.prompt || ""),
      type: normalizeQuestionType(row.question_type ?? row.type),
      options: Array.isArray(row.options) ? row.options.map((item: unknown) => String(item)) : undefined,
    })),
    responses: responses.map((row) => ({
      memberId: String(row.member_id ?? row.memberId ?? ""),
      memberName: String(row.member_name ?? row.memberName ?? row.member_id ?? row.memberId ?? "Member"),
      answers: row.answers || {},
      submittedAt: String(row.submitted_at ?? row.submittedAt ?? new Date().toISOString()),
    })),
  };
}

async function findMember(identifier: string, fallbackEmail?: string) {
  const trimmed = identifier.trim();

  const byNumber = await maybeSingleMember((columns) =>
    supabase.from("loyalty_members").select(columns).eq("member_number", trimmed).limit(1).maybeSingle()
  );
  if (byNumber.error) throw byNumber.error;
  if (byNumber.data) return byNumber.data;

  if (Number.isFinite(Number(trimmed))) {
    const byId = await maybeSingleMember((columns) =>
      supabase.from("loyalty_members").select(columns).eq("id", Number(trimmed)).limit(1).maybeSingle()
    );
    if (byId.error) throw byId.error;
    if (byId.data) return byId.data;
  }

  const email = fallbackEmail || trimmed;
  const byEmail = await maybeSingleMember((columns) =>
    supabase.from("loyalty_members").select(columns).ilike("email", email).limit(1).maybeSingle()
  );
  if (byEmail.error) throw byEmail.error;
  return byEmail.data;
}

async function findMemberByEmailOrPhone(email?: string, phone?: string) {
  const normalizedEmail = String(email || "").trim();
  const normalizedPhone = String(phone || "").trim();
  if (!normalizedEmail && !normalizedPhone) return [];

  const filters: string[] = [];
  if (normalizedEmail) filters.push(`email.ilike.${normalizedEmail}`);
  if (normalizedPhone) filters.push(`phone.eq.${normalizedPhone}`);

  const result = await listMembers((columns) =>
    supabase.from("loyalty_members").select(columns).or(filters.join(",")).limit(10)
  );
  if (!result.error || !missingColumn(result.error) || !normalizedEmail) return result;

  return listMembers((columns) =>
    supabase.from("loyalty_members").select(columns).ilike("email", normalizedEmail).limit(10)
  );
}

function profilePayload(body: z.infer<typeof profileSchema> | z.infer<typeof profilePatchSchema>, includeDefaults = false) {
  const payload: Record<string, unknown> = {};
  if (body.firstName !== undefined) payload.first_name = body.firstName;
  if (body.lastName !== undefined) payload.last_name = body.lastName;
  if (body.email !== undefined) payload.email = body.email;
  if (body.phone !== undefined) payload.phone = body.phone || null;
  if (body.birthdate !== undefined) payload.birthdate = body.birthdate || null;
  if (body.address !== undefined) payload.address = body.address || null;
  if (body.profilePhotoUrl !== undefined) payload.profile_photo_url = body.profilePhotoUrl || null;
  if (includeDefaults) {
    payload.points_balance = 0;
    payload.tier = "Bronze";
  }
  return payload;
}

function createMemberNumber() {
  const timestampPart = String(Date.now()).slice(-10);
  const randomPart = String(Math.floor(Math.random() * 100)).padStart(2, "0");
  return `MEM-${timestampPart}${randomPart}`;
}

async function insertMemberProfile(body: z.infer<typeof profileSchema>) {
  const payload = profilePayload(body, true);
  payload.member_number = createMemberNumber();

  let insert = await supabase
    .from("loyalty_members")
    .insert([payload])
    .select(memberSelect())
    .single();
  if (insert.error && missingColumn(insert.error)) {
    insert = await supabase
      .from("loyalty_members")
      .insert([stripOptionalProfileColumns(payload)])
      .select(memberBaseSelect())
      .single();
  }
  return insert;
}

function stripOptionalProfileColumns(payload: Record<string, unknown>) {
  const clone = { ...payload };
  for (const column of ["phone", "birthdate", "address", "profile_photo_url"]) delete clone[column];
  return clone;
}

const STOP_WORDS = new Set([
  "about",
  "after",
  "all",
  "also",
  "and",
  "any",
  "are",
  "but",
  "can",
  "for",
  "from",
  "get",
  "have",
  "here",
  "how",
  "just",
  "like",
  "more",
  "not",
  "now",
  "our",
  "out",
  "points",
  "reward",
  "rewards",
  "that",
  "the",
  "this",
  "too",
  "use",
  "very",
  "was",
  "with",
  "would",
  "you",
  "your",
]);

function tokenizeFeedback(text: string) {
  return text
    .toLowerCase()
    .split(/[\W_]+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

function cosineSimilarity(a: Map<string, number>, b: Map<string, number>) {
  let dot = 0;
  let aMagnitude = 0;
  let bMagnitude = 0;

  for (const [term, value] of a.entries()) {
    dot += value * (b.get(term) ?? 0);
    aMagnitude += value * value;
  }

  for (const value of b.values()) {
    bMagnitude += value * value;
  }

  if (!aMagnitude || !bMagnitude) return 0;
  return dot / (Math.sqrt(aMagnitude) * Math.sqrt(bMagnitude));
}

function processFeedbackInsights(feedbackRows: any[]) {
  const sentimentSplit = { positive: 0, neutral: 0, negative: 0 };
  const documents = feedbackRows
    .map((row, index) => {
      const tokens = tokenizeFeedback(String(row.comment || ""));
      const rating = Math.max(1, Math.min(5, Number(row.rating || 5)));
      if (rating >= 4) sentimentSplit.positive += 1;
      else if (rating === 3) sentimentSplit.neutral += 1;
      else sentimentSplit.negative += 1;

      return {
        id: String(row.id ?? index),
        category: String(row.category || "service"),
        comment: String(row.comment || ""),
        tokens,
      };
    })
    .filter((document) => document.comment.trim().length > 0);

  const documentFrequency = new Map<string, number>();
  for (const document of documents) {
    for (const token of new Set(document.tokens)) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }
  }

  const documentCount = Math.max(1, documents.length);
  const vectors = documents.map((document) => {
    const termFrequency = new Map<string, number>();
    for (const token of document.tokens) {
      termFrequency.set(token, (termFrequency.get(token) ?? 0) + 1);
    }

    const vector = new Map<string, number>();
    for (const [term, count] of termFrequency.entries()) {
      const tf = count / Math.max(1, document.tokens.length);
      const idf = Math.log((documentCount + 1) / ((documentFrequency.get(term) ?? 0) + 1)) + 1;
      vector.set(term, Number((tf * idf).toFixed(6)));
    }
    return vector;
  });

  const wordScores = new Map<string, number>();
  for (const vector of vectors) {
    for (const [term, score] of vector.entries()) {
      wordScores.set(term, (wordScores.get(term) ?? 0) + score);
    }
  }

  const wordCloud = Array.from(wordScores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([word, weight]) => ({ word, weight: Number(weight.toFixed(4)) }));

  const grouped = new Set<number>();
  const similarFeedbackGroups: Array<{
    topic: string;
    count: number;
    averageSimilarity: number;
    feedbackIds: string[];
  }> = [];

  for (let index = 0; index < documents.length; index += 1) {
    if (grouped.has(index)) continue;

    const groupIndexes = [index];
    grouped.add(index);

    for (let candidate = index + 1; candidate < documents.length; candidate += 1) {
      if (grouped.has(candidate)) continue;
      const similarity = cosineSimilarity(vectors[index], vectors[candidate]);
      if (similarity >= 0.32) {
        groupIndexes.push(candidate);
        grouped.add(candidate);
      }
    }

    const groupTokens = new Map<string, number>();
    let similarityTotal = 0;
    let similarityPairs = 0;

    for (const groupIndex of groupIndexes) {
      for (const token of documents[groupIndex].tokens) {
        groupTokens.set(token, (groupTokens.get(token) ?? 0) + 1);
      }
    }

    for (let left = 0; left < groupIndexes.length; left += 1) {
      for (let right = left + 1; right < groupIndexes.length; right += 1) {
        similarityTotal += cosineSimilarity(vectors[groupIndexes[left]], vectors[groupIndexes[right]]);
        similarityPairs += 1;
      }
    }

    const topic =
      Array.from(groupTokens.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ??
      documents[index].category ??
      "feedback";

    similarFeedbackGroups.push({
      topic: topic.charAt(0).toUpperCase() + topic.slice(1),
      count: groupIndexes.length,
      averageSimilarity: Number((similarityPairs ? similarityTotal / similarityPairs : 1).toFixed(4)),
      feedbackIds: groupIndexes.map((groupIndex) => documents[groupIndex].id),
    });
  }

  const topTopics = similarFeedbackGroups
    .sort((a, b) => b.count - a.count || b.averageSimilarity - a.averageSimilarity)
    .slice(0, 3)
    .map((group) => ({ topic: group.topic, count: group.count }));

  return {
    sentimentSplit,
    wordCloud,
    topTopics,
    similarFeedbackGroups: similarFeedbackGroups.slice(0, 8),
    sourceCount: documents.length,
  };
}

export function createServer() {
  const app = Fastify({ logger: true });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof z.ZodError) {
      reply.code(400).send({
        ok: false,
        error: "validation_failed",
        details: error.flatten(),
      });
      return;
    }

    request.log.error(error);
    const statusCode = typeof error.statusCode === "number" ? error.statusCode : 500;
    reply.code(statusCode).send({
      ok: false,
      error: statusCode >= 500 ? "internal_error" : "request_error",
      message: error.message,
    });
  });

  app.get("/health", async () => ({
    status: "ok",
    service: config.serviceName,
    dbMode: config.dbMode,
    schema: config.schema,
  }));

  app.get("/health/db", async (_request, reply) => {
    const { error } = await supabase.from("loyalty_members").select("id").limit(1);
    if (error) {
      reply.code(503).send({
        status: "error",
        service: config.serviceName,
        dbMode: config.dbMode,
        schema: config.schema,
        database: { connected: false, check: "loyalty_members" },
      });
      return;
    }

    return {
      status: "ok",
      service: config.serviceName,
      dbMode: config.dbMode,
      schema: config.schema,
      database: { connected: true, check: "loyalty_members" },
    };
  });

  app.get("/members/resolve", async (request, reply) => {
    const query = resolveQuerySchema.parse(request.query);
    const identifier = query.identifier || query.fallbackEmail || "";
    if (!identifier) {
      reply.code(400).send({ ok: false, error: "identifier_required" });
      return;
    }
    const member = await findMember(identifier, query.fallbackEmail);
    if (!member) {
      reply.code(404).send({ ok: false, error: "member_not_found" });
      return;
    }
    return { ok: true, member: mapMember(member) };
  });

  app.get("/members/duplicates", async (request, reply) => {
    const query = duplicatesQuerySchema.parse(request.query);
    if (!query.email && !query.phone) {
      reply.code(400).send({ ok: false, error: "email_or_phone_required" });
      return;
    }

    const { data, error } = await findMemberByEmailOrPhone(query.email, query.phone);
    if (error) throw error;
    return { ok: true, members: (data || []).map(mapMember) };
  });

  app.get("/members/profile", async (request, reply) => {
    const query = duplicatesQuerySchema.extend({
      identifier: z.string().trim().max(120).optional(),
    }).parse(request.query);
    const identifier = query.identifier || query.email || query.phone || "";
    if (!identifier) {
      reply.code(400).send({ ok: false, error: "identifier_required" });
      return;
    }
    const member = await findMember(identifier, query.email);
    if (!member) {
      reply.code(404).send({ ok: false, error: "member_not_found" });
      return;
    }
    return { ok: true, member: mapMember(member) };
  });

  app.post("/members/profile", async (request, reply) => {
    const body = profileSchema.parse(request.body || {});
    let insert = await insertMemberProfile(body);
    for (let attempt = 0; attempt < 3 && insert.error && duplicateMemberNumber(insert.error); attempt += 1) {
      insert = await insertMemberProfile(body);
    }

    if (!insert.error && insert.data) {
      reply.code(201).send({ ok: true, member: mapMember(insert.data), recoveredFromExistingAuthSignup: false });
      return;
    }

    const message = String(insert.error?.message ?? "").toLowerCase();
    const isDuplicate = message.includes("duplicate") || message.includes("already exists") || message.includes("unique");
    if (!isDuplicate) throw insert.error;

    const existing = await findMemberByEmailOrPhone(body.email, body.phone);
    if (existing.error) throw existing.error;
    const existingMember = (existing.data || [])[0];
    if (!existingMember) throw insert.error;

    const repair: Record<string, unknown> = {};
    if (!existingMember.first_name && body.firstName) repair.first_name = body.firstName;
    if (!existingMember.last_name && body.lastName) repair.last_name = body.lastName;
    if (!existingMember.phone && body.phone) repair.phone = body.phone;
    if (!existingMember.birthdate && body.birthdate) repair.birthdate = body.birthdate;
    if (!existingMember.email && body.email) repair.email = body.email;

    if (Object.keys(repair).length === 0) {
      return { ok: true, member: mapMember(existingMember), recoveredFromExistingAuthSignup: false };
    }

    let repaired = await supabase
      .from("loyalty_members")
      .update(repair)
      .eq("id", Number(existingMember.id ?? existingMember.member_id))
      .select(memberSelect())
      .single();
    if (repaired.error && missingColumn(repaired.error)) {
      repaired = await supabase
        .from("loyalty_members")
        .update(stripOptionalProfileColumns(repair))
        .eq("id", Number(existingMember.id ?? existingMember.member_id))
        .select(memberBaseSelect())
        .single();
    }
    if (repaired.error) throw repaired.error;
    return { ok: true, member: mapMember(repaired.data), recoveredFromExistingAuthSignup: true };
  });

  app.get("/members", async (request) => {
    const query = request.query as Record<string, any>;
    const limit = Math.min(5000, Math.max(1, Math.floor(Number(query.limit) || 5000)));
    const { data, error } = await listMembers((columns) =>
      supabase.from("loyalty_members").select(columns).order("id", { ascending: true }).limit(limit)
    );
    if (error) throw error;
    return { ok: true, members: (data || []).map(mapMember) };
  });

  app.get("/members/:id", async (request, reply) => {
    const id = String((request.params as any).id || "").trim();
    const member = await findMember(id);
    if (!member) {
      reply.code(404).send({ ok: false, error: "member_not_found" });
      return;
    }
    return { ok: true, member: mapMember(member) };
  });

  app.patch("/members/:id/profile", async (request, reply) => {
    const id = String((request.params as any).id || "").trim();
    const body = profilePatchSchema.parse(request.body || {});
    if (!id) {
      reply.code(400).send({ ok: false, error: "member_id_required" });
      return;
    }

    let persistedEmail = body.email;
    const patch = profilePayload({ ...body, email: persistedEmail } as any, false);
    delete patch.fallbackEmail;
    if (Object.keys(patch).length === 0) {
      const member = await findMember(id, body.fallbackEmail);
      if (!member) {
        reply.code(404).send({ ok: false, error: "member_not_found" });
        return;
      }
      return { ok: true, member: mapMember(member) };
    }

    const existing = await findMember(id, body.fallbackEmail);
    if (!existing) {
      reply.code(404).send({ ok: false, error: "member_not_found" });
      return;
    }

    let update = await supabase
      .from("loyalty_members")
      .update(patch)
      .eq("id", Number(existing.id ?? existing.member_id))
      .select(memberSelect())
      .single();
    if (update.error && missingColumn(update.error)) {
      update = await supabase
        .from("loyalty_members")
        .update(stripOptionalProfileColumns(patch))
        .eq("id", Number(existing.id ?? existing.member_id))
        .select(memberBaseSelect())
        .single();
    }
    if (update.error) throw update.error;
    return { ok: true, member: mapMember(update.data) };
  });

  app.get("/members/:id/communication-preference", async (request, reply) => {
    const id = String((request.params as any).id || "").trim();
    const query = resolveQuerySchema.parse(request.query);
    const member = await findMember(id, query.fallbackEmail);
    if (!member) {
      reply.code(404).send({ ok: false, error: "member_not_found" });
      return;
    }
    const details = await maybeSingleMember((columns) =>
      supabase
        .from("loyalty_members")
        .select(`${columns},sms_enabled,email_enabled,push_enabled,promotional_opt_in,communication_frequency`)
        .eq("id", Number((member as any).id ?? (member as any).member_id))
        .limit(1)
        .maybeSingle()
    );
    const preferenceRow = details.error ? member : details.data || member;
    return {
      ok: true,
      preference: {
        sms: Boolean((preferenceRow as any).sms_enabled ?? true),
        email: Boolean((preferenceRow as any).email_enabled ?? true),
        push: Boolean((preferenceRow as any).push_enabled ?? true),
        promotionalOptIn: Boolean((preferenceRow as any).promotional_opt_in ?? true),
        frequency: String((preferenceRow as any).communication_frequency || "weekly"),
      },
    };
  });

  app.patch("/members/:id/communication-preference", async (request, reply) => {
    const id = String((request.params as any).id || "").trim();
    const query = resolveQuerySchema.parse(request.query);
    const body = communicationPreferenceSchema.parse(request.body || {});
    const member = await findMember(id, query.fallbackEmail);
    if (!member) {
      reply.code(404).send({ ok: false, error: "member_not_found" });
      return;
    }

    const patch = {
      sms_enabled: body.sms,
      email_enabled: body.email,
      push_enabled: body.push,
      promotional_opt_in: body.promotionalOptIn,
      communication_frequency: body.frequency,
    };
    for (const key of Object.keys(patch) as Array<keyof typeof patch>) {
      if (patch[key] === undefined) delete patch[key];
    }

    const { error } = await supabase.from("loyalty_members").update(patch).eq("id", Number(member.id ?? member.member_id));
    if (error) {
      if (missingColumn(error)) return { ok: true, preference: body, warning: "communication_preference_columns_missing" };
      throw error;
    }
    return { ok: true, preference: body };
  });

  app.post("/members/:id/login-activity", async (request) => {
    const id = String((request.params as any).id || "").trim();
    const body = loginActivitySchema.parse(request.body || {});
    const member = await findMember(id);
    if (!member) return { ok: true, recorded: false };

    const { error } = await supabase.from("member_login_activity").insert({
      member_id: Number(member.id ?? member.member_id),
      login_at: new Date().toISOString(),
      channel: body.channel,
      source: body.source,
    });
    if (error) {
      if (tableMissing(error, "member_login_activity")) return { ok: true, recorded: false };
      throw error;
    }
    return { ok: true, recorded: true };
  });

  app.get("/reengagement-actions", async () => {
    const { data, error } = await supabase
      .from("member_reengagement_actions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) {
      if (tableMissing(error, "member_reengagement_actions")) return { ok: true, actions: [] };
      throw error;
    }
    return { ok: true, actions: data || [] };
  });

  app.post("/reengagement-actions", async (request, reply) => {
    const body = reengagementActionSchema.parse(request.body || {});
    const member = await findMember(body.memberIdentifier, body.fallbackEmail);
    if (!member) {
      reply.code(404).send({ ok: false, error: "member_not_found" });
      return;
    }

    const { data, error } = await supabase
      .from("member_reengagement_actions")
      .insert({
        member_id: Number((member as any).id ?? (member as any).member_id),
        risk_level: body.riskLevel,
        action_type: body.actionType,
        recommended_action: body.recommendedAction,
        action_notes: body.actionNotes ?? null,
        status: body.status,
        follow_up_due_at: body.followUpDueAt ?? null,
        sent_at: body.status === "sent" ? new Date().toISOString() : null,
        completed_at: body.status === "completed" ? new Date().toISOString() : null,
      })
      .select("*")
      .single();
    if (error) {
      if (tableMissing(error, "member_reengagement_actions")) {
        reply.code(503).send({ ok: false, error: "reengagement_actions_table_missing" });
        return;
      }
      throw error;
    }
    return { ok: true, action: data };
  });

  app.patch("/reengagement-actions/:id", async (request, reply) => {
    const id = String((request.params as any).id || "").trim();
    const body = reengagementPatchSchema.parse(request.body || {});
    if (!id) {
      reply.code(400).send({ ok: false, error: "action_id_required" });
      return;
    }

    const patch: Record<string, unknown> = {
      success: body.success ?? null,
      success_metric: body.successMetric ?? null,
    };
    if (body.status) patch.status = body.status;
    if (body.sentAt !== undefined) patch.sent_at = body.sentAt;
    if (body.completedAt !== undefined) patch.completed_at = body.completedAt;
    if (body.status === "sent" && body.sentAt === undefined) patch.sent_at = new Date().toISOString();
    if (body.status === "completed" && body.completedAt === undefined) patch.completed_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("member_reengagement_actions")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    if (error) {
      if (tableMissing(error, "member_reengagement_actions")) {
        reply.code(503).send({ ok: false, error: "reengagement_actions_table_missing" });
        return;
      }
      throw error;
    }
    return { ok: true, action: data };
  });

  app.get("/referrals", async (request) => {
    const query = request.query as Record<string, any>;
    const memberId = String(query.memberId || query.memberNumber || "").trim();
    let builder = supabase.from("member_referrals").select("*").order("created_at", { ascending: false }).limit(1000);
    if (memberId) builder = builder.eq("referrer_member_number", memberId);
    const { data, error } = await builder;
    if (error) {
      if (tableMissing(error, "member_referrals")) return { ok: true, referrals: [] };
      throw error;
    }
    return { ok: true, referrals: (data || []).map(mapReferral) };
  });

  app.post("/referrals", async (request, reply) => {
    const body = referralSchema.parse(request.body || {});
    const referrer = await findMember(body.referrerMemberId);
    if (!referrer) {
      reply.code(404).send({ ok: false, error: "member_not_found" });
      return;
    }
    const referrerNumber = String((referrer as any).member_number ?? (referrer as any).member_id ?? body.referrerMemberId);
    const { data, error } = await insertLifecycleRow("member_referrals", {
        id: randomUUID(),
        referrer_member_id: String((referrer as any).id ?? (referrer as any).member_id),
        referrer_member_number: referrerNumber,
        referrer_code: buildReferralCode(referrerNumber),
        referee_email: body.refereeEmail.trim().toLowerCase(),
        status: "pending",
      });
    if (error) {
      if (tableMissing(error, "member_referrals")) {
        reply.code(503).send({ ok: false, error: "member_referrals_table_missing" });
        return;
      }
      throw error;
    }
    return { ok: true, referral: mapReferral(data) };
  });

  app.get("/referrals/validate", async (request) => {
    const query = request.query as Record<string, any>;
    const referralCode = String(query.code || query.referralCode || "").trim().toUpperCase();
    if (!referralCode) return { ok: true, isValid: false, reason: "empty", referrerMemberId: null, referrerName: null };
    const { data, error } = await supabase
      .from("member_referrals")
      .select("referrer_member_number")
      .eq("referrer_code", referralCode)
      .limit(1)
      .maybeSingle();
    if (error) {
      if (tableMissing(error, "member_referrals")) return { ok: true, isValid: false, reason: "table_missing", referrerMemberId: null, referrerName: null };
      throw error;
    }
    if (!data) return { ok: true, isValid: false, reason: "invalid", referrerMemberId: null, referrerName: null };
    const referrer = await findMember(String((data as any).referrer_member_number));
    const name = `${(referrer as any)?.first_name || ""} ${(referrer as any)?.last_name || ""}`.trim() || null;
    return { ok: true, isValid: true, reason: null, referrerMemberId: String((data as any).referrer_member_number), referrerName: name };
  });

  app.post("/referrals/apply", async (request) => {
    const body = referralApplySchema.parse(request.body || {});
    const { data, error } = await supabase
      .from("member_referrals")
      .update({
        referee_member_number: body.refereeMemberId,
        referee_email: body.refereeEmail.trim().toLowerCase(),
        status: "joined",
        converted_at: new Date().toISOString(),
      })
      .eq("referrer_code", body.referralCode.trim().toUpperCase())
      .select("*")
      .limit(1)
      .maybeSingle();
    if (error) {
      if (tableMissing(error, "member_referrals")) return { ok: true, applied: false, reason: "table_missing" };
      throw error;
    }
    if (!data) return { ok: true, applied: false, reason: "invalid" };
    return { ok: true, applied: true, referral: mapReferral(data), referrerPoints: 0, refereePoints: 0 };
  });

  app.get("/birthday-settings", async () => {
    const { data, error } = await supabase
      .from("member_birthday_reward_settings")
      .select("*")
      .eq("id", "global")
      .limit(1)
      .maybeSingle();
    if (error) {
      if (tableMissing(error, "member_birthday_reward_settings")) return { ok: true, settings: defaultBirthdaySettings };
      throw error;
    }
    return { ok: true, settings: mapBirthdaySettings(data) };
  });

  app.patch("/birthday-settings", async (request, reply) => {
    const body = birthdaySettingsSchema.parse(request.body || {});
    const { data, error } = await supabase
      .from("member_birthday_reward_settings")
      .upsert({
        id: "global",
        amounts: body.amounts,
        release_timing: body.releaseTiming,
        fulfillment_mode: body.fulfillmentMode,
        claim_window: body.claimWindow,
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" })
      .select("*")
      .single();
    if (error) {
      if (tableMissing(error, "member_birthday_reward_settings")) {
        reply.code(503).send({ ok: false, error: "birthday_settings_table_missing" });
        return;
      }
      throw error;
    }
    return { ok: true, settings: mapBirthdaySettings(data) };
  });

  app.get("/birthday-rewards/status", async (request) => {
    const query = request.query as Record<string, any>;
    const memberId = String(query.memberId || "").trim();
    const fallbackEmail = String(query.fallbackEmail || "").trim() || undefined;
    const member = memberId ? await findMember(memberId, fallbackEmail) : null;
    if (!member) return { ok: true, status: { hasReward: false, voucherCode: null, pointsAwarded: 0, badgeLabel: null } };
    const memberNumber = String((member as any).member_number ?? (member as any).member_id ?? memberId);
    const year = new Date().getFullYear();
    const { data, error } = await supabase
      .from("member_birthday_rewards")
      .select("*")
      .eq("member_number", memberNumber)
      .eq("reward_year", year)
      .limit(1)
      .maybeSingle();
    if (error) {
      if (tableMissing(error, "member_birthday_rewards")) return { ok: true, status: { hasReward: false, voucherCode: null, pointsAwarded: 0, badgeLabel: null } };
      throw error;
    }
    return {
      ok: true,
      status: {
        hasReward: Boolean(data),
        voucherCode: data?.voucher_code ? String(data.voucher_code) : null,
        pointsAwarded: Math.max(0, Number(data?.points_awarded || 0)),
        badgeLabel: data?.badge_label ? String(data.badge_label) : null,
      },
    };
  });

  app.post("/birthday-rewards/claim", async (request, reply) => {
    const body = birthdayClaimSchema.parse(request.body || {});
    const member = await findMember(body.memberId, body.fallbackEmail);
    if (!member) {
      reply.code(404).send({ ok: false, error: "member_not_found" });
      return;
    }
    const memberNumber = String((member as any).member_number ?? (member as any).member_id ?? body.memberId);
    const { data, error } = await insertLifecycleRow("member_birthday_rewards", {
        id: randomUUID(),
        member_id: String((member as any).id ?? (member as any).member_id),
        member_number: memberNumber,
        reward_year: new Date().getFullYear(),
        points_awarded: body.pointsAwarded,
        voucher_code: body.voucherCode || null,
        badge_label: body.badgeLabel || "Birthday Reward",
      });
    if (error) {
      if (tableMissing(error, "member_birthday_rewards")) {
        reply.code(503).send({ ok: false, error: "birthday_rewards_table_missing" });
        return;
      }
      throw error;
    }
    return { ok: true, reward: data };
  });

  app.get("/feedback", async () => {
    const { data, error } = await supabase.from("member_feedback").select("*").order("created_at", { ascending: false }).limit(1000);
    if (error) {
      if (tableMissing(error, "member_feedback")) return { ok: true, feedback: [] };
      throw error;
    }
    return { ok: true, feedback: (data || []).map(mapFeedback) };
  });

  app.post("/feedback", async (request, reply) => {
    const body = feedbackSchema.parse(request.body || {});
    const member = await findMember(body.memberId);
    const memberNumber = String((member as any)?.member_number ?? body.memberId);
    const { data, error } = await insertLifecycleRow("member_feedback", {
        id: randomUUID(),
        member_id: String((member as any)?.id ?? body.memberId),
        member_number: memberNumber,
        member_name: body.memberName,
        category: body.category,
        rating: body.rating,
        comment: body.comment,
        contact_opt_in: body.contactOptIn,
        contact_info: body.contactInfo || null,
      });
    if (error) {
      if (tableMissing(error, "member_feedback")) {
        reply.code(503).send({ ok: false, error: "member_feedback_table_missing" });
        return;
      }
      throw error;
    }
    return { ok: true, feedback: mapFeedback(data) };
  });

  app.post("/feedback-insights/generate", async (_request, reply) => {
    const { data: rawFeedback, error: fetchError } = await supabase
      .from("member_feedback")
      .select("id,category,rating,comment")
      .order("created_at", { ascending: false })
      .limit(5000);

    if (fetchError) {
      if (tableMissing(fetchError, "member_feedback")) {
        return { ok: true, insights: processFeedbackInsights([]), warning: "member_feedback_table_missing" };
      }
      throw fetchError;
    }

    const insights = processFeedbackInsights(rawFeedback || []);
    const { data, error } = await supabase
      .from("feedback_insights")
      .insert({
        id: randomUUID(),
        sentiment_split: insights.sentimentSplit,
        word_cloud: insights.wordCloud,
        top_topics: insights.topTopics,
        similar_feedback_groups: insights.similarFeedbackGroups,
        source_count: insights.sourceCount,
        created_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (error) {
      if (tableMissing(error, "feedback_insights")) {
        return { ok: true, insights, warning: "feedback_insights_table_missing" };
      }
      throw error;
    }

    return {
      ok: true,
      insights: {
        sentimentSplit: data.sentiment_split ?? insights.sentimentSplit,
        wordCloud: data.word_cloud ?? insights.wordCloud,
        topTopics: data.top_topics ?? insights.topTopics,
        similarFeedbackGroups: data.similar_feedback_groups ?? insights.similarFeedbackGroups,
        sourceCount: Number(data.source_count ?? insights.sourceCount),
        createdAt: String(data.created_at ?? new Date().toISOString()),
      },
    };
  });

  app.get("/feedback-insights/latest", async (_request, reply) => {
    const { data, error } = await supabase
      .from("feedback_insights")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      if (tableMissing(error, "feedback_insights")) {
        return { ok: true, insights: null };
      }
      throw error;
    }

    if (!data) return { ok: true, insights: null };

    return {
      ok: true,
      insights: {
        sentimentSplit: data.sentiment_split ?? { positive: 0, neutral: 0, negative: 0 },
        wordCloud: data.word_cloud ?? [],
        topTopics: data.top_topics ?? [],
        similarFeedbackGroups: data.similar_feedback_groups ?? [],
        sourceCount: Number(data.source_count ?? 0),
        createdAt: String(data.created_at ?? new Date().toISOString()),
      },
    };
  });

  app.get("/tier-history", async (request) => {
    const query = request.query as Record<string, any>;
    const member = query.memberIdentifier ? await findMember(String(query.memberIdentifier), query.fallbackEmail) : null;
    if (!member) return { ok: true, history: [] };
    const memberNumber = String((member as any).member_number ?? (member as any).member_id);
    const { data, error } = await supabase
      .from("member_tier_history")
      .select("*")
      .eq("member_number", memberNumber)
      .order("changed_at", { ascending: false })
      .limit(100);
    if (error) {
      if (tableMissing(error, "member_tier_history")) return { ok: true, history: [] };
      throw error;
    }
    return { ok: true, history: data || [] };
  });

  app.get("/badges/progress", async (request) => {
    const query = request.query as Record<string, any>;
    const member = query.memberIdentifier ? await findMember(String(query.memberIdentifier), query.fallbackEmail) : null;
    if (!member) return { ok: true, badges: [] };
    const memberNumber = String((member as any).member_number ?? (member as any).member_id);
    const { data, error } = await supabase
      .from("member_badge_awards")
      .select("progress_value,earned_at,member_badges(id,badge_code,badge_name,description,icon_name,milestone_type,milestone_target)")
      .eq("member_number", memberNumber)
      .limit(500);
    if (error) {
      if (tableMissing(error, "member_badge_awards") || tableMissing(error, "member_badges")) return { ok: true, badges: [] };
      throw error;
    }
    return {
      ok: true,
      badges: (data || []).map((row: any) => {
        const badge = row.member_badges || {};
        return {
          badgeId: String(badge.id ?? ""),
          badgeCode: String(badge.badge_code ?? ""),
          badgeName: String(badge.badge_name ?? ""),
          description: String(badge.description ?? ""),
          iconName: String(badge.icon_name ?? "Award"),
          milestoneType: String(badge.milestone_type ?? ""),
          milestoneTarget: Math.max(0, Number(badge.milestone_target || 0)),
          progressValue: Math.max(0, Number(row.progress_value || 0)),
          isEarned: Boolean(row.earned_at),
          earnedAt: row.earned_at ? String(row.earned_at) : null,
        };
      }),
    };
  });

  app.get("/badges/leaderboard", async (request) => {
    const query = request.query as Record<string, any>;
    const limit = Math.min(50, Math.max(1, Number(query.limit || 10) || 10));
    const { data, error } = await supabase
      .from("member_badge_awards")
      .select("member_number,earned_at")
      .not("earned_at", "is", null)
      .limit(5000);
    if (error) {
      if (tableMissing(error, "member_badge_awards")) return { ok: true, leaderboard: [] };
      throw error;
    }
    const counts = new Map<string, number>();
    for (const row of data || []) counts.set(String((row as any).member_number), (counts.get(String((row as any).member_number)) || 0) + 1);
    const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
    return {
      ok: true,
      leaderboard: entries.map(([memberNumber, badgeCount]) => ({
        memberId: memberNumber,
        memberNumber,
        memberName: memberNumber,
        badgeCount,
      })),
    };
  });

  app.get("/engagement/challenges", async () => {
    const { data, error } = await supabase
      .from("challenges")
      .select("id,challenge_code,challenge_name,challenge_type,description,target_value,reward_points,badge_name,target_segment,start_date,end_date,is_active")
      .eq("is_active", true)
      .order("start_date", { ascending: true });

    if (error) {
      if (tableMissing(error, "challenges")) return { ok: true, challenges: [] };
      throw error;
    }

    return {
      ok: true,
      challenges: (data || []).map((row: any) => {
        const type = normalizeChallengeType(row.challenge_type);
        return {
          id: String(row.id),
          title: String(row.challenge_name || row.challenge_code || "Challenge"),
          description: String(row.description || ""),
          type,
          targetValue: Math.max(0, Number(row.target_value || 0)),
          unitLabel: challengeUnitLabel(type),
          startAt: String(row.start_date || ""),
          endAt: String(row.end_date || ""),
          rewardPoints: Math.max(0, Number(row.reward_points || 0)),
          rewardBadge: String(row.badge_name || "Challenge Winner"),
          competitive: type === "purchase-count",
          segment: normalizeSegment(row.target_segment),
        };
      }),
    };
  });

  app.get("/engagement/challenges/:id/leaderboard", async (request) => {
    const challengeId = String((request.params as any).id || "").trim();
    if (!challengeId) return { ok: true, leaderboard: [] };

    const { data, error } = await supabase
      .from("challenge_leaderboard_view")
      .select("challenge_id,member_id,member_name,member_number,tier,current_value,leaderboard_rank")
      .eq("challenge_id", challengeId)
      .order("leaderboard_rank", { ascending: true })
      .limit(10);

    if (error) {
      if (tableMissing(error, "challenge_leaderboard_view")) return { ok: true, leaderboard: [] };
      throw error;
    }

    return {
      ok: true,
      leaderboard: (data || []).map((row: any) => ({
        memberId: String(row.member_id ?? row.member_number ?? ""),
        memberName: String(row.member_name || row.member_number || "Member"),
        tier: String(row.tier || "Bronze"),
        value: Math.max(0, Number(row.current_value || 0)),
      })),
    };
  });

  app.get("/engagement/surveys", async () => {
    const { data: surveyData, error: surveyError } = await supabase
      .from("surveys")
      .select("id,title,description,segment,bonus_points,status,created_at")
      .order("created_at", { ascending: false });

    if (surveyError) {
      if (tableMissing(surveyError, "surveys")) return { ok: true, surveys: [] };
      throw surveyError;
    }

    const surveys = surveyData || [];
    if (surveys.length === 0) return { ok: true, surveys: [] };

    const surveyIds = surveys.map((survey: any) => survey.id);
    const [questionResult, responseResult] = await Promise.all([
      supabase
        .from("survey_questions")
        .select("id,survey_id,prompt,question_type,options,display_order")
        .in("survey_id", surveyIds)
        .order("display_order", { ascending: true }),
      supabase
        .from("survey_responses")
        .select("survey_id,member_id,submitted_at,answers")
        .in("survey_id", surveyIds)
        .order("submitted_at", { ascending: false }),
    ]);

    if (questionResult.error && !tableMissing(questionResult.error, "survey_questions")) throw questionResult.error;
    if (responseResult.error && !tableMissing(responseResult.error, "survey_responses")) throw responseResult.error;

    const responseRows = responseResult.error ? [] : responseResult.data || [];
    const responseMemberIds = [...new Set(responseRows.map((row: any) => Number(row.member_id)).filter(Number.isFinite))];
    const memberMap = new Map<string, any>();
    if (responseMemberIds.length > 0) {
      const memberRows = await supabase
        .from("loyalty_members")
        .select("id,member_id,member_number,first_name,last_name")
        .in("id", responseMemberIds);
      if (memberRows.error) throw memberRows.error;
      for (const member of memberRows.data || []) memberMap.set(String((member as any).id), member);
    }

    const questionMap = new Map<string, any[]>();
    for (const row of questionResult.error ? [] : questionResult.data || []) {
      const list = questionMap.get(String((row as any).survey_id)) ?? [];
      list.push(row);
      questionMap.set(String((row as any).survey_id), list);
    }

    const responseMap = new Map<string, any[]>();
    for (const row of responseRows) {
      const list = responseMap.get(String((row as any).survey_id)) ?? [];
      const member = memberMap.get(String((row as any).member_id));
      list.push({
        memberId: String(member?.member_id || row.member_id),
        memberName: formatMemberName(member, row.member_id),
        answers: row.answers || {},
        submittedAt: String(row.submitted_at),
      });
      responseMap.set(String((row as any).survey_id), list);
    }

    return {
      ok: true,
      surveys: surveys.map((survey: any) =>
        normalizeSurveyDefinition(survey, questionMap.get(String(survey.id)) ?? [], responseMap.get(String(survey.id)) ?? []),
      ),
    };
  });

  app.post("/engagement/surveys", async (request, reply) => {
    const body = surveyInputSchema.parse(request.body || {});
    const { data: survey, error: surveyError } = await supabase
      .from("surveys")
      .insert({
        title: body.title.trim(),
        description: body.description.trim(),
        segment: normalizeSegment(body.segment),
        bonus_points: Math.max(0, Number(body.bonusPoints || 0)),
        status: body.status,
      })
      .select("id,title,description,segment,bonus_points,status,created_at")
      .single();

    if (surveyError) {
      if (tableMissing(surveyError, "surveys")) {
        reply.code(503).send({ ok: false, error: "surveys_table_missing" });
        return;
      }
      throw surveyError;
    }

    const questionPayload = body.questions.map((question, index) => ({
      survey_id: survey.id,
      prompt: question.prompt.trim(),
      question_type: questionTypeToColumn(question.type),
      options: question.options ?? null,
      display_order: index + 1,
    }));

    if (questionPayload.length === 0) return { ok: true, survey: normalizeSurveyDefinition(survey, []) };

    const { data: questions, error: questionError } = await supabase
      .from("survey_questions")
      .insert(questionPayload)
      .select("id,survey_id,prompt,question_type,options,display_order")
      .order("display_order", { ascending: true });

    if (questionError) {
      if (tableMissing(questionError, "survey_questions")) {
        reply.code(503).send({ ok: false, error: "survey_questions_table_missing" });
        return;
      }
      throw questionError;
    }

    return { ok: true, survey: normalizeSurveyDefinition(survey, questions || []) };
  });

  app.post("/engagement/surveys/:id/responses", async (request, reply) => {
    const surveyId = String((request.params as any).id || "").trim();
    const body = surveyResponseSchema.parse(request.body || {});
    const member = await findMember(body.memberIdentifier);
    const memberDbId = (member as any)?.id ?? (member as any)?.member_id ?? body.memberIdentifier;
    const memberName = formatMemberName(member, body.memberIdentifier);
    const submittedAt = new Date().toISOString();

    const { data, error } = await supabase
      .from("survey_responses")
      .upsert({
        survey_id: surveyId,
        member_id: memberDbId,
        answers: body.answers,
      }, { onConflict: "survey_id,member_id" })
      .select("survey_id,member_id,submitted_at,answers")
      .single();

    if (error) {
      if (tableMissing(error, "survey_responses")) {
        reply.code(503).send({ ok: false, error: "survey_responses_table_missing" });
        return;
      }
      throw error;
    }

    return {
      ok: true,
      response: {
        memberId: String((member as any)?.member_id ?? data.member_id ?? body.memberIdentifier),
        memberName,
        answers: data.answers || body.answers,
        submittedAt: String(data.submitted_at ?? submittedAt),
      },
    };
  });

  app.delete("/engagement/surveys/:id/responses", async (request, reply) => {
    const surveyId = String((request.params as any).id || "").trim();
    const query = request.query as Record<string, any>;
    const body = request.body && typeof request.body === "object" ? (request.body as Record<string, any>) : {};
    const memberIdentifier = String(query.memberIdentifier || body.memberIdentifier || "").trim();
    if (!surveyId || !memberIdentifier) {
      reply.code(400).send({ ok: false, error: "survey_id_and_member_required" });
      return;
    }

    const member = await findMember(memberIdentifier);
    const memberDbId = (member as any)?.id ?? (member as any)?.member_id ?? memberIdentifier;
    const { error } = await supabase
      .from("survey_responses")
      .delete()
      .eq("survey_id", surveyId)
      .eq("member_id", memberDbId);

    if (error) {
      if (tableMissing(error, "survey_responses")) {
        reply.code(503).send({ ok: false, error: "survey_responses_table_missing" });
        return;
      }
      throw error;
    }

    return { ok: true };
  });

  app.get("/engagement/settings/:memberId", async (request) => {
    const memberId = String((request.params as any).memberId || "").trim();
    const member = await findMember(memberId);
    const memberDbId = (member as any)?.id ?? (member as any)?.member_id;
    if (!memberDbId) return { ok: true, settings: defaultEngagementPrivacySettings };

    const { data, error } = await supabase
      .from("member_engagement_settings")
      .select("privacy_settings")
      .eq("member_id", memberDbId)
      .maybeSingle();

    if (error) {
      if (tableMissing(error, "member_engagement_settings")) return { ok: true, settings: defaultEngagementPrivacySettings };
      throw error;
    }

    return { ok: true, settings: normalizePrivacySettings(data?.privacy_settings) };
  });

  app.patch("/engagement/settings/:memberId", async (request, reply) => {
    const memberId = String((request.params as any).memberId || "").trim();
    const body = engagementSettingsSchema.parse(request.body || {});
    const settings = normalizePrivacySettings(body);
    const member = await findMember(memberId);
    const memberDbId = (member as any)?.id ?? (member as any)?.member_id;
    if (!memberDbId) return { ok: true, settings };

    const { error } = await supabase
      .from("member_engagement_settings")
      .upsert(
        {
          member_id: memberDbId,
          privacy_settings: settings,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "member_id" },
      );

    if (error) {
      if (tableMissing(error, "member_engagement_settings")) {
        reply.code(503).send({ ok: false, error: "member_engagement_settings_table_missing" });
        return;
      }
      throw error;
    }

    return { ok: true, settings };
  });

  app.patch("/members/:id/points-balance", async (request, reply) => {
    const id = String((request.params as any).id || "").trim();
    const body = balanceSchema.parse(request.body);
    const { error } = await supabase
      .from("loyalty_members")
      .update({ points_balance: body.pointsBalance, tier: body.tier })
      .eq("id", Number(id));
    if (error) throw error;
    reply.code(204).send();
  });

  app.get("/social-share-events", async (request) => {
    const query = request.query as Record<string, any>;
    let memberId: number | null = null;

    if (query.memberIdentifier) {
      const member = (await findMember(String(query.memberIdentifier))) as any;
      if (!member) return { ok: true, events: [] };
      memberId = Number(member.id ?? member.member_id);
    }

    let builder = supabase
      .from("social_share_events")
      .select("id,member_id,referral_id,referral_code,channel,achievement,tier_at_share,badge_label,share_text,destination_url,conversion_count,last_converted_at,created_at")
      .order("created_at", { ascending: false });
    if (memberId !== null) builder = builder.eq("member_id", memberId);

    const { data, error } = await builder;
    if (error) {
      if (tableMissing(error, "social_share_events")) return { ok: true, events: [] };
      throw error;
    }

    const rows = data || [];
    const memberIds = [...new Set(rows.map((row: any) => Number(row.member_id)).filter(Number.isFinite))];
    const memberMap = new Map<string, any>();
    if (memberIds.length > 0) {
      const members = await supabase
        .from("loyalty_members")
        .select("id,member_id,member_number,first_name,last_name,tier")
        .in("id", memberIds);
      if (members.error) throw members.error;
      for (const member of members.data || []) memberMap.set(String(member.id), member);
    }

    return { ok: true, events: rows.map((row: any) => mapShareEvent(row, memberMap.get(String(row.member_id)))) };
  });

  app.post("/social-share-events", async (request) => {
    const body = socialShareSchema.parse(request.body || {});
    const member = (await findMember(body.memberIdentifier)) as any;
    if (!member) return { ok: false, error: "member_not_found" };

    const { data, error } = await supabase
      .from("social_share_events")
      .insert({
        member_id: Number(member.id ?? member.member_id),
        referral_code: body.referralCode || null,
        channel: body.channel,
        achievement: body.achievement,
        tier_at_share: body.tier || member.tier || null,
        badge_label: body.badgeLabel || null,
        share_text: body.shareText || null,
        destination_url: body.destinationUrl || null,
      })
      .select("id,member_id,referral_code,channel,achievement,tier_at_share,conversion_count,created_at")
      .single();
    if (error) {
      if (tableMissing(error, "social_share_events")) return { ok: true, event: null };
      throw error;
    }
    return { ok: true, event: mapShareEvent(data, member) };
  });

  app.post("/social-share-events/:id/conversion", async (request, reply) => {
    const id = String((request.params as any).id || "").trim();
    if (!id) {
      reply.code(400).send({ ok: false, error: "share_event_id_required" });
      return;
    }

    const existing = await supabase.from("social_share_events").select("conversion_count").eq("id", Number(id)).maybeSingle();
    if (existing.error) {
      if (tableMissing(existing.error, "social_share_events")) return { ok: true, event: null };
      throw existing.error;
    }
    if (!existing.data) return { ok: true, event: null };

    const nextCount = Math.max(0, Number(existing.data.conversion_count || 0)) + 1;
    const { data, error } = await supabase
      .from("social_share_events")
      .update({ conversion_count: nextCount, last_converted_at: new Date().toISOString() })
      .eq("id", Number(id))
      .select("id,member_id,referral_code,channel,achievement,tier_at_share,conversion_count,created_at")
      .single();
    if (error) throw error;
    return { ok: true, event: mapShareEvent(data) };
  });

  return app;
}

const isDirectRun = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;

if (isDirectRun) {
  const app = createServer();
  app.listen({ host: "0.0.0.0", port: config.port }).catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
}
