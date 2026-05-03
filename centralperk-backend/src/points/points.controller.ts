import { Body, Controller, Get, Headers, Param, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { PointsService } from "./points.service";
import { AwardPointsDto, RedeemPointsDto } from "./dto";

function mergePayload(body: object | undefined, request: Request) {
  const query = Object.fromEntries(new URLSearchParams(String(request.originalUrl || request.url || "").split("?")[1] || ""));
  const payload = { ...query, ...(request.query || {}) } as Record<string, unknown>;
  for (const [key, value] of Object.entries(body || {})) {
    if (value !== undefined && value !== null && value !== "") payload[key] = value;
  }
  return payload;
}

function resolveLookupInput(memberId?: string, email?: string) {
  const normalizedMemberId = String(memberId || "").trim();
  const normalizedEmail = String(email || "").trim();
  return {
    memberIdentifier: normalizedMemberId || normalizedEmail,
    email: normalizedEmail || undefined,
  };
}

@Controller()
export class PointsController {
  constructor(private readonly points: PointsService) {}

  @Post("points/award")
  async award(
    @Body() body: AwardPointsDto,
    @Req() request: Request,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const result = await this.points.award(mergePayload(body, request), idempotencyKey);
    return { ok: true, result };
  }

  @Post("points/redeem")
  async redeem(@Body() body: RedeemPointsDto, @Req() request: Request) {
    const result = await this.points.redeem(mergePayload(body, request));
    return { ok: true, result };
  }

  @Get("members/:id/points")
  async pointsForMember(@Param("id") id: string, @Query("email") email?: string) {
    const activity = await this.points.activity(id, email);
    return {
      ok: true,
      memberId: activity.balance.member_id,
      points: activity.balance.points_balance,
      balance: activity.balance,
    };
  }

  @Get("members/:id/points-history")
  async history(@Param("id") id: string, @Query("email") email?: string) {
    const activity = await this.points.activity(id, email);
    return { ok: true, memberId: activity.balance.member_id, history: activity.history.slice(0, 200) };
  }

  @Get("points")
  async pointsLookup(@Query("memberId") memberId?: string, @Query("email") email?: string) {
    const lookup = resolveLookupInput(memberId, email);
    const activity = email && !lookup.memberIdentifier ? await this.points.lookupByEmail(email) : await this.points.activity(lookup.memberIdentifier, lookup.email);
    return {
      ok: true,
      memberId: activity.balance.member_id,
      points: activity.balance.points_balance,
      balance: activity.balance,
    };
  }

  @Get("points-history")
  async pointsHistoryLookup(@Query("memberId") memberId?: string, @Query("email") email?: string) {
    const lookup = resolveLookupInput(memberId, email);
    const activity = email && !lookup.memberIdentifier ? await this.points.lookupByEmail(email) : await this.points.activity(lookup.memberIdentifier, lookup.email);
    return { ok: true, memberId: activity.balance.member_id, history: activity.history.slice(0, 200) };
  }
}
