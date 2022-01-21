import * as cdk from '@aws-cdk/core';
import * as codebuild from '@aws-cdk/aws-codebuild';
import * as logs from '@aws-cdk/aws-logs';

export class OcCodebuildCdkStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const codebuildProject = new codebuild.Project(this, 'CodebuildProject', {
      projectName: 'oc-codebuild-cdk',
      concurrentBuildLimit: 1,
      source: codebuild.Source.bitBucket({
        webhook: true,
        branchOrRef: 'jluker-codebuild',
        owner: 'hudcede',
        repo: 'matterhorn-dce-fork'
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
