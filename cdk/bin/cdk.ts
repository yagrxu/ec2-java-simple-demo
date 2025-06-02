#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { CdkStack } from '../lib/cdk-stack';
import { DeploymentConfig } from '../lib/const';

const app = new cdk.App();

// Get stack name from environment variables or use default
const stackName = DeploymentConfig.getStackName('aiops-sample-app');

// Create the stack with configurable name and environment
const stack = new CdkStack(app, stackName, {
  /* If you don't specify 'env', this stack will be environment-agnostic.
   * Account/Region-dependent features and context lookups will not work,
   * but a single synthesized template can be deployed anywhere. */

  /* Using the environment configuration from DeploymentConfig */
  env: DeploymentConfig.getEnvironment(),
});

// Apply tags to all resources in the stack
const tags = DeploymentConfig.getTags();
Object.entries(tags).forEach(([key, value]) => {
  cdk.Tags.of(stack).add(key, value);
});