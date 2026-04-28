import { Controller, Get, Post } from "@nestjs/common";
import { LocalRuntimeService } from "./local-runtime.service";

@Controller("local-runtime")
export class LocalRuntimeController {
  constructor(private readonly runtime: LocalRuntimeService) {}

  @Get("points")
  async points() {
    return {
      ok: true,
      source: "local_runtime",
      snapshot: {
        members: await this.runtime.snapshotPoints(),
      },
    };
  }

  @Post("seed")
  async seed() {
    const state = await this.runtime.writeSeedFile();
    const pointsLedgerRows = Object.values(state.pointMembers || {}).reduce(
      (sum, member) => sum + (Array.isArray(member.history) ? member.history.length : 0),
      0,
    );
    return {
      ok: true,
      source: "local_runtime",
      seeded: true,
      counts: {
        members: Object.keys(state.pointMembers || {}).length,
        rewards: Object.keys(state.rewards || {}).length,
        campaigns: Object.keys(state.campaigns || {}).length,
        segments: Object.keys(state.segments || {}).length,
        partners: Object.keys(state.partners || {}).length,
        notifications: (state.notifications || []).length,
        pointsLedgerRows,
        partnerTransactions: (state.partnerTransactions || []).length,
      },
    };
  }
}
