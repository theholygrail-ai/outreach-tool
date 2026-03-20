#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { BillingStack } from "../lib/billing-stack.js";
import { DataStack } from "../lib/data-stack.js";
import { ApiStack } from "../lib/api-stack.js";

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || "us-east-1",
};

new BillingStack(app, "OutreachTool-Billing", { env });
const dataStack = new DataStack(app, "OutreachTool-Data", { env });
new ApiStack(app, "OutreachTool-Api", { env, table: dataStack.table });
