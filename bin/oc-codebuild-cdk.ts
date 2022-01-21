#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { OcCodebuildCdkStack } from '../lib/oc-codebuild-cdk-stack';

const bucketName = process.env.BUCKET_NAME;

const app = new cdk.App();
new OcCodebuildCdkStack(app, 'OcCodebuildCdkStack', {
});
