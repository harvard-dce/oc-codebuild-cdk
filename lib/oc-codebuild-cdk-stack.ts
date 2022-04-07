import * as cdk from '@aws-cdk/core';
import * as codebuild from '@aws-cdk/aws-codebuild';
import * as logs from '@aws-cdk/aws-logs';
import * as s3 from '@aws-cdk/aws-s3';

export class OcCodebuildCdkStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const buildBucket = s3.Bucket.fromBucketName(this, 'BuildBucket', 'oc-codebuild-artifacts');

    const codebuildProject = new codebuild.Project(this, 'CodebuildProject', {
      projectName: 'oc-codebuild-cdk',
      concurrentBuildLimit: 1,
      source: codebuild.Source.bitBucket({
        webhook: true,
        branchOrRef: 'jluker-codebuild',
        owner: 'hudcede',
        repo: 'matterhorn-dce-fork',
        webhookFilters: [
          codebuild.FilterGroup
            .inEventOf(
              codebuild.EventAction.PUSH,
              codebuild.EventAction.PULL_REQUEST_CREATED,
              codebuild.EventAction.PULL_REQUEST_UPDATED,
              codebuild.EventAction.PULL_REQUEST_MERGED,
            )
        ]
      }),
      environment: {
        computeType: codebuild.ComputeType.LARGE,
        buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2,
      },
      cache: codebuild.Cache.bucket(buildBucket),
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
              "SKIP_TESTS": "-DskipTests -Dcheckstyle.skip=true",
              "MAVEN_COMMAND": "clean install"
            }
          },
          "phases": {
            "install": {
              "runtime-versions": {
                "java": "corretto8"
              },
              "commands": [
                "wget --no-verbose -O /opt/ffmpeg.tgz https://s3.amazonaws.com/mh-opsworks-shared-assets/ffmpeg-4.4.1-amazon-linux-static.tgz && /bin/tar -C /opt -xzf /opt/ffmpeg.tgz"
              ]
            },
            "build": {
              "commands": [
                "echo Build started on `date`",
                "export PATH=\"/opt/ffmpeg-4.4.1:${PATH}\"",
                "export TZ=US/Eastern",
                "TRIGGER_TYPE=$(echo $CODEBUILD_WEBHOOK_TRIGGER | cut -d'/' -f1)",
                "if [ \"$TRIGGER_TYPE\" = \"pr\" ]; then SKIP_TESTS=\"\" ; MAVEN_COMMAND=\"test\" ; fi",
                "export TRIGGER_BRANCH_OR_TAG=$(echo $CODEBUILD_WEBHOOK_TRIGGER | cut -d'/' -f2- | sed -e 's/\\//-/g')",
                "if [[ $TRIGGER_BRANCH_OR_TAG =~ ^DCE-[0-9\\.\\-]+(-hotfix|-rc[0-9])?$ ]] ; then SKIP_TESTS=\"\" ; fi",
                "echo $MAVEN_COMMAND",
                "echo $SKIP_TESTS",
                "mvn -Dmaven.repo.local=/opt/.m2/repository $MAVEN_COMMAND $SKIP_TESTS -Padmin,presentation,worker"
              ]
            },
            "post_build": {
              "commands": [
                "echo Build completed on `date`",
                "tar -C ./build/opencast-dist-admin-5-SNAPSHOT -czf ./build/admin.tgz .",
                "tar -C ./build/opencast-dist-presentation-5-SNAPSHOT -czf ./build/presentation.tgz .",
                "tar -C ./build/opencast-dist-worker-5-SNAPSHOT -czf ./build/worker.tgz .",
                "export ARTIFACT_PATH=$TRIGGER_BRANCH_OR_TAG"
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
            "name": "$ARTIFACT_PATH"
          }
        }
      ),
      logging: {
        cloudWatch: {
          logGroup: new logs.LogGroup(this, `LogGroup`, {
            logGroupName: '/oc-codebuild-cdk'
          }),
        }
      },
    })
  }
}
