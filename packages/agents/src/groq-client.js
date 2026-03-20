import OpenAI from "openai";
import { config } from "@outreach-tool/shared/config";

export const groq = new OpenAI({
  apiKey: config.groq.apiKey,
  baseURL: config.groq.baseURL,
});

export const MODEL = config.groq.model;
export const MAX_TOKENS = config.groq.maxTokens;
