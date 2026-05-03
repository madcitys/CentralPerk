import { IsNumber, IsOptional, IsString, Min } from "class-validator";
import { Type } from "class-transformer";

export class PartnerTransactionDto {
  @IsOptional()
  @IsString()
  partnerId?: string;

  @IsOptional()
  @IsString()
  partnerCode?: string;

  @IsOptional()
  @IsString()
  partnerName?: string;

  @IsOptional()
  @IsString()
  memberId?: string;

  @IsOptional()
  @IsString()
  memberEmail?: string;

  @IsOptional()
  @IsString()
  orderId?: string;

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0)
  points?: number;

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0)
  grossAmount?: number;

  @IsOptional()
  @IsString()
  note?: string;
}

export class PartnerSettlementDto {
  @IsOptional()
  @IsString()
  partnerId?: string;

  @IsOptional()
  @IsString()
  month?: string;

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0)
  commissionRate?: number;
}
