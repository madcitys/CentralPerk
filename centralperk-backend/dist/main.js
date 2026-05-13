"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const app_module_1 = require("./app.module");
const api_config_service_1 = require("./config/api-config.service");
const http_exception_filter_1 = require("./common/filters/http-exception.filter");
const timing_interceptor_1 = require("./common/interceptors/timing.interceptor");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    const config = app.get(api_config_service_1.ApiConfigService);
    app.useGlobalPipes(new common_1.ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: false,
    }));
    app.useGlobalFilters(new http_exception_filter_1.HttpExceptionFilter());
    app.useGlobalInterceptors(new timing_interceptor_1.TimingInterceptor());
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
//# sourceMappingURL=main.js.map