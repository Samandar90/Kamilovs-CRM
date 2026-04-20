"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiAskV2Controller = void 0;
const aiAssistantHardGate_1 = require("../../ai/aiAssistantHardGate");
const ai_service_1 = require("./ai.service");
const container_1 = require("../../container");
const aiMessagesService_1 = require("../aiMessagesService");
const requestAuth_1 = require("../../utils/requestAuth");
const aiService = new ai_service_1.AIService({
    patientsService: container_1.services.patients,
    doctorsService: container_1.services.doctors,
    servicesService: container_1.services.services,
    appointmentsService: container_1.services.appointments,
    invoicesService: container_1.services.invoices,
    paymentsService: container_1.services.payments,
    cashRegisterService: container_1.services.cashRegister,
    reportsService: container_1.services.reports,
});
const AI_ERROR_ANSWER = "Не удалось получить ответ. Попробуйте ещё раз.";
const aiAskV2Controller = async (req, res) => {
    try {
        const auth = (0, requestAuth_1.getAuthPayload)(req);
        const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
        if (!message) {
            return res.status(400).json({ answer: "Пустой запрос", suggestions: [] });
        }
        const chatHistory = await aiMessagesService_1.aiMessagesService.listLastNByUserId(auth.userId, 10);
        await aiMessagesService_1.aiMessagesService.append(auth.userId, "user", message);
        const allowed = (0, aiAssistantHardGate_1.checkAIRequestAccess)(auth.role, message);
        console.log("ROLE:", auth.role);
        console.log("MESSAGE:", message);
        console.log("ALLOWED:", allowed);
        if (!allowed) {
            await aiMessagesService_1.aiMessagesService.append(auth.userId, "assistant", aiAssistantHardGate_1.AI_ACCESS_DENIED_MESSAGE);
            return res.status(200).json({
                answer: aiAssistantHardGate_1.AI_ACCESS_DENIED_MESSAGE,
                message: aiAssistantHardGate_1.AI_ACCESS_DENIED_MESSAGE,
                suggestions: [],
            });
        }
        let answer;
        try {
            answer = await aiService.handleMessage(message, auth, chatHistory);
        }
        catch (error) {
            console.error("[AI V2] handleMessage failed", error);
            answer = AI_ERROR_ANSWER;
        }
        await aiMessagesService_1.aiMessagesService.append(auth.userId, "assistant", answer);
        return res.status(200).json({ answer, suggestions: [] });
    }
    catch (error) {
        console.error("[AI V2] ask failed", error);
        try {
            const auth = (0, requestAuth_1.getAuthPayload)(req);
            await aiMessagesService_1.aiMessagesService.append(auth.userId, "assistant", AI_ERROR_ANSWER);
        }
        catch {
            /* ignore */
        }
        return res.status(200).json({ answer: AI_ERROR_ANSWER, suggestions: [] });
    }
};
exports.aiAskV2Controller = aiAskV2Controller;
