# Opencast Codebuild w/ CDK!

This project creates several AWS codebuild projects for pre-building parts of our Opencast Opsworks deployment. It uses TypeScript and the AWS CDK library to create and connect the majority of AWS resources.

##### Things you will need

* local git clone of this project
* an existing S3 bucket
* at least one AWS Parameter Store entry with a few configuration settings
* the appropriate `buildspec.yml` files in their respective software projects

##### What it creates

* 3 Codebuild projects:
    * 1 that builds Opencast profile packages (admin, worker, etc)
    * 1 that only runs the Opencast tests
    * 1 that builds the mh-opsworks-recipes custom chef cookbook
* a CloudWatch log group where all the build logging output goes
* a Lambda funciton and SNS topic for sending notifications
* the IAM roles and policies necessary for the things to run

