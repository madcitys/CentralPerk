export declare class SendEmailDto {
    campaignId?: string;
    memberId?: string;
    email?: string;
    subject?: string;
    message?: string;
}
export declare class SendSmsDto {
    memberId?: string;
    phone?: string;
    message?: string;
}
export declare class UnsubscribeDto {
    memberId?: string;
    email?: string;
}
