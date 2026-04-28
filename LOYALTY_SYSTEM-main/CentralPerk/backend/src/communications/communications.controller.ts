import { Body, Controller, Get, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { CommunicationsService } from "./communications.service";
import { SendEmailDto, SendSmsDto, UnsubscribeDto } from "./dto";

function merge(body: object | undefined, request: Request) {
  const query = Object.fromEntries(new URLSearchParams(String(request.originalUrl || request.url || "").split("?")[1] || ""));
  const payload = { ...query, ...(request.query || {}) } as Record<string, unknown>;
  for (const [key, value] of Object.entries(body || {})) {
    if (value !== undefined && value !== null && value !== "") payload[key] = value;
  }
  return payload;
}

@Controller()
export class CommunicationsController {
  constructor(private readonly communications: CommunicationsService) {}

  @Post("communications/email")
  async email(@Body() body: SendEmailDto, @Req() request: Request) {
    return { ok: true, result: await this.communications.sendEmail(merge(body, request)) };
  }

  @Post("notifications/sms")
  async sms(@Body() body: SendSmsDto, @Req() request: Request) {
    return { ok: true, result: await this.communications.sendSms(merge(body, request)) };
  }

  @Get("communications/analytics")
  async analytics() {
    return { ok: true, analytics: await this.communications.analytics() };
  }

  @Post("unsubscribe")
  async unsubscribe(@Body() body: UnsubscribeDto, @Req() request: Request) {
    return { ok: true, preferences: await this.communications.unsubscribe(merge(body, request)) };
  }
}
