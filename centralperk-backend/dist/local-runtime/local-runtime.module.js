"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalRuntimeModule = void 0;
const common_1 = require("@nestjs/common");
const local_runtime_controller_1 = require("./local-runtime.controller");
const local_runtime_service_1 = require("./local-runtime.service");
let LocalRuntimeModule = class LocalRuntimeModule {
};
exports.LocalRuntimeModule = LocalRuntimeModule;
exports.LocalRuntimeModule = LocalRuntimeModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        controllers: [local_runtime_controller_1.LocalRuntimeController],
        providers: [local_runtime_service_1.LocalRuntimeService],
        exports: [local_runtime_service_1.LocalRuntimeService],
    })
], LocalRuntimeModule);
//# sourceMappingURL=local-runtime.module.js.map