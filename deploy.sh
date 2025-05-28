#!/bin/bash

# Exit on error
set -e

# Get the app artifact ID and version from pom.xml
APP_ARTIFACT_ID=$(grep -m 1 "<artifactId>" demo/pom.xml | sed -e 's/<artifactId>\(.*\)<\/artifactId>/\1/' | tr -d '[:space:]')
APP_VERSION=$(grep -m 1 "<version>" demo/pom.xml | sed -e 's/<version>\(.*\)<\/version>/\1/' | tr -d '[:space:]')
APP_NAME=$(grep -m 1 "<name>" demo/pom.xml | sed -e 's/<name>\(.*\)<\/name>/\1/' | tr -d '[:space:]')

echo "Detected application details:"
echo "  Artifact ID: $APP_ARTIFACT_ID"
echo "  Version: $APP_VERSION"
echo "  Name: $APP_NAME"
echo "  Expected JAR filename: $APP_ARTIFACT_ID-$APP_VERSION.jar"

echo "Building Java application..."
cd demo
mvn clean package
cd ..

# Ensure agent directory exists and download the agent JAR
echo "Checking for OpenTelemetry agent..."
mkdir -p ./demo/agent
if [ ! -f "./demo/agent/aws-opentelemetry-agent.jar" ]; then
  echo "Downloading OpenTelemetry agent..."
  curl -L -o ./demo/agent/aws-opentelemetry-agent.jar https://github.com/aws-observability/aws-otel-java-instrumentation/releases/latest/download/aws-opentelemetry-agent.jar
  echo "Agent downloaded successfully."
else
  echo "Agent JAR already exists at ./demo/agent/aws-opentelemetry-agent.jar"
fi

echo "Installing CDK dependencies..."
cd cdk
npm install

echo "Building CDK project..."
npm run build

echo "Deploying infrastructure..."
cdk deploy --require-approval never

echo "Deployment complete!"
echo "You can access the application at the ALB URL on port 3030"
echo "Health check: http://<ALB-URL>:3030/api/products/health"
echo "List products: http://<ALB-URL>:3030/api/products"
