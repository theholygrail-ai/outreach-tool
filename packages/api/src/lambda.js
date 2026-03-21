/**
 * AWS Lambda handler — HTTP API via serverless-http + Express (app.js).
 * Stashes the raw Lambda event body so the fallback body parser middleware
 * in app.js can recover it when Express 5's built-in json parser fails to
 * read the serverless-http mock stream.
 */
import serverlessExpress from "serverless-http";
import { app } from "./app.js";

const serverless = serverlessExpress(app);

let _rawBody = null;
app._getLambdaRawBody = () => _rawBody;

export const handler = async (event, context) => {
  let body = event.body || null;
  if (body && event.isBase64Encoded) {
    body = Buffer.from(body, "base64").toString("utf-8");
  }
  _rawBody = body;
  const result = await serverless(event, context);
  _rawBody = null;
  return result;
};
