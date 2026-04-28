import { IsNumber, IsOptional, IsString, Min } from "class-validator";
import { Type } from "class-transformer";

export class PartnerTransactionDto {
  @IsOptional()
  @IsString()
  partnerId?: string;

  @IsOptional()
  @IsString()
  memberId?: string;

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;
}

export class PartnerSettlementDto {
  @IsOptional()
  @IsString()
  partnerId?: string;

  @IsOptional()
  @IsString()
  month?: string;
}
