import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";
import { ApiConfigService } from "./config/api-config.service";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { TimingInterceptor } from "./common/interceptors/timing.interceptor";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ApiConfigService);

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: false,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TimingInterceptor());
  app.enableCors({
    origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
    credentials: true,
  });

  const port = Number(process.env.PORT || config.port || 4000);
  await app.listen(port);
  console.log(`Backend listening on http://localhost:${port}`);
  console.log(`Health check: http://localhost:${port}/health`);
  console.log(`Data mode: ${config.useLocalFallback ? "local_runtime" : "supabase"}`);
}

void bootstrap();
