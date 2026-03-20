/**
 * AWS Lambda handler — HTTP API via serverless-http + Express (app.js).
 */
import serverlessExpress from "serverless-http";
import { app } from "./app.js";

export const handler = serverlessExpress(app);
