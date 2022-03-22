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
        repo: 'matterhorn-dce-fork'
      }),
      environment: {
        computeType: codebuild.ComputeType.MEDIUM,
        buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2,
      },
      cache: codebuild.Cache.bucket(buildBucket),
      artifacts: codebuild.Artifacts.s3({
        bucket: buildBucket,
        includeBuildId: false,

      }),
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
