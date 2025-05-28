# EC2 Java Simple Demo

This project demonstrates deploying a Spring Boot Java application to an EC2 instance using AWS CDK, with OpenTelemetry agent integration and CloudWatch agent as the OpenTelemetry collector.

## Project Structure

- `cdk/` - AWS CDK infrastructure code (TypeScript)
- `demo/` - Spring Boot Java application
  - `agent/` - Contains the AWS OpenTelemetry agent JAR

## Prerequisites

- AWS CLI configured
- Node.js and npm installed
- Java 17 installed
- Maven installed

## Customizing the Application

You can customize the application by modifying the following properties in `demo/pom.xml`:

- `<artifactId>` - The artifact ID (affects JAR file name)
- `<version>` - The version number (affects JAR file name)
- `<name>` - The application name

The deployment process will automatically detect these values and use the correct JAR file.

## Deployment Steps

1. Run the deployment script:
   ```
   ./deploy.sh
   ```

The script will:
1. Detect application details from pom.xml
2. Build the Java application with Maven
3. Check for the AWS OpenTelemetry agent JAR and download it if not present
4. Install CDK dependencies
5. Build and deploy the CDK stack

The deployment process will:
1. Create a VPC, security groups, and an EC2 instance
2. Create an Aurora MySQL database
3. Upload the Java application JAR and agent JAR to an S3 bucket
4. Configure the EC2 instance to download and run the JAR file with the agent
5. Set up an Application Load Balancer to route traffic to the application

## Observability Setup

### OpenTelemetry Agent

The application is configured to run with the AWS OpenTelemetry agent, which provides:
- Automatic instrumentation of your Java application
- Distributed tracing
- Metrics collection
- Log collection

The agent is started with the following configuration:
- Service name: demo-app
- Service namespace: demo
- Traces exporter: OTLP (OpenTelemetry Protocol)
- Metrics exporter: OTLP
- Logs exporter: OTLP
- OTLP endpoint: http://localhost:4317
- OTLP protocol: gRPC
- Propagators: tracecontext, baggage, xray

### CloudWatch Agent as OpenTelemetry Collector

The CloudWatch agent is configured as an OpenTelemetry collector to:
- Receive telemetry data from the OpenTelemetry agent via OTLP/gRPC
- Forward traces to AWS X-Ray
- Send metrics to CloudWatch
- Send logs to CloudWatch Logs

The CloudWatch agent collects:
- Application logs from `/opt/app/logs/application.log`
- System logs from `/var/log/messages`
- CPU, memory, and disk metrics
- Trace data from the OpenTelemetry agent

## Accessing the Application

Once deployed, you can access the application through the ALB URL on port 3030:
- Health check: `http://<ALB-URL>:3030/api/products/health`
- List products: `http://<ALB-URL>:3030/api/products`

## Monitoring and Observability

After deployment, you can access:
- Application logs in CloudWatch Logs under the log group `demo-app-logs`
- Metrics in CloudWatch under the namespace `DemoApp`
- Traces in AWS X-Ray
- Service map in AWS X-Ray

## Cleanup

To remove all resources:
```
cd cdk
cdk destroy
```
