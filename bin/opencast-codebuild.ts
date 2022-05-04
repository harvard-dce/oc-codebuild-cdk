#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { SSMClient, GetParameterCommand, ParameterNotFound } from "@aws-sdk/client-ssm";
import { OpencastCodebuild, OpencastCodebuildProps } from '../lib/opencast-codebuild-stack';

const bucketName = process.env.BUCKET_NAME;

function bye(msg: string, exitCode: number): void {
  console.log(msg);
  process.exit(exitCode);
}

const ocCodebuildEnv = process.env.OPENCAST_CODEBUILD_ENVIRONMENT || '';
if (!ocCodebuildEnv) bye('You must set OPENCAST_CODEBUILD_ENVIRONMENT!', 1);

async function getCdkConfig(): Promise<OpencastCodebuildProps | undefined> {
  const client = new SSMClient({});
  const configParameterName = `/opencast-codebuild/cdk-config/${ocCodebuildEnv}`;
  const getConfigCommand = new GetParameterCommand({
    Name: configParameterName,
    WithDecryption: true,
  });

  try {
    const resp = await client.send(getConfigCommand);
    if (resp.Parameter) {
      return JSON.parse(resp.Parameter.Value || '{}');
    }
  } catch (error) {
    if (error instanceof ParameterNotFound) {
      throw new Error(`Parameter ${configParameterName} not found!`);
    } else {
      console.log(error);
    }
  }
}

async function main(): Promise<void> {

  const config = await getCdkConfig();
  if (!config) {
    bye('Failed fetching config', 1);
  } else {
    console.log(config);

    const {
      slackNotifyUrls,
      artifactBucketName,
      cdkStackName,
    } = config;

    const app = new cdk.App();
    new OpencastCodebuild(app, cdkStackName, {
      slackNotifyUrls,
      artifactBucketName,
      cdkStackName,
      tags: {
        project: 'MH',
        department: 'DE',
        product: 'opencast-codebuild',
        deploy_environment: ocCodebuildEnv,
      }
    });
  }
}

main();
