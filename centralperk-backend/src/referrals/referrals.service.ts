import { BadRequestException, Injectable } from "@nestjs/common";
import { LocalRuntimeService } from "../local-runtime/local-runtime.service";
import { cleanString, nowIso } from "../common/utils";

@Injectable()
export class ReferralsService {
  constructor(private readonly runtime: LocalRuntimeService) {}

  async create(input: Record<string, unknown>) {
    const memberId = cleanString(input.memberId) || cleanString(input.memberIdentifier);
    const recipientEmail = cleanString(input.recipientEmail) || cleanString(input.email);
    if (!memberId) throw new BadRequestException("memberId is required.");
    if (!recipientEmail || !recipientEmail.includes("@")) throw new BadRequestException("recipientEmail is required.");

    return this.runtime.update((state) => {
      const duplicate = state.referrals.find(
        (row) => row.memberId === memberId && row.recipientEmail.toLowerCase() === recipientEmail.toLowerCase(),
      );
      if (duplicate) throw new BadRequestException("Referral already created for this email.");

      const referralCode = `${memberId.replace(/[^A-Z0-9]/gi, "").slice(-6)}-${Date.now().toString().slice(-4)}`.toUpperCase();
      const referralLink = cleanString(input.referralLink) || `/register?ref=${encodeURIComponent(referralCode)}`;
      const referral = {
        id: `ref-${Date.now()}`,
        memberId,
        referralCode,
        recipientEmail,
        referralLink,
        status: "pending" as const,
        createdAt: nowIso(),
      };
      state.referrals.unshift(referral);
      state.notifications.unshift({
        id: `referral-${Date.now()}`,
        type: "email",
        channel: "email",
        status: "demo",
        mode: "demo",
        memberId,
        recipient: recipientEmail,
        subject: "Referral invitation",
        message: `Referral created for ${recipientEmail}: ${referralLink}`,
        createdAt: nowIso(),
      });
      return { referral, mode: "demo" as const };
    });
  }

  async list(memberId?: string) {
    const state = await this.runtime.read();
    return (state.referrals || []).filter((row) => !memberId || row.memberId === memberId);
  }
}
