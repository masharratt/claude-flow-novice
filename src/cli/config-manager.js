"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var fs = require("fs/promises");
var path = require("path");
var ajv_1 = require("ajv");
var get_1 = require("lodash/get");
var ConfigManager = /** @class */ (function () {
    function ConfigManager() {
        this.configPath = path.join(process.env.HOME || "", ".claude-flow-config.json");
        this.schemaPath = path.join(__dirname, "../../.claude/skills/config-management/config.json");
        this.ajv = new ajv_1.default();
    }
    ConfigManager.getInstance = function () {
        if (!ConfigManager.instance) {
            ConfigManager.instance = new ConfigManager();
        }
        return ConfigManager.instance;
    };
    ConfigManager.prototype.readConfig = function () {
        return __awaiter(this, void 0, void 0, function () {
            var configContent, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, fs.readFile(this.configPath, "utf-8")];
                    case 1:
                        configContent = _a.sent();
                        return [2 /*return*/, JSON.parse(configContent)];
                    case 2:
                        error_1 = _a.sent();
                        // If config doesn't exist, create from schema
                        return [2 /*return*/, this.resetToDefaults()];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    ConfigManager.prototype.writeConfig = function (config) {
        return __awaiter(this, void 0, void 0, function () {
            var schemaContent, schema, validate;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, fs.readFile(this.schemaPath, "utf-8")];
                    case 1:
                        schemaContent = _a.sent();
                        schema = JSON.parse(schemaContent);
                        validate = this.ajv.compile(schema);
                        if (!validate(config)) {
                            throw new Error("Invalid configuration: " + this.ajv.errorsText(validate.errors));
                        }
                        return [4 /*yield*/, fs.writeFile(this.configPath, JSON.stringify(config, null, 2), "utf-8")];
                    case 2:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    ConfigManager.prototype.getValue = function (keyPath) {
        return __awaiter(this, void 0, void 0, function () {
            var config, value, customConfig;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.readConfig()];
                    case 1:
                        config = _a.sent();
                        value = (0, get_1.default)(config, keyPath);
                        if (!(value === undefined)) return [3 /*break*/, 3];
                        return [4 /*yield*/, this.readCustomConfig()];
                    case 2:
                        customConfig = _a.sent();
                        return [2 /*return*/, (0, get_1.default)(customConfig, keyPath)];
                    case 3: return [2 /*return*/, value];
                }
            });
        });
    };
    ConfigManager.prototype.readCustomConfig = function () {
        return __awaiter(this, void 0, void 0, function () {
            var customConfigPath, customConfigContent, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        customConfigPath = path.join(process.env.HOME || "", ".claude-flow-custom-config.json");
                        return [4 /*yield*/, fs.readFile(customConfigPath, "utf-8")];
                    case 1:
                        customConfigContent = _a.sent();
                        return [2 /*return*/, JSON.parse(customConfigContent)];
                    case 2:
                        error_2 = _a.sent();
                        // If custom config doesn't exist or can't be read, return empty object
                        return [2 /*return*/, {}];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    ConfigManager.prototype.set = function (key, value) {
        return __awaiter(this, void 0, void 0, function () {
            var config;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.readConfig()];
                    case 1:
                        config = _a.sent();
                        // Type assertion to handle both full object and nested key
                        if (typeof value === "object" && value !== null) {
                            config[key] = value;
                        }
                        else {
                            throw new Error("Invalid configuration value");
                        }
                        return [4 /*yield*/, this.writeConfig(config)];
                    case 2:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    ConfigManager.prototype.getAll = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.readConfig()];
            });
        });
    };
    ConfigManager.prototype.resetToDefaults = function () {
        return __awaiter(this, void 0, void 0, function () {
            var schemaContent, schema, defaultConfig;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, fs.readFile(this.schemaPath, "utf-8")];
                    case 1:
                        schemaContent = _a.sent();
                        schema = JSON.parse(schemaContent);
                        defaultConfig = {
                            redis: {
                                host: schema.properties.redis.properties.host.default,
                                port: schema.properties.redis.properties.port.default,
                            },
                            agent: {
                                default_strategy: schema.properties.agent.properties.default_strategy.default,
                                max_concurrent_agents: schema.properties.agent.properties.max_concurrent_agents.default,
                                log_level: schema.properties.agent.properties.log_level.default,
                            },
                            security: {
                                enabled: schema.properties.security.properties.enabled.default,
                                max_retry_attempts: schema.properties.security.properties.max_retry_attempts.default,
                            },
                        };
                        return [4 /*yield*/, this.writeConfig(defaultConfig)];
                    case 2:
                        _a.sent();
                        return [2 /*return*/, defaultConfig];
                }
            });
        });
    };
    return ConfigManager;
}());
exports.default = ConfigManager;
