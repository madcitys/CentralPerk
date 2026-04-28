import { Global, Module } from "@nestjs/common";
import { LocalRuntimeService } from "./local-runtime.service";

@Global()
@Module({
  providers: [LocalRuntimeService],
  exports: [LocalRuntimeService],
})
export class LocalRuntimeModule {}
