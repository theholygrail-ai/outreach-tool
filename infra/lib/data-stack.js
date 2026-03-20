import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";

/**
 * DataStack -- Free-tier-only storage resources.
 *
 * Deploys:
 * - S3 bucket for assets (screenshots, designs, outreach content)
 *   - No versioning (cost), lifecycle expires objects after 90 days
 * - DynamoDB table (on-demand billing, single-table design)
 *   - Stays within 25 RCU / 25 WCU free tier
 */
export class DataStack extends cdk.Stack {
  constructor(scope, id, props) {
    super(scope, id, props);

    const assetBucket = new s3.Bucket(this, "AssetBucket", {
      bucketName: `outreach-tool-assets-${this.account}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      versioned: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      lifecycleRules: [
        {
          id: "expire-after-90-days",
          expiration: cdk.Duration.days(90),
          enabled: true,
        },
      ],
    });

    const dataTable = new dynamodb.Table(this, "DataTable", {
      tableName: "outreach-tool-data",
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "SK", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: "ttl",
    });

    dataTable.addGlobalSecondaryIndex({
      indexName: "GSI1",
      partitionKey: { name: "GSI1PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "GSI1SK", type: dynamodb.AttributeType.STRING },
    });

    /** Referenced by ApiStack for IAM grants */
    this.table = dataTable;
    this.bucket = assetBucket;

    new cdk.CfnOutput(this, "BucketName", { value: assetBucket.bucketName });
    new cdk.CfnOutput(this, "TableName", { value: dataTable.tableName });
  }
}
