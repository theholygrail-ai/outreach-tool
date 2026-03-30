import * as path from "path";
import { fileURLToPath } from "url";
import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "../..");

/**
 * Non-secret env only — API keys must be set in the AWS Lambda console (or SSM) after deploy
 * so they never appear in CloudFormation templates.
 */
function buildLambdaEnv(tableName, bucketName, options = {}) {
  const env = {
    NODE_ENV: "production",
    AWS_NODEJS_CONNECTION_REUSE_ENABLED: "1",
    DYNAMO_TABLE: tableName,
    S3_BUCKET: bucketName,
    SES_REGION: process.env.SES_REGION || "us-east-1",
  };
  if (options.pipelineWorkerName) {
    env.PIPELINE_WORKER_FUNCTION_NAME = options.pipelineWorkerName;
  }
  return env;
}

export class ApiStack extends cdk.Stack {
  /**
   * @param {cdk.App} scope
   * @param {string} id
   * @param {cdk.StackProps & { table: dynamodb.ITable; bucket: s3.IBucket }} props
   */
  constructor(scope, id, props) {
    super(scope, id, props);
    const { table, bucket } = props;

    const bundling = {
      format: OutputFormat.ESM,
      target: "node20",
      minify: true,
      sourceMap: true,
      banner:
        "import { createRequire } from 'module';const require=createRequire(import.meta.url);",
      externalModules: [],
    };

    /** Playwright must not be esbuild-bundled (breaks chromium / CDP). Install into Lambda node_modules instead. */
    const playwrightNodeModules = ["playwright", "playwright-core", "chromium-bidi"];
    const workerBundling = {
      ...bundling,
      nodeModules: playwrightNodeModules,
    };
    const httpApiBundling = {
      ...bundling,
      nodeModules: playwrightNodeModules,
    };

    const workerFn = new NodejsFunction(this, "PipelineWorkerFn", {
      entry: path.join(repoRoot, "packages/api/src/worker-lambda.js"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.minutes(15),
      memorySize: 3008,
      environment: {
        ...buildLambdaEnv(table.tableName, bucket.bucketName),
        PLAYWRIGHT_ENABLED: process.env.PLAYWRIGHT_ENABLED || "0",
      },
      bundling: workerBundling,
    });
    table.grantReadWriteData(workerFn);
    bucket.grantReadWrite(workerFn);
    workerFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["ses:SendEmail", "ses:SendRawEmail", "ses:ListEmailIdentities"],
        resources: ["*"],
      }),
    );

    const apiFn = new NodejsFunction(this, "HttpApiFn", {
      entry: path.join(repoRoot, "packages/api/src/lambda.js"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(29),
      memorySize: 512,
      environment: buildLambdaEnv(table.tableName, bucket.bucketName, {
        pipelineWorkerName: workerFn.functionName,
      }),
      bundling: httpApiBundling,
    });
    table.grantReadWriteData(apiFn);
    bucket.grantReadWrite(apiFn);
    apiFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["ses:SendEmail", "ses:SendRawEmail", "ses:ListEmailIdentities"],
        resources: ["*"],
      }),
    );
    workerFn.grantInvoke(apiFn);

    const fnUrl = apiFn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedOrigins: ["*"],
        allowedMethods: [lambda.HttpMethod.ALL],
        allowedHeaders: ["*"],
        maxAge: cdk.Duration.hours(1),
      },
    });

    new cdk.CfnOutput(this, "ApiFunctionUrl", {
      value: fnUrl.url,
      description: "Set VITE_API_URL on Vercel to this value (no trailing slash)",
    });
    new cdk.CfnOutput(this, "PipelineWorkerFnName", { value: workerFn.functionName });
    new cdk.CfnOutput(this, "AssetBucketName", {
      value: bucket.bucketName,
      description: "S3 bucket for assets (also in Lambda env as S3_BUCKET)",
    });
  }
}
