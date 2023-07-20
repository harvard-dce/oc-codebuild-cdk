# Opencast Codebuild w/ CDK!

This project creates several AWS codebuild projects for pre-building parts of our Opencast Opsworks deployment. It uses TypeScript and the AWS CDK library to create and connect the majority of AWS resources.

##### Things you will need

* local git clone of this project
* an existing S3 bucket
* an Oauth connection to BitBucket and GitHub configured in your [AWS Codebuild settings](https://us-east-1.console.aws.amazon.com/codesuite/settings/connections):
* at least one AWS Parameter Store entry with a few configuration settings
* the appropriate `buildspec.yml` files in their respective software projects
* One or more Slack webhook urls for posting notifications

##### What it creates

* 3 Codebuild projects:
    * 1 that builds Opencast profile packages (admin, worker, etc)
    * 1 that only runs the Opencast tests
    * 1 that builds the mh-opsworks-recipes custom chef cookbook
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
1. The slack URLs are enough to begin recieving notifications in whatever channel the URLs
   are created for, but to complete the SNS notification setup you must manually subscribe
   and confirm one or more endpoints via the SNS service. The SNS topic name will be
   "${cdkStackName}-notifications".

### Codebuild Projects

The deploy operation will create three Codebuild projects named according to your
`cdkStackName` value.

- ${cdkStackName}-build
- ${cdkStackName}-test-runner
- ${cdkStackName}-cookbook-build

##### build

This project will build the three Opencast profiles: admin, presentation (engage), and worker,
and place the resulting tar-gzipped artifacts in the artifact bucket with object keys matching
the git branch or tag that triggered the build. It is triggered by any git push to the repo and
relies on the `buildspec.yml` in the root directory of the Opencast project. By default tests
are skipped, unless trigger looks like a release tag.

Example s3 object produced: `${artifactBucketName}/opencast/branch-or-tag-name/admin.tgz`

##### test-runner

Runs the Opencast tests. No artifacts are produced. Triggered by pull request creation/updates. Relies
on the `buildspec-tests.yml` file in the Opencast project. Only triggered by pull request actions.

##### cookbook-build

Packages the mh-opsworks-recipes custom cookbook and puts the result in the artifact bucket. Relies on
the `buildspec.yml` definition in the source. Triggered by any push to the repo.  Example s3 object 
produced: `${artifactBucketName}/cookbook/branch-or-tag-name/mh-opsworks-recipes-branch-or-tag-name.tar.gz`
