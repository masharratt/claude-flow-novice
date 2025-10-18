"use strict";
/**
 * Dynamic Agent Loader - Reads agent definitions from .claude/agents/ directory
 * Single source of truth for agent types in the system
 */
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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.refreshAgents = exports.getAgentsByCategory = exports.isValidAgentType = exports.searchAgents = exports.getAgentCategories = exports.getAllAgents = exports.getAgent = exports.getAvailableAgentTypes = exports.agentLoader = exports.AgentLoader = void 0;
exports.resolveLegacyAgentType = resolveLegacyAgentType;
var node_fs_1 = require("node:fs");
var glob_1 = require("glob");
var node_path_1 = require("node:path");
var yaml_1 = require("yaml");
// Legacy agent type mapping for backward compatibility
var LEGACY_AGENT_MAPPING = {
    analyst: 'code-analyzer',
    coordinator: 'hierarchical-coordinator',
    optimizer: 'perf-analyzer',
    documenter: 'api-docs',
    monitor: 'performance-benchmarker',
    specialist: 'system-architect',
    architect: 'system-architect',
};
/**
 * Resolve legacy agent types to current equivalents
 */
function resolveLegacyAgentType(legacyType) {
    return LEGACY_AGENT_MAPPING[legacyType] || legacyType;
}
var AgentLoader = /** @class */ (function () {
    function AgentLoader() {
        this.agentCache = new Map();
        this.categoriesCache = [];
        this.lastLoadTime = 0;
        this.CACHE_EXPIRY = 60000; // 1 minute cache
    }
    AgentLoader.prototype.getAgentsDirectory = function () {
        var currentDir = process.cwd();
        while (currentDir !== '/') {
            var claudeAgentsPath = (0, node_path_1.resolve)(currentDir, '.claude', 'agents');
            if ((0, node_fs_1.existsSync)(claudeAgentsPath)) {
                return claudeAgentsPath;
            }
            currentDir = (0, node_path_1.dirname)(currentDir);
        }
        return (0, node_path_1.resolve)(process.cwd(), '.claude', 'agents');
    };
    AgentLoader.prototype.parseAgentFile = function (filePath) {
        try {
            var content = (0, node_fs_1.readFileSync)(filePath, 'utf-8');
            var frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
            if (!frontmatterMatch) {
                console.warn("No frontmatter found in ".concat(filePath));
                return null;
            }
            var yamlContent = frontmatterMatch[1], markdownContent = frontmatterMatch[2];
            var frontmatter = (0, yaml_1.parse)(yamlContent);
            var description = frontmatter.description;
            if (!frontmatter.name || !description) {
                console.warn("Missing required fields (name, description) in ".concat(filePath));
                return null;
            }
            return {
                name: String(frontmatter.name),
                type: frontmatter.type ? String(frontmatter.type) : undefined,
                color: frontmatter.color ? String(frontmatter.color) : undefined,
                description: String(description),
                model: frontmatter.model ? String(frontmatter.model) : undefined,
                capabilities: Array.isArray(frontmatter.capabilities)
                    ? frontmatter.capabilities.map(String)
                    : [],
                priority: ['low', 'medium', 'high', 'critical'].includes(String(frontmatter.priority))
                    ? String(frontmatter.priority)
                    : 'medium',
                tools: this.parseTools(frontmatter),
                hooks: frontmatter.hooks,
                content: markdownContent.trim(),
            };
        }
        catch (error) {
            console.error("Error parsing agent file ".concat(filePath, ":"), error);
            return null;
        }
    };
    AgentLoader.prototype.parseTools = function (frontmatter) {
        var extractTools = function (input) {
            if (Array.isArray(input))
                return input.map(String);
            if (typeof input === 'string') {
                return input.split(/[,\s]+/).map(function (t) { return t.trim(); }).filter(function (t) { return t.length > 0; });
            }
            return [];
        };
        // Safely handle tools and capabilities.tools
        var toolsFromFrontmatter = frontmatter.tools
            ? extractTools(frontmatter.tools)
            : [];
        var toolsFromCapabilities = frontmatter.capabilities && typeof frontmatter.capabilities === 'object'
            ? extractTools(Object(frontmatter.capabilities).tools)
            : [];
        return __spreadArray(__spreadArray([], toolsFromFrontmatter, true), toolsFromCapabilities, true);
    };
    AgentLoader.prototype.loadAgents = function () {
        return __awaiter(this, void 0, void 0, function () {
            var agentsDir, agentFiles, categoryMap, _i, agentFiles_1, filePath, agent, relativePath, pathParts, category;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        agentsDir = this.getAgentsDirectory();
                        if (!(0, node_fs_1.existsSync)(agentsDir)) {
                            console.warn("Agents directory not found: ".concat(agentsDir));
                            return [2 /*return*/];
                        }
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                (0, glob_1.glob)('**/*.md', {
                                    cwd: agentsDir,
                                    ignore: ['**/README.md', '**/MIGRATION_SUMMARY.md'],
                                    absolute: true
                                }, function (err, matches) {
                                    if (err)
                                        reject(err);
                                    else
                                        resolve(matches);
                                });
                            })];
                    case 1:
                        agentFiles = _a.sent();
                        this.agentCache.clear();
                        this.categoriesCache = [];
                        categoryMap = new Map();
                        for (_i = 0, agentFiles_1 = agentFiles; _i < agentFiles_1.length; _i++) {
                            filePath = agentFiles_1[_i];
                            agent = this.parseAgentFile(filePath);
                            if (agent) {
                                this.agentCache.set(agent.name, agent);
                                relativePath = filePath.replace(agentsDir, '');
                                pathParts = relativePath.split('/');
                                category = pathParts[1] || 'uncategorized';
                                if (!categoryMap.has(category)) {
                                    categoryMap.set(category, []);
                                }
                                categoryMap.get(category).push(agent);
                            }
                        }
                        this.categoriesCache = Array.from(categoryMap.entries()).map(function (_a) {
                            var name = _a[0], agents = _a[1];
                            return ({
                                name: name,
                                agents: agents.sort(function (a, b) { return a.name.localeCompare(b.name); }),
                            });
                        });
                        this.lastLoadTime = Date.now();
                        return [2 /*return*/];
                }
            });
        });
    };
    // Rest of the methods remain similar to the original implementation
    AgentLoader.prototype.needsRefresh = function () {
        return Date.now() - this.lastLoadTime > this.CACHE_EXPIRY;
    };
    AgentLoader.prototype.ensureLoaded = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!(this.agentCache.size === 0 || this.needsRefresh())) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.loadAgents()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2: return [2 /*return*/];
                }
            });
        });
    };
    AgentLoader.prototype.getAvailableAgentTypes = function () {
        return __awaiter(this, void 0, void 0, function () {
            var currentTypes, legacyTypes;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.ensureLoaded()];
                    case 1:
                        _a.sent();
                        currentTypes = Array.from(this.agentCache.keys());
                        legacyTypes = Object.keys(LEGACY_AGENT_MAPPING);
                        return [2 /*return*/, Array.from(new Set(__spreadArray(__spreadArray([], currentTypes, true), legacyTypes, true))).sort()];
                }
            });
        });
    };
    AgentLoader.prototype.getAgent = function (name) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.ensureLoaded()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/, this.agentCache.get(name) || this.agentCache.get(resolveLegacyAgentType(name)) || null];
                }
            });
        });
    };
    AgentLoader.prototype.getAllAgents = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.ensureLoaded()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/, Array.from(this.agentCache.values()).sort(function (a, b) { return a.name.localeCompare(b.name); })];
                }
            });
        });
    };
    AgentLoader.prototype.getAgentCategories = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.ensureLoaded()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/, this.categoriesCache];
                }
            });
        });
    };
    AgentLoader.prototype.searchAgents = function (query) {
        return __awaiter(this, void 0, void 0, function () {
            var lowerQuery;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.ensureLoaded()];
                    case 1:
                        _a.sent();
                        lowerQuery = query.toLowerCase();
                        return [2 /*return*/, Array.from(this.agentCache.values()).filter(function (agent) {
                                var _a;
                                return agent.name.toLowerCase().includes(lowerQuery) ||
                                    agent.description.toLowerCase().includes(lowerQuery) ||
                                    ((_a = agent.capabilities) === null || _a === void 0 ? void 0 : _a.some(function (cap) { return cap.toLowerCase().includes(lowerQuery); }));
                            })];
                }
            });
        });
    };
    AgentLoader.prototype.isValidAgentType = function (name) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.ensureLoaded()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/, this.agentCache.has(name) || this.agentCache.has(resolveLegacyAgentType(name))];
                }
            });
        });
    };
    AgentLoader.prototype.getAgentsByCategory = function (category) {
        return __awaiter(this, void 0, void 0, function () {
            var categories, found;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getAgentCategories()];
                    case 1:
                        categories = _a.sent();
                        found = categories.find(function (cat) { return cat.name === category; });
                        return [2 /*return*/, (found === null || found === void 0 ? void 0 : found.agents) || []];
                }
            });
        });
    };
    AgentLoader.prototype.refresh = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this.lastLoadTime = 0;
                        return [4 /*yield*/, this.loadAgents()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    return AgentLoader;
}());
exports.AgentLoader = AgentLoader;
// Singleton instance
exports.agentLoader = new AgentLoader();
// Convenience exports for use in other modules
var getAvailableAgentTypes = function () { return exports.agentLoader.getAvailableAgentTypes(); };
exports.getAvailableAgentTypes = getAvailableAgentTypes;
var getAgent = function (name) { return exports.agentLoader.getAgent(name); };
exports.getAgent = getAgent;
var getAllAgents = function () { return exports.agentLoader.getAllAgents(); };
exports.getAllAgents = getAllAgents;
var getAgentCategories = function () { return exports.agentLoader.getAgentCategories(); };
exports.getAgentCategories = getAgentCategories;
var searchAgents = function (query) { return exports.agentLoader.searchAgents(query); };
exports.searchAgents = searchAgents;
var isValidAgentType = function (name) { return exports.agentLoader.isValidAgentType(name); };
exports.isValidAgentType = isValidAgentType;
var getAgentsByCategory = function (category) { return exports.agentLoader.getAgentsByCategory(category); };
exports.getAgentsByCategory = getAgentsByCategory;
var refreshAgents = function () { return exports.agentLoader.refresh(); };
exports.refreshAgents = refreshAgents;
