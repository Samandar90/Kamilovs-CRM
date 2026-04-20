"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toPublicUser = void 0;
const toPublicUser = (user) => {
    const { password: _password, ...publicUser } = user;
    return publicUser;
};
exports.toPublicUser = toPublicUser;
