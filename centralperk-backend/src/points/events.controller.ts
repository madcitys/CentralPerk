import { Body, Controller, Post } from "@nestjs/common";
import { PointsService } from "./points.service";
import { TransactionCompletedDto } from "./dto";

@Controller("events")
export class EventsController {
  constructor(private readonly points: PointsService) {}

  @Post("transaction-completed")
  async transactionCompleted(@Body() body: TransactionCompletedDto) {
    const result = await this.points.award(
      {
        memberIdentifier: body.memberIdentifier,
        fallbackEmail: body.fallbackEmail,
        amountSpent: body.amountSpent,
        transactionType: "PURCHASE",
        transactionRef: body.transactionReference,
        reason: body.reason || "POS transaction completed",
      },
      body.transactionReference,
    );
    return { ok: true, result };
  }
}
