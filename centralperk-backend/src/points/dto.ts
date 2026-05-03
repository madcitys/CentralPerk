import { IsNumber, IsOptional, IsString, Min } from "class-validator";

export class AwardPointsDto {
  @IsOptional()
  @IsString()
  memberIdentifier?: string;

  @IsOptional()
  @IsString()
  fallbackEmail?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  points?: number;

  @IsOptional()
  @IsString()
  transactionType?: string;

  @IsOptional()
  @IsString()
  transactionRef?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amountSpent?: number;

  @IsOptional()
  @IsString()
  productCode?: string;

  @IsOptional()
  @IsString()
  productCategory?: string;
}

export class RedeemPointsDto {
  @IsOptional()
  @IsString()
  memberIdentifier?: string;

  @IsOptional()
  @IsString()
  fallbackEmail?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  points?: number;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  transactionType?: string;

  @IsOptional()
  @IsString()
  rewardCatalogId?: string;
}

export class TransactionCompletedDto {
  @IsOptional()
  @IsString()
  eventId?: string;

  @IsOptional()
  @IsString()
  eventType?: string;

  @IsString()
  transactionReference!: string;

  @IsString()
  memberIdentifier!: string;

  @IsOptional()
  @IsString()
  fallbackEmail?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amountSpent?: number;

  @IsOptional()
  @IsString()
  reason?: string;
}
