# Opencast Codebuild w/ CDK!

This project creates several AWS codebuild projects for pre-building parts of our Opencast ECS deployment. It uses TypeScript and the AWS CDK library to create and connect the majority of AWS resources.

##### Things you will need

* local git clone of this project
* an existing S3 bucket
* an Oauth connection to BitBucket and GitHub configured in your [AWS Codebuild settings](https://us-east-1.console.aws.amazon.com/codesuite/settings/connections):
* at least one AWS Parameter Store entry with a few configuration settings
* the appropriate `buildspec.yml` files in their respective software projects
* One or more Slack webhook urls for posting notifications

##### What it creates

* 2 Codebuild projects:
    * 1 that builds the Opencast docker images and pushes them to ECR (admin, worker, etc)
    * 1 that only runs the Opencast tests
* a CloudWatch log group where all the build logging output goes
* a Lambda funciton and SNS topic for sending notifications
* the IAM roles and policies necessary for the things to run

### Setup

1. After cloning the project run `npm install` in the top-level directory
1. Create a configuration entry in AWS Parameter Store. The parameter name should be
   something like `/opencast-codebuild/cdk-config/foo` where `foo` is the name of
   your this particular configuration. Slack webhook urls are considered sensitive,
   so make the param a SecureString type. The value of the parameter should look like:
   ```
    {
      "slackNotifyUrls": {
        "OpencastCodebuild-build": "https://hooks.slack.com/services/...",
        "OpencastCodebuild-test-runner": "https://hooks.slack.com/services/...",
        "OpencastCodebuild-cookbook-build": "https://hooks.slack.com/services/..."
      },
      "artifactBucketName": "opencast-codebuild-artifacts",
      "cdkStackName": "OpencastCodebuild"
    }
   ```
   You can use the same slack webhook for all three projects, but it won't be as easy
   to differentiate what project the messages relate to.
1. Run `OPENCAST_CODEBUILD_ENVIRONMENT=foo ./node_modules/.bin/cdk list` to sanity check
   configuration.
1. Run `OPENCAST_CODEBUILD_ENVIRONMENT=foo ./node_modules/.bin/cdk deploy` to create the
   AWS resources
1. The slack URLs are enough to begin receiving notifications in whatever channel the URLs
   are created for, but to complete the SNS notification setup you must manually subscribe
   and confirm one or more endpoints via the SNS service. The SNS topic name will be
   "${cdkStackName}-notifications".

### Codebuild Projects

The deploy operation will create two Codebuild projects named according to your
`cdkStackName` value.

- ${cdkStackName}-image-build
- ${cdkStackName}-test-runner

##### image-build

This project will invoke the `buildspec.yml` in the root directory of the 
[opencast-ecs-images](https://github.com/harvard-dce/opencast-ecs-images) repo,
which uses the `Makefile` to build the three Opencast docker images: admin, engage, and worker,
and publish them to AWS ECR `hdce/opencast`.
The images are tagged using the opencast-ecs-images repo branch and
the Opencast repo branch.
This build is not triggered by pull requests; it is run via script in `opencast-ecs-images`.

Tag examples: `main_develop-15.x`, `release-2.0.0_15.5.0-2.1.0`

##### test-runner

Runs the Opencast tests. No artifacts are produced. Triggered by pull request creation/updates. Relies
on the `buildspec-tests.yml` file in the [Opencast](https://bitbucket.org/hudcede/matterhorn-dce-fork) project. Only triggered by pull request actions.
