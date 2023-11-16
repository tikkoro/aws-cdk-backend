import * as cdk from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import * as path from "path";

// 親スタック
export class MainStack extends cdk.Stack {
  fastapiStack: FastapiStack;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    new FastapiStack(this, "FastapiStack");
    // this.fastapiStack = new FastapiStack(this, "FastapiStack");
  }
}

// 子スタック
class FastapiStack extends cdk.NestedStack {
  constructor(scope: Construct, id: string, props?: cdk.NestedStackProps) {
    super(scope, id, props);

    // lambdaに付与するcloudwatch logsロール
    const cloudWatchLoggingRole = new iam.Role(this, "CloudWatchLoggingRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      description: "IAM role used by AWS Transfer for logging",
      inlinePolicies: {
        loggingRole: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: [
                "logs:CreateLogGroup",
                "logs:CreateLogStream",
                "logs:DescribeLogStreams",
                "logs:PutLogEvents",
              ],
              resources: [`*`],
              effect: iam.Effect.ALLOW,
            }),
          ],
        }),
      },
    });

    // lambda layerの作成
    const lambdaLayer = new lambda.LayerVersion(this, "CustomLayer", {
      code: lambda.Code.fromAsset(path.join(__dirname, "../lambda_layer")),
      compatibleRuntimes: [lambda.Runtime.PYTHON_3_11],
      description: "lambda layer Fastapi and Mangum library",
    });

    // Lambda関数の作成
    const lambdaFunction = new lambda.Function(this, "handler", {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: "app.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "../src")),
      layers: [lambdaLayer], // レイヤーを設定
      role: cloudWatchLoggingRole,
    });

    // api gatewayの作成
    const apiGw = new apigateway.RestApi(this, "fastapi-apigw", {
      restApiName: "fastapi-apigw",
      deployOptions: {
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: true,
        metricsEnabled: true,
        stageName: "dev",
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: apigateway.Cors.DEFAULT_HEADERS,
        statusCode: 200,
      },
      endpointTypes: [apigateway.EndpointType.REGIONAL],
    });

    const lambdaIntegration = new apigateway.LambdaIntegration(lambdaFunction);
    const root = apiGw.root.addResource("{proxy+}");
    root.addMethod("GET", lambdaIntegration);
    // apiGw.root.addResource("sample");
  }
}
