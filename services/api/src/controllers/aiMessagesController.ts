import type { Request, Response } from "express";
import { getAuthPayload } from "../utils/requestAuth";
import { aiMessagesService } from "../services/aiMessagesService";

export const aiMessagesListController = async (req: Request, res: Response) => {
  const auth = getAuthPayload(req);
  const messages = await aiMessagesService.listByUserId(auth.userId);
  return res.status(200).json({ messages });
};

export const aiMessagesClearController = async (req: Request, res: Response) => {
  const auth = getAuthPayload(req);
  await aiMessagesService.clearByUserId(auth.userId);
  return res.status(200).json({ ok: true });
};
