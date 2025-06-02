/**
 * Configuration class for CDK stack deployment
 * Allows environment variables to control stack naming and other parameters
 */
export class DeploymentConfig {
  /**
   * Get the stack name based on environment variables or default value
   * @param defaultName The default stack name to use if no environment variable is set
   * @returns The stack name to use for deployment
   */
  static getStackName(defaultName: string): string {
    // Check for environment variable STACK_NAME_PREFIX
    const stackNamePrefix = process.env.STACK_NAME_PREFIX || '';
    
    // Check for environment variable STACK_NAME
    const stackNameEnv = process.env.STACK_NAME;
    
    // If STACK_NAME is set, use it (with prefix if available)
    if (stackNameEnv) {
      return `${stackNamePrefix}${stackNameEnv}`;
    }
    
    // Otherwise use the default name (with prefix if available)
    return `${stackNamePrefix}${defaultName}`;
  }

  /**
   * Get the environment configuration for the stack
   * @returns The environment configuration object
   */
  static getEnvironment() {
    return {
      account: process.env.CDK_DEFAULT_ACCOUNT || process.env.AWS_ACCOUNT_ID,
      region: process.env.CDK_DEFAULT_REGION || process.env.AWS_REGION || 'us-east-1'
    };
  }

  /**
   * Get tags to apply to all resources in the stack
   * @returns Object containing tag key-value pairs
   */
  static getTags() {
    const tags: Record<string, string> = {
      'Project': 'aiops-sample-app',
      'Environment': process.env.ENVIRONMENT || 'dev'
    };

    // Add any additional tags from environment variables
    if (process.env.ADDITIONAL_TAGS) {
      try {
        const additionalTags = JSON.parse(process.env.ADDITIONAL_TAGS);
        Object.assign(tags, additionalTags);
      } catch (e) {
        console.warn('Failed to parse ADDITIONAL_TAGS environment variable');
      }
    }

    return tags;
  }
}
