import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { Request, Response } from "express";

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = exception instanceof HttpException ? exception.getResponse() : null;
    const rawMessage =
      typeof body === "object" && body && "message" in body
        ? (body as { message: unknown }).message
        : exception instanceof Error
          ? exception.message
          : "Unexpected server error";
    const message = Array.isArray(rawMessage) ? rawMessage.join(", ") : String(rawMessage || "");
    const path = String(((request as unknown as { path?: string }).path || request.url) ?? "");

    response.status(status).json({
      ok: false,
      statusCode: status,
      message: status === HttpStatus.NOT_FOUND ? "API route not found" : message || "Unexpected server error",
      path,
      error:
        status >= 500 && (!message || message === "Unexpected server error")
          ? "Unexpected server error"
          : message || "Unexpected server error",
      timestamp: new Date().toISOString(),
    });
  }
}
