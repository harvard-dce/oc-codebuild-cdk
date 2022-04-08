import * as cdk from '@aws-cdk/core';
import * as codebuild from '@aws-cdk/aws-codebuild';
import * as logs from '@aws-cdk/aws-logs';
import * as s3 from '@aws-cdk/aws-s3';

export class OpencastCodebuild extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const projectName = 'opencast-codebuild';
    const buildBucket = s3.Bucket.fromBucketName(this, 'BuildBucket', 'opencast-codebuild-artifacts');
    const logGroup = new logs.LogGroup(this, `LogGroup`, {
      logGroupName: `/codebuild/${projectName}`,
      retention: logs.RetentionDays.SIX_MONTHS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const buildProject = new codebuild.Project(this, 'BuildProject', {
      projectName: `${projectName}-build`,
      // this depends on the oauth connection to bitbucket being established already; done via web console
      source: codebuild.Source.bitBucket({
        webhook: true,
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
                "java": "corretto8"
              },
            },
            "build": {
              "on-failure": "ABORT",
              "commands": [
                "echo Build started on `date`",

                "# get the tag or branch name to use as the s3 object path",
                "# - CODEBUILD_WEBHOOK_TRIGGER will look like `branch/[branch name]` or `tag/[tag name]`",
                "# - `cut` with `-f2-` will cut off the leading token (i.e. `branch/` or `tag/`) leaving other `/` characters intact",
                "# - `sed` will replace any remaning `/` with `-`",
                "export TRIGGER_BRANCH_OR_TAG=$(echo $CODEBUILD_WEBHOOK_TRIGGER | cut -d'/' -f2- | sed -e 's/\\//-/g')",

                "# release tag examles: DCE/5.0.0-1.8.0, DCE/5.0.0-1.8.0-rc1, DCE/5.0.0-1.8.0-hotfix",
                "if [[ $TRIGGER_BRANCH_OR_TAG =~ ^DCE-[0-9\\.\\-]+(-hotfix|-rc[0-9])?$ ]] ; then SKIP_TESTS=\"\" ; fi",

                "echo test options '$SKIP_TESTS'",

                "# run the maven command",
                "mvn -Dmaven.repo.local=/opt/.m2/repository clean install $SKIP_TESTS -Padmin,presentation,worker"
              ]
            },
            "post_build": {
              "commands": [
                "echo Build completed on `date`",
                "tar -C ./build/opencast-dist-admin-5-SNAPSHOT -czf ./build/admin.tgz .",
                "tar -C ./build/opencast-dist-presentation-5-SNAPSHOT -czf ./build/presentation.tgz .",
                "tar -C ./build/opencast-dist-worker-5-SNAPSHOT -czf ./build/worker.tgz .",
              ]
            }
          },
          "cache": {
            "paths": [
              "/opt/.m2/**/*"
            ]
          },
          "artifacts": {
            "discard-paths": true,
            "files": [
              "build/*.tgz"
            ],
            "name": "$TRIGGER_BRANCH_OR_TAG"
          }
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
      projectName: `${projectName}-test-runner`,
      source: codebuild.Source.bitBucket({
        webhook: true,
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
              "build/**/*",
              "/opt/.m2/**/*",
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
  }
}
