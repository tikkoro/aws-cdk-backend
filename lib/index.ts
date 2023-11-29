import * as cdk from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import * as path from "path";

// Parent Stack
export class RootStack extends cdk.Stack {
  fastapiStack: FastapiStack;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    this.fastapiStack = new FastapiStack(this, "FastapiStack");
    const { apiGw } = this.fastapiStack;

    new cdk.CfnOutput(this, "URL", {
      value: `${apiGw.url}`,
    });
  }
}

// Stack for Lambda and APIGateway
class FastapiStack extends cdk.Stack {
  apiGw: apigateway.RestApi;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Lambda role
    const lambdaRole = new iam.Role(this, "lambdaRole", {
      roleName: "fastapi-sample-lambda-role",
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      description: "IAM role used by AWS Transfer for logging",
      inlinePolicies: {
        loggingRole: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: [
                "logs:CreateLogGroup",
                "logs:CreateLogStream",
                "logs:PutLogEvents",
              ],
              resources: [`*`],
              effect: iam.Effect.ALLOW,
            }),
          ],
        }),
      },
    });

    // Create lambda layer
    const lambdaLayer = new lambda.LayerVersion(this, "CustomLayer", {
      layerVersionName: "fastapi_sample_layer",
      code: lambda.Code.fromAsset(path.join(__dirname, "../lambda_layer")),
      compatibleRuntimes: [lambda.Runtime.PYTHON_3_11],
      description: "Fastapi and Mangum library for lambda layer",
    });

    // Create lambda function
    const lambdaFunction = new lambda.Function(this, "handler", {
      functionName: "fastapi_sample",
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: "app.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "../src")),
      layers: [lambdaLayer], // lambda layer
      role: lambdaRole,
    });

    // Create APIGateway
    this.apiGw = new apigateway.RestApi(this, "fastapi-sample-apigw", {
      restApiName: "fastapi-sample-apigw",
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
      apiKeySourceType: apigateway.ApiKeySourceType.HEADER,
    });

    // Add stage
    const deployment = new apigateway.Deployment(this, "Deployment", {
      api: this.apiGw,
    });

    const prodStage = new apigateway.Stage(this, "prod", {
      deployment,
      loggingLevel: apigateway.MethodLoggingLevel.INFO,
    });

    // Create path
    const lambdaIntegration = new apigateway.LambdaIntegration(lambdaFunction);
    const root = this.apiGw.root.addResource("{proxy+}");
    root.addMethod("GET", lambdaIntegration, { apiKeyRequired: true });

    // Invalid api key config for fastapi swagger
    this.apiGw.root.addResource("docs").addMethod("GET", lambdaIntegration);
    this.apiGw.root
      .addResource("openapi.json")
      .addMethod("GET", lambdaIntegration);

    // Create API key
    const apiKey = this.apiGw.addApiKey("APIKey", {
      apiKeyName: "fastapi-sample-apikey",
    });

    // Create usage plan
    const plan = this.apiGw.addUsagePlan("UsagePlan", {
      name: "fastapi-sample-usageplan",
    });
    plan.addApiKey(apiKey);
    plan.addApiStage({ stage: this.apiGw.deploymentStage });
    plan.addApiStage({ stage: prodStage });

    // Add Permission to additional stage (prod)
    new lambda.CfnPermission(this, "secondStageInvoke", {
      action: "lambda:InvokeFunction",
      functionName: lambdaFunction.functionName,
      principal: "apigateway.amazonaws.com",
      sourceArn:
        "arn:aws:execute-api:" +
        this.region +
        ":" +
        this.account +
        ":" +
        this.apiGw.restApiId +
        "/" +
        prodStage.stageName +
        "/GET/" +
        "{proxy+}",
    });
  }
}
