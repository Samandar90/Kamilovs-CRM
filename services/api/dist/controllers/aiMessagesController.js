"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiMessagesClearController = exports.aiMessagesListController = void 0;
const requestAuth_1 = require("../utils/requestAuth");
const aiMessagesService_1 = require("../services/aiMessagesService");
const aiMessagesListController = async (req, res) => {
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const messages = await aiMessagesService_1.aiMessagesService.listByUserId(auth.userId);
    return res.status(200).json({ messages });
};
exports.aiMessagesListController = aiMessagesListController;
const aiMessagesClearController = async (req, res) => {
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    await aiMessagesService_1.aiMessagesService.clearByUserId(auth.userId);
    return res.status(200).json({ ok: true });
};
exports.aiMessagesClearController = aiMessagesClearController;
