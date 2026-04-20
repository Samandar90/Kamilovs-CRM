"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.USER_MANAGEMENT_ROLES = exports.USER_ROLES = void 0;
const permissions_1 = require("../../auth/permissions");
Object.defineProperty(exports, "USER_ROLES", { enumerable: true, get: function () { return permissions_1.USER_ROLES; } });
/** Допустимые роли при создании пользователя (все, кроме дубликатов не бывает). */
exports.USER_MANAGEMENT_ROLES = permissions_1.USER_ROLES;
