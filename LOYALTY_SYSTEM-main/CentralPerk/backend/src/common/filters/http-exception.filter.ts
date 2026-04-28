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
    const message =
      typeof body === "object" && body && "message" in body
        ? (body as { message: unknown }).message
        : exception instanceof Error
          ? exception.message
          : "Unexpected server error";

    response.status(status).json({
      ok: false,
      error:
        status >= 500 && message === "Unexpected server error"
          ? "Unexpected server error"
          : message,
      statusCode: status,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
