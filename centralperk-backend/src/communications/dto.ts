import { IsEmail, IsOptional, IsString } from "class-validator";

export class SendEmailDto {
  @IsOptional()
  @IsString()
  campaignId?: string;

  @IsOptional()
  @IsString()
  memberId?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  message?: string;
}

export class SendSmsDto {
  @IsOptional()
  @IsString()
  memberId?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  message?: string;
}

export class UnsubscribeDto {
  @IsOptional()
  @IsString()
  memberId?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}
