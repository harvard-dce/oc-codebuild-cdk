import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  aws_codebuild as codebuild,
  aws_logs as logs,
  aws_s3 as s3,
  aws_iam as iam,
  aws_lambda as lambda,
  aws_sns as sns,
  aws_ecr as ecr,
} from 'aws-cdk-lib';
import * as path from 'path';


export interface OpencastCodebuildProps extends cdk.StackProps {
  slackNotifyUrls: { [key: string]: string },
  artifactBucketName: string,
  cdkStackName: string;
}

export class OpencastCodebuild extends cdk.Stack {
  constructor(scope: Construct, id: string, props: OpencastCodebuildProps) {
    super(scope, id, props);

    const {
      slackNotifyUrls,
      artifactBucketName,
      cdkStackName,
    } = props;

    const buildBucket = s3.Bucket.fromBucketName(this, 'BuildBucket', artifactBucketName);

    const topic = new sns.Topic(this, 'NotifyTopic', {
      topicName: `${cdkStackName}-notifications`,
    });

    const notifyFunction = new lambda.Function(this, 'NotifyFunction', {
      runtime: lambda.Runtime.PYTHON_3_9,
      functionName: `${cdkStackName}-notify-function`,
      handler: 'index.handler',
      timeout: cdk.Duration.seconds(60),
      code: lambda.Code.fromAsset(`${path.resolve(__dirname)}/assets/notify-function`),
      environment: {
        SLACK_NOTIFY_URLS: JSON.stringify(slackNotifyUrls),
        SNS_TOPIC_ARN: topic.topicArn,
      },
      initialPolicy: [
        new iam.PolicyStatement({
          actions: ['sns:Publish'],
          effect: iam.Effect.ALLOW,
          resources: [
            topic.topicArn,
          ],
        })
      ]
    });

    topic.grantPublish(notifyFunction);

    const logGroup = new logs.LogGroup(this, `LogGroup`, {
      logGroupName: `/codebuild/${cdkStackName}`,
      retention: logs.RetentionDays.SIX_MONTHS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const computeEnvironment: codebuild.BuildEnvironment = {
      computeType: codebuild.ComputeType.LARGE,
      buildImage: codebuild.LinuxBuildImage.fromEcrRepository(
        ecr.Repository.fromRepositoryName(this, 'EcrRepository', 'hdce/oc-codebuild-environment'),
        '1.0.1',
      ),
    };

    const environmentVariables = {
      NOTIFY_FUNCTION: { value: notifyFunction.functionArn },
    }

    const artifacts: codebuild.IArtifacts = codebuild.Artifacts.s3({
      bucket: buildBucket,
      includeBuildId: false,
      packageZip: false,
      encryption: false,
    });

    // this depends on the oauth connection to bitbucket being established already; done via web console
    const opencastSource = {
      webhook: true,
      owner: 'hudcede',
      repo: 'matterhorn-dce-fork',
    };

    const cookbookSource = {
      webhook: true,
      owner: 'harvard-dce',
      repo: 'mh-opsworks-recipes',
    };

    const buildProject = new codebuild.Project(this, 'BuildProject', {
      projectName: `${cdkStackName}-build`,
      artifacts,
      environmentVariables,
      environment: computeEnvironment,
      cache: codebuild.Cache.bucket(
        buildBucket,
        { prefix: '.build-cache' }
      ),
      source: codebuild.Source.bitBucket({
        ...opencastSource,
        identifier: 'opencast_build',
        webhookFilters: [
          codebuild.FilterGroup.inEventOf(codebuild.EventAction.PUSH),
        ],
      }),
      logging: {
        cloudWatch: {
          logGroup,
          prefix: 'build',
        }
      },
    });

    const testRunnerProject = new codebuild.Project(this, 'TestRunnerProject', {
      projectName: `${cdkStackName}-test-runner`,
      buildSpec: codebuild.BuildSpec.fromSourceFilename('buildspec-tests.yml'),
      cache: codebuild.Cache.bucket(
        buildBucket,
        { prefix: '.test-runner-cache' }
      ),
      environmentVariables,
      environment: computeEnvironment,
      source: codebuild.Source.bitBucket({
        ...opencastSource,
        identifier: 'opencast_test_runner',
        webhookFilters: [
          codebuild.FilterGroup
            .inEventOf(
              codebuild.EventAction.PULL_REQUEST_CREATED,
              codebuild.EventAction.PULL_REQUEST_UPDATED,
              codebuild.EventAction.PULL_REQUEST_MERGED,
            ),
        ],
      }),
      logging: {
        cloudWatch: {
          logGroup,
          prefix: 'test-runner',
        },
      },
    });

    const cookbookProject = new codebuild.Project(this, 'CookbookProject', {
      projectName: `${cdkStackName}-cookbook-build`,
      artifacts,
      environmentVariables,
      environment: {
        computeType: codebuild.ComputeType.LARGE,
        buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
      },
      source: codebuild.Source.gitHub({
        ...cookbookSource,
        identifier: 'opencast_cookbook',
        webhookFilters: [
          codebuild.FilterGroup.inEventOf(codebuild.EventAction.PUSH),
        ],
      })
    })

    // allow all build projects to invoke the lambda
    notifyFunction.grantInvoke(buildProject.role as iam.Role);
    notifyFunction.grantInvoke(testRunnerProject.role as iam.Role);
    notifyFunction.grantInvoke(cookbookProject.role as iam.Role);

    // allow the lambda to get info about the builds
    notifyFunction.role?.addManagedPolicy(
      iam.ManagedPolicy.fromManagedPolicyArn(this, 'CodebuildReadOnlyPolicy', 'arn:aws:iam::aws:policy/AWSCodeBuildReadOnlyAccess'),
    );

  }
}
