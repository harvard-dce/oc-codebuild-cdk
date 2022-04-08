#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { OpencastCodebuild } from '../lib/opencast-codebuild-stack';

const bucketName = process.env.BUCKET_NAME;

const app = new cdk.App();
new OpencastCodebuild(app, 'OpencastCodebuild', {
});
