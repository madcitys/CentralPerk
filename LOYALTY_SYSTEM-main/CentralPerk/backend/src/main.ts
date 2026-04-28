import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";
import { ApiConfigService } from "./config/api-config.service";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { TimingInterceptor } from "./common/interceptors/timing.interceptor";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
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
    origin: true,
    credentials: true,
  });

  const port = config.port;
  await app.listen(port, "0.0.0.0");
  console.log(`[nest-backend] listening on http://localhost:${port}`);
}

void bootstrap();
