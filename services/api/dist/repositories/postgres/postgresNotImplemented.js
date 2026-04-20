"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.postgresNotImplemented = void 0;
const postgresNotImplemented = (methodName) => {
    throw new Error(`[DATA_PROVIDER=postgres] Method '${methodName}' is not implemented for the core schema yet. ` +
        "Switch to DATA_PROVIDER=mock or implement PostgreSQL core adapters.");
};
exports.postgresNotImplemented = postgresNotImplemented;
