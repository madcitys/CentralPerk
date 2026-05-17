import { createMemberServerSupabaseClient } from "./supabase-admin";
import { serviceBaseUrl } from "./service-proxy";

type AnyRecord = Record<string, any>;

function isMissingRelationError(error: unknown, table: string) {
  const message = String(
    (error as { message?: unknown; details?: unknown; hint?: unknown })?.message ??
      (error as { details?: unknown })?.details ??
      (error as { hint?: unknown })?.hint ??
      "",
  ).toLowerCase();

  return (
    message.includes(`relation "${table.toLowerCase()}" does not exist`) ||
    message.includes(`relation "public.${table.toLowerCase()}" does not exist`) ||
    message.includes(`could not find the table 'public.${table.toLowerCase()}' in the schema cache`) ||
    message.includes(`could not find the table "${table.toLowerCase()}" in the schema cache`) ||
    message.includes(`could not find the table '${table.toLowerCase()}' in the schema cache`) ||
    (message.includes(table.toLowerCase()) && message.includes("schema cache")) ||
    (message.includes(table.toLowerCase()) && message.includes("does not exist"))
  );
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

function formatMemberName(member?: AnyRecord | null, fallbackMemberId?: number | string) {
  const fullName = `${member?.first_name || ""} ${member?.last_name || ""}`.trim();
  if (fullName) return fullName;
  if (member?.member_number) return String(member.member_number);
  const fallback = String(member?.member_id || fallbackMemberId || "").trim();
  return fallback ? `Member ${fallback}` : "Member";
}

async function fetchMembersByIds(memberIds: string[]) {
  if (memberIds.length === 0) return [];
  const response = await fetch(`${serviceBaseUrl("MEMBER_SERVICE_URL", "http://127.0.0.1:4003")}/members?limit=5000`, {
    headers: { accept: "application/json" },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Member service failed (${response.status}).`);
  const idSet = new Set(memberIds);
  return ((payload.members || []) as AnyRecord[]).filter((row) => idSet.has(String(row.id ?? row.memberId ?? row.member_id)));
}

export async function fetchChallengeDefinitions() {
  const supabase = createMemberServerSupabaseClient();
  const { data, error } = await supabase
    .from("challenges")
    .select("id,challenge_code,challenge_name,challenge_type,description,target_value,reward_points,badge_name,target_segment,start_date,end_date,is_active")
    .eq("is_active", true)
    .order("start_date", { ascending: true });

  if (error) {
    if (isMissingRelationError(error, "challenges")) return [];
    throw error;
  }

  return ((data || []) as AnyRecord[]).map((row) => {
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
  });
}

export async function fetchChallengeLeaderboard(challengeId: string) {
  const supabase = createMemberServerSupabaseClient();
  const { data, error } = await supabase
    .from("challenge_leaderboard_view")
    .select("challenge_id,member_id,member_name,member_number,tier,current_value,leaderboard_rank")
    .eq("challenge_id", challengeId)
    .order("leaderboard_rank", { ascending: true })
    .limit(10);

  if (error) {
    if (isMissingRelationError(error, "challenge_leaderboard_view")) return [];
    throw error;
  }

  return ((data || []) as AnyRecord[]).map((row) => ({
    memberId: String(row.member_id ?? row.member_number ?? ""),
    memberName: String(row.member_name || row.member_number || "Member"),
    tier: String(row.tier || "Bronze"),
    value: Math.max(0, Number(row.current_value || 0)),
  }));
}

export async function fetchSurveyDefinitions() {
  const supabase = createMemberServerSupabaseClient();
  const { data: surveyData, error: surveyError } = await supabase
    .from("surveys")
    .select("id,title,description,segment,bonus_points,status,created_at")
    .order("created_at", { ascending: false });

  if (surveyError) {
    if (isMissingRelationError(surveyError, "surveys")) return [];
    throw surveyError;
  }

  const surveys = (surveyData || []) as AnyRecord[];
  if (surveys.length === 0) return [];

  const surveyIds = surveys.map((survey) => survey.id);
  const [{ data: questionData, error: questionError }, { data: responseData, error: responseError }] = await Promise.all([
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

  if (questionError) {
    if (isMissingRelationError(questionError, "survey_questions")) return [];
    throw questionError;
  }

  if (responseError) {
    if (isMissingRelationError(responseError, "survey_responses")) return [];
    throw responseError;
  }

  const responseRows = (responseData || []) as AnyRecord[];
  const responseMemberIds = [...new Set(responseRows.map((row) => String(row.member_id)).filter(Boolean))];
  const memberRows = await fetchMembersByIds(responseMemberIds);
  const memberMap = new Map(((memberRows || []) as AnyRecord[]).map((row) => [String(row.id ?? row.memberId ?? row.member_id), row]));
  const questionMap = new Map<string, any[]>();
  ((questionData || []) as AnyRecord[]).forEach((row) => {
    const list = questionMap.get(String(row.survey_id)) ?? [];
    list.push({
      id: String(row.id),
      prompt: String(row.prompt || ""),
      type: normalizeQuestionType(row.question_type),
      options: Array.isArray(row.options) ? row.options.map((item: unknown) => String(item)) : undefined,
    });
    questionMap.set(String(row.survey_id), list);
  });

  const responseMap = new Map<string, any[]>();
  responseRows.forEach((row) => {
    const list = responseMap.get(String(row.survey_id)) ?? [];
    const member = memberMap.get(String(row.member_id));
    list.push({
      memberId: String(member?.member_id || row.member_id),
      memberName: formatMemberName(member, row.member_id),
      answers: row.answers || {},
      submittedAt: String(row.submitted_at),
    });
    responseMap.set(String(row.survey_id), list);
  });

  return surveys.map((survey) => ({
    id: String(survey.id),
    title: String(survey.title || "Survey"),
    description: String(survey.description || ""),
    segment: normalizeSegment(survey.segment),
    bonusPoints: Math.max(0, Number(survey.bonus_points || 0)),
    status: survey.status === "live" || survey.status === "closed" ? survey.status : "draft",
    createdAt: String(survey.created_at || ""),
    questions: questionMap.get(String(survey.id)) ?? [],
    responses: responseMap.get(String(survey.id)) ?? [],
  }));
}
