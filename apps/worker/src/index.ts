import { DEFAULT_LIMITS, DEFAULT_WORKING_HOURS } from "@invytra/shared";
import { loadEnv } from "./env.js";

const env = loadEnv();
console.log("Invytra worker — Phase 0 scaffold");
console.log("Data dir:", env.DATA_DIR);
console.log("Default limits:", DEFAULT_LIMITS);
console.log("Default working hours:", DEFAULT_WORKING_HOURS);
