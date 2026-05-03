import { Body, Controller, Get, Param, Patch, Post, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { PartnersService } from "./partners.service";
import { PartnerSettlementDto, PartnerTransactionDto } from "./dto";

function merge(body: object | undefined, request: Request) {
  const query = Object.fromEntries(new URLSearchParams(String(request.originalUrl || request.url || "").split("?")[1] || ""));
  const payload = { ...query, ...(request.query || {}) } as Record<string, unknown>;
  for (const [key, value] of Object.entries(body || {})) {
    if (value !== undefined && value !== null && value !== "") payload[key] = value;
  }
  return payload;
}

@Controller("partners")
export class PartnersController {
  constructor(private readonly partners: PartnersService) {}

  @Post("transactions")
  async transaction(@Body() body: PartnerTransactionDto, @Req() request: Request) {
    return { ok: true, transaction: await this.partners.createTransaction(merge(body, request)) };
  }

  @Get("dashboard")
  async dashboard() {
    const partners = await this.partners.dashboard();
    return { ok: true, partners, source: "local_runtime" };
  }

  @Get(":id/dashboard")
  async dashboardById(@Param("id") id: string) {
    return { ok: true, dashboard: await this.partners.dashboardById(id), source: "local_runtime" };
  }

  @Post("settlements")
  async settlement(@Body() body: PartnerSettlementDto, @Req() request: Request) {
    return { ok: true, settlement: await this.partners.createSettlement(merge(body, request)) };
  }

  @Post(":id/settlement")
  async settlementByPartner(@Param("id") id: string, @Body() body: PartnerSettlementDto, @Req() request: Request) {
    return { ok: true, settlement: await this.partners.createSettlement({ ...merge(body, request), partnerId: id }) };
  }

  @Get("settlements/:id/pdf")
  async pdf(@Param("id") id: string, @Res() response: Response) {
    const pdf = await this.partners.settlementPdf(id);
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", `inline; filename="${id}.pdf"`);
    response.send(pdf);
  }

  @Get(":id/settlement/:month/pdf")
  async pdfByPartnerMonth(@Param("id") id: string, @Param("month") month: string, @Res() response: Response) {
    const settlement = await this.partners.findSettlementByPartnerMonth(id, month);
    const pdf = await this.partners.settlementPdf(String(settlement.id));
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", `inline; filename="${id}-${month}.pdf"`);
    response.send(pdf);
  }

  @Patch("settlements/:id/paid")
  async paid(@Param("id") id: string) {
    return { ok: true, settlement: await this.partners.markPaid(id) };
  }

  @Patch(":id/settlement/:month/paid")
  async paidByPartnerMonth(@Param("id") id: string, @Param("month") month: string) {
    const settlement = await this.partners.findSettlementByPartnerMonth(id, month);
    return { ok: true, settlement: await this.partners.markPaid(String(settlement.id)) };
  }
}
