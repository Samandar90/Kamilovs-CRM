"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidServiceCategory = exports.SERVICE_CATEGORIES = void 0;
/** Allowed service.category values (clinic CRM). */
exports.SERVICE_CATEGORIES = [
    "consultation",
    "diagnostics",
    "hygiene",
    "treatment",
    "surgery",
    "orthodontics",
    "other",
];
const isValidServiceCategory = (value) => exports.SERVICE_CATEGORIES.includes(value);
exports.isValidServiceCategory = isValidServiceCategory;
