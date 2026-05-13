import { PointsService } from "./points.service";
import { TransactionCompletedDto } from "./dto";
export declare class EventsController {
    private readonly points;
    constructor(points: PointsService);
    transactionCompleted(body: TransactionCompletedDto): Promise<{
        ok: boolean;
        result: {
            memberId: string;
            pointsAwarded: number;
            newBalance: number;
            tier: string;
            transaction: {
                id: string;
                type: string;
                points: number;
                reason: string;
                date: string;
                expiry_date: null;
                reference: string;
            };
            source: string;
        };
    }>;
}
