import * as cdk from '@aws-cdk/core';
import * as codebuild from '@aws-cdk/aws-codebuild';
import * as logs from '@aws-cdk/aws-logs';
import * as s3 from '@aws-cdk/aws-s3';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
import * as sns from '@aws-cdk/aws-sns';
import * as ssm from '@aws-cdk/aws-ssm';
import { Duration } from '@aws-cdk/core';
import * as path from 'path';

export interface OpencastCodebuildProps extends cdk.StackProps {
  slackNotifyUrl: string,
  artifactBucketName: string,
  cdkStackName: string;
}

export class OpencastCodebuild extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: OpencastCodebuildProps) {
    super(scope, id, props);

    const {
      slackNotifyUrl,
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
      timeout: Duration.seconds(60),
      code: lambda.Code.fromAsset(`${path.resolve(__dirname)}/assets/notify-function`),
      environment: {
        SLACK_NOTIFY_URL: slackNotifyUrl,
        SNS_TOPIC_ARN: topic.topicArn,
      }
    });

    topic.grantPublish(notifyFunction);

    const logGroup = new logs.LogGroup(this, `LogGroup`, {
      logGroupName: `/codebuild/${cdkStackName}`,
      retention: logs.RetentionDays.SIX_MONTHS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const buildProject = new codebuild.Project(this, 'BuildProject', {
      projectName: `${cdkStackName}-build`,
      // this depends on the oauth connection to bitbucket being established already; done via web console
      source: codebuild.Source.bitBucket({
        webhook: true,
        identifier: 'opencast_build',
        owner: 'hudcede',
        repo: 'matterhorn-dce-fork',
        webhookFilters: [
          codebuild.FilterGroup.inEventOf(codebuild.EventAction.PUSH),
        ],
      }),
      environment: {
        computeType: codebuild.ComputeType.LARGE,
        buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2,
      },
      environmentVariables: {
        NOTIFY_FUNCTION: { value: notifyFunction.functionArn },
      },
      cache: codebuild.Cache.bucket(
        buildBucket,
        { prefix: '.build-cache' }
      ),
      artifacts: codebuild.Artifacts.s3({
        bucket: buildBucket,
        includeBuildId: false,
        packageZip: false,
      }),
      buildSpec: codebuild.BuildSpec.fromObjectToYaml(
        {
          "version": 0.2,
          "env": {
            "shell": "bash",
            "variables": {
              "_COMMENT": "default is to build without tests",
              "SKIP_TESTS": "-DskipTests -Dcheckstyle.skip=true",
            },
          },
          "phases": {
            "install": {
              "runtime-versions": {
                "java": "corretto8",
              },
              "commands": [
                "printenv",
              ],
            },
            "build": {
              "commands": [
                "echo Build started on `date`",
                "echo aws cli version `aws --version`",
                "# webhook triggered runs will have CODEBUILD_WEBHOOK_TRIGGER, e.g. `tag/[tag name]`, `branch/[branch name]` or `pr/[pr number]`",
                "# branch/tag runs will have CODEBUILD_WEBHOOK_HEAD_REF, e.g. `refs/heads/[branch|tag name]`",
                "# manually triggered runs will only have CODEBUILD_SOURCE_VERSION",
                "# get the tag or branch name to use as the s3 object path",
                "TRIGGER_BRANCH_OR_TAG=$CODEBUILD_WEBHOOK_TRIGGER",
                "if [ -z \"$TRIGGER_BRANCH_OR_TAG\" ]; then TRIGGER_BRANCH_OR_TAG=\"manual/${CODEBUILD_SOURCE_VERSION}\"; fi",
                "# - at this point TRIGGER_BRANCH_OR_TAG should look like `branch/[branch name]`, `tag/[tag name]`, or `manual/[branch or tag]`",
                "# - `cut` with `-f2-` will cut off the leading token (i.e. `branch/` or `tag/`) leaving other `/` characters intact",
                "# - `sed` will replace any remaning `/` with `-`",
                "export TRIGGER_BRANCH_OR_TAG=$(echo $TRIGGER_BRANCH_OR_TAG | cut -d'/' -f2- | sed -e 's/\\//-/g')",
                "# release tag examles: DCE/5.0.0-1.8.0, DCE/5.0.0-1.8.0-rc1, DCE/5.0.0-1.8.0-hotfix",
                "if [[ $TRIGGER_BRANCH_OR_TAG =~ ^DCE-[0-9\\.\\-]+(-hotfix|-rc[0-9])?$ ]] ; then SKIP_TESTS=\"\" ; fi",
                "echo test options '$SKIP_TESTS'",
                "# run the maven command",
                "mvn -Dmaven.repo.local=/opt/.m2/repository clean install $SKIP_TESTS -Padmin,presentation,worker",
              ],
            },
            "post_build": {
              "commands": [
                "if [[ $CODEBUILD_BUILD_SUCCEEDING != 0 ]]; then exit 255 ; else echo Build completed on `date` ; fi",
                "tar -C ./build/opencast-dist-admin-5-SNAPSHOT -czf ./build/admin.tgz .",
                "tar -C ./build/opencast-dist-presentation-5-SNAPSHOT -czf ./build/presentation.tgz .",
                "tar -C ./build/opencast-dist-worker-5-SNAPSHOT -czf ./build/worker.tgz ."
              ],
              "finally": [
                "payload={\\\"build_id\\\":\\\"$CODEBUILD_BUILD_ID\\\",\\\"build_url\\\":\\\"$CODEBUILD_BUILD_URL\\\",\\\"trigger_branch_or_tag\\\":\\\"$TRIGGER_BRANCH_OR_TAG\\\"}",
                "aws lambda invoke --function-name $NOTIFY_FUNCTION --payload $payload response.json",
                "cat response.json",
              ],
            },
          },
          "cache": {
            "paths": [
              "/opt/.m2/",
            ],
          },
          "artifacts": {
            "discard-paths": true,
            "files": [
              "build/*.tgz",
            ],
            "name": "$TRIGGER_BRANCH_OR_TAG",
          },
        }
      ),
      logging: {
        cloudWatch: {
          logGroup,
          prefix: 'build',
        }
      },
    });

    const testsProject = new codebuild.Project(this, 'TestRunnerProject', {
      projectName: `${cdkStackName}-test-runner`,
      source: codebuild.Source.bitBucket({
        webhook: true,
        identifier: 'opencast_test_runner',
        owner: 'hudcede',
        repo: 'matterhorn-dce-fork',
        webhookFilters: [
          codebuild.FilterGroup
            .inEventOf(
              codebuild.EventAction.PULL_REQUEST_CREATED,
              codebuild.EventAction.PULL_REQUEST_UPDATED,
              codebuild.EventAction.PULL_REQUEST_MERGED,
            ),
        ],
      }),
      environment: {
        computeType: codebuild.ComputeType.LARGE,
        buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2,
      },
      cache: codebuild.Cache.bucket(
        buildBucket,
        { prefix: '.test-runner-cache' },
      ),
      buildSpec: codebuild.BuildSpec.fromObjectToYaml(
        {
          "version": 0.2,
          "env": {
            "shell": "bash",
          },
          "phases": {
            "install": {
              "runtime-versions": {
                "java": "corretto8"
              },
              "commands": [
                "printenv",
                "# ffmpeg is needed by some of the tests",
                "wget --no-verbose -O /opt/ffmpeg.tgz https://s3.amazonaws.com/mh-opsworks-shared-assets/ffmpeg-4.4.1-amazon-linux-static.tgz && /bin/tar -C /opt -xzf /opt/ffmpeg.tgz"
              ],
            },
            "build": {
              "on-failure": "ABORT",
              "commands": [
                "echo Build started on `date`",
                "export PATH=\"/opt/ffmpeg-4.4.1:${PATH}\"",

                "# set the timezone so dates generated during tests can match the expected output",
                "export TZ=US/Eastern",

                "# run the maven command",
                "mvn -Dmaven.repo.local=/opt/.m2/repository test -Pnone"
              ],
            },
          },
          "cache": {
            "paths": [
              "build/",
              "/opt/.m2/",
            ],
          },
        },
      ),
      logging: {
        cloudWatch: {
          logGroup,
          prefix: 'test-runner',
        },
      },
    });

    // allow both build projects to invoke the lambda
    notifyFunction.grantInvoke(buildProject.role as iam.Role);
    notifyFunction.grantInvoke(testsProject.role as iam.Role);

    // allow the lambda to get info about the builds
    notifyFunction.role?.addManagedPolicy(
      iam.ManagedPolicy.fromManagedPolicyArn(this, 'CodebuildReadOnlyPolicy', 'arn:aws:iam::aws:policy/AWSCodeBuildReadOnlyAccess'),
    );

  }
}
