import * as cdk from "aws-cdk-lib";
import * as budgets from "aws-cdk-lib/aws-budgets";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as actions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subscriptions from "aws-cdk-lib/aws-sns-subscriptions";

/**
 * BillingStack -- $10/month hard cap with early warning at $8.
 *
 * Deploys:
 * - AWS Budget ($10/month, alerts at 80% and 100%)
 * - CloudWatch billing alarm (triggers at $8 estimated charges)
 * - SNS topic + email subscription for alerts
 */
export class BillingStack extends cdk.Stack {
  constructor(scope, id, props) {
    super(scope, id, props);

    const alertEmail = new cdk.CfnParameter(this, "AlertEmail", {
      type: "String",
      description: "Email address for billing alerts",
      default: "billing@example.com",
    });

    const billingTopic = new sns.Topic(this, "BillingAlertTopic", {
      topicName: "outreach-tool-billing-alerts",
    });

    billingTopic.addSubscription(
      new subscriptions.EmailSubscription(alertEmail.valueAsString)
    );

    new budgets.CfnBudget(this, "MonthlyBudget", {
      budget: {
        budgetName: "OutreachTool-Monthly-10USD",
        budgetType: "COST",
        timeUnit: "MONTHLY",
        budgetLimit: {
          amount: 10,
          unit: "USD",
        },
      },
      notificationsWithSubscribers: [
        {
          notification: {
            notificationType: "ACTUAL",
            comparisonOperator: "GREATER_THAN",
            threshold: 80,
            thresholdType: "PERCENTAGE",
          },
          subscribers: [
            {
              subscriptionType: "SNS",
              address: billingTopic.topicArn,
            },
          ],
        },
        {
          notification: {
            notificationType: "ACTUAL",
            comparisonOperator: "GREATER_THAN",
            threshold: 100,
            thresholdType: "PERCENTAGE",
          },
          subscribers: [
            {
              subscriptionType: "SNS",
              address: billingTopic.topicArn,
            },
          ],
        },
      ],
    });

    const billingAlarm = new cloudwatch.Alarm(this, "BillingAlarm8USD", {
      alarmName: "OutreachTool-EstimatedCharges-8USD",
      alarmDescription: "Triggers when estimated AWS charges exceed $8",
      metric: new cloudwatch.Metric({
        namespace: "AWS/Billing",
        metricName: "EstimatedCharges",
        dimensionsMap: { Currency: "USD" },
        statistic: "Maximum",
        period: cdk.Duration.hours(6),
      }),
      threshold: 8,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    billingAlarm.addAlarmAction(new actions.SnsAction(billingTopic));
  }
}
