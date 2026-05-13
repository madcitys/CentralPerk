export declare class AwardPointsDto {
    memberIdentifier?: string;
    fallbackEmail?: string;
    points?: number;
    transactionType?: string;
    transactionRef?: string;
    reason?: string;
    amountSpent?: number;
    productCode?: string;
    productCategory?: string;
}
export declare class RedeemPointsDto {
    memberIdentifier?: string;
    fallbackEmail?: string;
    points?: number;
    reason?: string;
    transactionType?: string;
    rewardCatalogId?: string;
}
export declare class TransactionCompletedDto {
    eventId?: string;
    eventType?: string;
    transactionReference: string;
    memberIdentifier: string;
    fallbackEmail?: string;
    amountSpent?: number;
    reason?: string;
}
