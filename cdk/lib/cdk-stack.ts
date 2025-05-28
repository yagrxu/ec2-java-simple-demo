import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';

// import { InstanceTarget } from 'aws-cdk-lib/aws-elasticloadbalancingv2-targets'
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class CdkStack extends cdk.Stack {
  constructor (scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    // create new vpc
    const vpc = new cdk.aws_ec2.Vpc(this, 'VPC', {
      maxAzs: 3, // Default is all AZs in the region
      natGateways: 1
    })

    // create security group
    const securityGroup = new cdk.aws_ec2.SecurityGroup(this, 'SecurityGroup', {
      vpc: vpc,
      allowAllOutbound: true,
      securityGroupName: 'sample-demo-sg'
    })
    securityGroup.addIngressRule(
      cdk.aws_ec2.Peer.anyIpv4(),
      cdk.aws_ec2.Port.tcp(8080),
      'Allow HTTP traffic from anywhere'
    )
    securityGroup.addIngressRule(
      cdk.aws_ec2.Peer.anyIpv4(),
      cdk.aws_ec2.Port.tcp(3030),
      'Allow HTTP traffic from anywhere'
    )

    securityGroup.addIngressRule(
      cdk.aws_ec2.Peer.anyIpv4(),
      cdk.aws_ec2.Port.tcp(3306),
      'allow mysql'
    )

    // Create a S3 bucket for application artifacts
    const appBucket = new s3.Bucket(this, 'AppArtifactsBucket', {
      versioned: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL
    });
    
    // Create a S3 bucket for application data storage
    const dataBucket = new s3.Bucket(this, 'AppDataBucket', {
      versioned: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL
    });

    // create ec2 profile
    const ec2Role = new iam.Role(this, 'InstanceRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AmazonEC2RoleforSSM'
        ),
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'CloudWatchAgentServerPolicy'
        )
      ]
    })

    // Add S3 read/write permissions to EC2 role
    ec2Role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetObject', 's3:ListBucket', 's3:PutObject', 's3:DeleteObject'],
        resources: [
          appBucket.bucketArn, 
          `${appBucket.bucketArn}/*`,
          dataBucket.bucketArn,
          `${dataBucket.bucketArn}/*`
        ]
      })
    )
    
    // Add CloudWatch, X-Ray, and ELB permissions
    ec2Role.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'cloudwatch:PutMetricData',
          'ec2:DescribeVolumes',
          'ec2:DescribeTags',
          'logs:PutLogEvents',
          'logs:DescribeLogStreams',
          'logs:DescribeLogGroups',
          'logs:CreateLogStream',
          'logs:CreateLogGroup',
          'xray:PutTraceSegments',
          'xray:PutTelemetryRecords',
          'xray:GetSamplingRules',
          'xray:GetSamplingTargets',
          'xray:GetSamplingStatisticSummaries',
          'elasticloadbalancing:RegisterTargets',
          'elasticloadbalancing:DeregisterTargets'
        ],
        resources: ['*']
      })
    )

    ec2Role.attachInlinePolicy(
      new iam.Policy(this, 'additionalPolicy', {
        statements: [
          new iam.PolicyStatement({
            actions: ['secretsmanager:GetSecretValue'],
            resources: ['*']
          })
        ]
      })
    )
    // Deploy JAR file and agent to S3 bucket
    // Note: This assumes the JAR file is built and available at the specified path
    const jarDeployment = new s3deploy.BucketDeployment(this, 'DeployJarToS3', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../../demo/target'))],
      destinationBucket: appBucket,
      exclude: ['*'],
      include: ['*.jar'],  // Include any JAR file
      retainOnDelete: false,
      memoryLimit: 1024
    });
    
    // Deploy agent JAR to S3 bucket

    const adotAgentDeployment = new s3deploy.BucketDeployment(this, 'DeployAgentToS3', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../../demo/agent'))],
      destinationBucket: appBucket,
      destinationKeyPrefix: 'agent',  // Put agent in a separate folder
      retainOnDelete: false
    });

        const alb = new cdk.aws_elasticloadbalancingv2.ApplicationLoadBalancer(
      this,
      'ALB',
      {
        vpc: vpc,
        internetFacing: true,
        loadBalancerName: 'sample-demo',
        securityGroup: securityGroup
      }
    )

    const targetGroup =
      new cdk.aws_elasticloadbalancingv2.ApplicationTargetGroup(
        this,
        'TargetGroup',
        {
          vpc,
          port: 3030,
          protocol: cdk.aws_elasticloadbalancingv2.ApplicationProtocol.HTTP,
          targetType: cdk.aws_elasticloadbalancingv2.TargetType.INSTANCE,
          healthCheck: {
            path: '/api/products/health',
            interval: cdk.Duration.seconds(30),
            timeout: cdk.Duration.seconds(5),
            healthyThresholdCount: 2,
            unhealthyThresholdCount: 2
          }
        }
      )

    // create a aurora mysql RDS
    const auroraCluster = new rds.DatabaseCluster(this, 'AuroraCluster', {
      engine: rds.DatabaseClusterEngine.auroraMysql({
        version: rds.AuroraMysqlEngineVersion.VER_3_08_1, // Aurora MySQL 8.0
      }),
      credentials: rds.Credentials.fromGeneratedSecret('admin'), // Optional - for RDS, you can also use Secrets Manager
      instanceProps: {
        vpc,
        vpcSubnets: {
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
        securityGroups: [securityGroup],
        instanceType: ec2.InstanceType.of(
          ec2.InstanceClass.BURSTABLE3,
          ec2.InstanceSize.LARGE
        ),
      },
      instances: 2, // Writer + Reader
      defaultDatabaseName: 'products_db',
      backup: {
        retention: cdk.Duration.days(7),
        preferredWindow: '02:00-03:00', // UTC
      },
      storageEncrypted: true,
      deletionProtection: false, 
      cloudwatchLogsExports: ['error', 'general', 'slowquery', 'audit'],
      cloudwatchLogsRetention: cdk.aws_logs.RetentionDays.ONE_MONTH,
      monitoringInterval: cdk.Duration.seconds(60), // Enhanced monitoring interval
    });

    // Create EC2 instance
    const instance1 = new ec2.Instance(this, 'Instance1', {
      vpc: vpc,
      instanceType: new ec2.InstanceType('t3.large'),
      machineImage: new ec2.AmazonLinux2023ImageSsmParameter(),
      securityGroup: securityGroup,
      userDataCausesReplacement: true, // Ensure user data changes cause replacement
      role: ec2Role
    })
    // Get Aurora cluster endpoint and secret for connection
    const dbSecret = auroraCluster.secret!;
    
    // Add user data script to set up and run the Java application
    instance1.addUserData(
      '#!/bin/bash',
      'set -e',  // Exit on any error
      'exec > >(tee /var/log/user-data.log|logger -t user-data -s 2>/dev/console) 2>&1',  // Log all output
      'dnf update -y',
      'dnf install -y java-17-amazon-corretto',
      'dnf install -y amazon-cloudwatch-agent',
      'dnf install -y jq',
      
      // Get instance ID using IMDSv2
      'echo "Retrieving instance ID using IMDSv2..."',
      'TOKEN=$(curl -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")',
      'INSTANCE_ID=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/instance-id)',
      'echo "Instance ID: $INSTANCE_ID"',
      
      // Get database credentials from Secrets Manager
      `SECRET_ARN="${dbSecret.secretArn}"`,
      'DB_SECRET=$(aws secretsmanager get-secret-value --secret-id $SECRET_ARN --query SecretString --output text)',
      'DB_HOST=$(echo $DB_SECRET | jq -r .host)',
      'DB_USERNAME=$(echo $DB_SECRET | jq -r .username)',
      'DB_PASSWORD=$(echo $DB_SECRET | jq -r .password)',
      
      // Create app directory and logs directory
      'mkdir -p /opt/app/logs',
      'touch /opt/app/logs/application.log',
      'cd /opt/app',
      
      // Get the bucket name from CloudFormation exports
      `BUCKET_NAME="${appBucket.bucketName}"`,
      
      // Download the JAR file from S3
      'echo "Downloading application JAR file from S3..."',
      'echo "S3 bucket name: $BUCKET_NAME"',
      'echo "Listing all files in the bucket:"',
      'aws s3 ls s3://$BUCKET_NAME --recursive',
      'echo "Trying to find JAR files:"',
      'aws s3 ls s3://$BUCKET_NAME --recursive | grep "\\.jar$"',
      'echo "Trying to find non-agent JAR files:"',
      'aws s3 ls s3://$BUCKET_NAME --recursive | grep "\\.jar$" | grep -v "agent/"',
      'JAR_FILE=$(aws s3 ls s3://$BUCKET_NAME --recursive | grep "\\.jar$" | grep -v "agent/" | sort -r | head -1 | awk \'{print $4}\')',
      'echo "Found JAR file: $JAR_FILE"',
      'if [ -z "$JAR_FILE" ]; then',
      '  echo "ERROR: No JAR file found in S3 bucket"',
      'else',
      '  aws s3 cp s3://$BUCKET_NAME/$JAR_FILE /opt/app/app.jar',
      '  echo "JAR file downloaded successfully"',
      'fi',
      
      // Download the agent JAR file from S3 with better error handling
      'echo "Downloading agent JAR file from S3..."',
      'mkdir -p /opt/app/agent',
      'if aws s3 ls s3://$BUCKET_NAME/agent/aws-opentelemetry-agent.jar; then',
      '  aws s3 cp s3://$BUCKET_NAME/agent/aws-opentelemetry-agent.jar /opt/app/agent/',
      '  echo "Agent downloaded successfully"',
      'else',
      '  echo "Agent JAR not found in S3 bucket, downloading directly..."',
      '  curl -L -o /opt/app/agent/aws-opentelemetry-agent.jar https://github.com/aws-observability/aws-otel-java-instrumentation/releases/latest/download/aws-opentelemetry-agent.jar',
      '  echo "Agent downloaded directly from GitHub"',
      'fi',
      
      // Create database if it doesn't exist
      // 'echo "Creating database if it doesn\'t exist..."',
      // 'dnf install -y mysql',
      // 'mysql -h $DB_HOST -u $DB_USERNAME -p$DB_PASSWORD -e "CREATE DATABASE IF NOT EXISTS products_db;"',
      
      // Install CloudWatch agent
      'echo "Installing CloudWatch agent..."',
      'dnf install -y amazon-cloudwatch-agent',
      
      // Configure CloudWatch agent as OpenTelemetry collector
      'echo "Configuring CloudWatch agent as OpenTelemetry collector..."',
      'cat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json << EOL',
      '{',
      '  "agent": {',
      '    "metrics_collection_interval": 60,',
      '    "run_as_user": "root"',
      '  },',
      '  "logs": {',
      '    "logs_collected": {',
      '      "files": {',
      '        "collect_list": [',
      '          {',
      '            "file_path": "/opt/app/logs/application.log",',
      '            "log_group_name": "demo-app-logs",',
      '            "log_stream_name": "{instance_id}-application"',
      '          },',
      '          {',
      '            "file_path": "/var/log/messages",',
      '            "log_group_name": "demo-app-logs",',
      '            "log_stream_name": "{instance_id}-system"',
      '          }',
      '        ]',
      '      }',
      '    }',
      '  },',
      '  "metrics": {',
      '    "namespace": "DemoApp",',
      '    "metrics_collected": {',
      '      "cpu": {',
      '        "resources": ["*"],',
      '        "measurement": ["cpu_usage_idle", "cpu_usage_user", "cpu_usage_system"]',
      '      },',
      '      "mem": {',
      '        "measurement": ["mem_used_percent"]',
      '      },',
      '      "disk": {',
      '        "resources": ["/"],',
      '        "measurement": ["disk_used_percent"]',
      '      }',
      '    },',
      '    "append_dimensions": {',
      '      "InstanceId": "$INSTANCE_ID"',
      '    }',
      '  },',
      '  "traces": {',
      '    "traces_collected": {',
      '      "otlp": {',
      '        "grpc_endpoint": "localhost:4317"',
      '      }',
      '    }',
      '  },',
      '  "xray": {',
      '    "enable_xray": true',
      '  }',
      '}',
      'EOL',
      
      // Start CloudWatch agent
      'echo "Starting CloudWatch agent..."',
      '/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -s -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json || echo "Failed to start CloudWatch agent"',
      
      // Create a systemd service file for the application
      'cat > /etc/systemd/system/java-app.service << EOL',
      '[Unit]',
      'Description=Java Spring Boot Application',
      'After=network.target',
      '',
      '[Service]',
      'Type=simple',
      'User=root',
      'WorkingDirectory=/opt/app',
      'Environment="OTEL_RESOURCE_ATTRIBUTES=service.name=demo-app,service.namespace=demo"',
      'Environment="OTEL_METRICS_EXPORTER=otlp"',
      'Environment="OTEL_TRACES_EXPORTER=otlp"',
      'Environment="OTEL_LOGS_EXPORTER=otlp"',
      'Environment="OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317"',
      'Environment="OTEL_EXPORTER_OTLP_PROTOCOL=grpc"',
      'Environment="OTEL_PROPAGATORS=tracecontext,baggage,xray"',
      'Environment="OTEL_IMR_EXPORT_INTERVAL=60000"',
      // Pass the data bucket name as an environment variable
      `Environment="DATA_BUCKET_NAME=${dataBucket.bucketName}"`,
      'Environment="JAVA_TOOL_OPTIONS=-Dlogging.file.path=/opt/app/logs -Dlogging.file.name=application.log"',
      'ExecStart=/usr/bin/java -javaagent:/opt/app/agent/aws-opentelemetry-agent.jar -jar /opt/app/app.jar --spring.datasource.url=jdbc:mysql://${DB_HOST}:3306/products_db --spring.datasource.username=${DB_USERNAME} --spring.datasource.password=${DB_PASSWORD} --server.port=3030',
      'Restart=on-failure',
      'RestartSec=10',
      '',
      '[Install]',
      'WantedBy=multi-user.target',
      'EOL',
      
      // Enable and start the service
      'systemctl daemon-reload',
      'systemctl enable java-app',
      'systemctl start java-app',
      
      // Add the instance to the target group
      'echo "Registering instance with target group..."',
      `echo "Target Group ARN: ${targetGroup.targetGroupArn}"`,
      `aws elbv2 register-targets --target-group-arn ${targetGroup.targetGroupArn} --targets Id=$INSTANCE_ID || echo "Failed to register with target group"`,
      
      // Set up and start the traffic generator
      'echo "Setting up traffic generator..."',
      'mkdir -p /opt/scripts',
      'cat > /opt/scripts/traffic-generator.sh << EOL',
      '#!/bin/bash',
      '',
      '# Traffic Generator for EC2 Java Simple Demo',
      '# This script sends periodic requests to the application to generate traces and logs',
      '',
      '# Configuration',
      'APP_URL="http://localhost:3030"  # Use localhost since we\'re running on the same instance',
      'INTERVAL=30                      # Seconds between requests',
      'LOG_FILE="/opt/app/logs/traffic-generator.log"  # Log file for the traffic generator',
      '',
      '# Endpoints to test',
      'ENDPOINTS=(',
      '  "/api/products"',
      '  "/api/products/health"',
      '  "/api/products/in-stock"',
      '  "/api/products/search?name=a"',
      '  "/api/products/price-range?min=0&max=1000"',
      ')',
      '',
      '# Product IDs to test (will be populated dynamically)',
      'PRODUCT_IDS=()',
      '',
      '# Initialize log file',
      'echo "$(date) - Traffic Generator Started" > $LOG_FILE',
      'echo "Target Application: $APP_URL" >> $LOG_FILE',
      'echo "Request Interval: $INTERVAL seconds" >> $LOG_FILE',
      'echo "----------------------------------------" >> $LOG_FILE',
      '',
      '# Function to make a request and log the result',
      'make_request() {',
      '  local endpoint=$1',
      '  local method=${2:-"GET"}',
      '  local data=${3:-""}',
      '  local content_type=${4:-"application/json"}',
      '  ',
      '  echo "$(date) - Making $method request to $endpoint" >> $LOG_FILE',
      '  ',
      '  start_time=$(date +%s.%N)',
      '  ',
      '  if [ "$method" == "GET" ]; then',
      '    response=$(curl -s -w "\\n%{http_code}" -X $method "$APP_URL$endpoint")',
      '  else',
      '    response=$(curl -s -w "\\n%{http_code}" -X $method -H "Content-Type: $content_type" -d "$data" "$APP_URL$endpoint")',
      '  fi',
      '  ',
      '  end_time=$(date +%s.%N)',
      '  duration=$(echo "$end_time - $start_time" | bc)',
      '  ',
      '  # Extract status code from response',
      '  status_code=$(echo "$response" | tail -n1)',
      '  response_body=$(echo "$response" | sed \'$d\')',
      '  ',
      '  # Log the result',
      '  echo "$(date) - $method $endpoint - Status: $status_code, Time: ${duration}s" >> $LOG_FILE',
      '  ',
      '  # Return the response body',
      '  echo "$response_body"',
      '}',
      '',
      '# Function to get product IDs',
      'update_product_ids() {',
      '  echo "Fetching product IDs..." >> $LOG_FILE',
      '  products_json=$(make_request "/api/products")',
      '  ',
      '  # Check if we got a valid JSON response',
      '  if [[ $products_json == *"id"* ]]; then',
      '    # Extract product IDs using grep and sed',
      '    PRODUCT_IDS=($(echo "$products_json" | grep -o \'"id":[0-9]*\' | grep -o \'[0-9]*\'))',
      '    echo "Found ${#PRODUCT_IDS[@]} products: ${PRODUCT_IDS[@]}" >> $LOG_FILE',
      '  else',
      '    echo "Failed to fetch product IDs or no products found" >> $LOG_FILE',
      '  fi',
      '}',
      '',
      '# Function to create a random product',
      'create_random_product() {',
      '  local name="Product-$(date +%s)"',
      '  local price=$(echo "scale=2; $RANDOM / 100" | bc)',
      '  local stock=$((RANDOM % 100))',
      '  ',
      '  local data="{\\\"name\\\":\\\"$name\\\",\\\"description\\\":\\\"Generated by traffic script\\\",\\\"price\\\":$price,\\\"stockQuantity\\\":$stock}"',
      '  ',
      '  echo "Creating new product: $data" >> $LOG_FILE',
      '  make_request "/api/products" "POST" "$data"',
      '}',
      '',
      '# Function to update a random product',
      'update_random_product() {',
      '  if [ ${#PRODUCT_IDS[@]} -eq 0 ]; then',
      '    echo "No products to update" >> $LOG_FILE',
      '    return',
      '  fi',
      '  ',
      '  # Select a random product ID',
      '  local index=$((RANDOM % ${#PRODUCT_IDS[@]}))',
      '  local id=${PRODUCT_IDS[$index]}',
      '  ',
      '  local name="Updated-$(date +%s)"',
      '  local price=$(echo "scale=2; $RANDOM / 100" | bc)',
      '  local stock=$((RANDOM % 100))',
      '  ',
      '  local data="{\\\"name\\\":\\\"$name\\\",\\\"description\\\":\\\"Updated by traffic script\\\",\\\"price\\\":$price,\\\"stockQuantity\\\":$stock}"',
      '  ',
      '  echo "Updating product $id: $data" >> $LOG_FILE',
      '  make_request "/api/products/$id" "PUT" "$data"',
      '}',
      '',
      '# Function to delete a random product',
      'delete_random_product() {',
      '  if [ ${#PRODUCT_IDS[@]} -eq 0 ]; then',
      '    echo "No products to delete" >> $LOG_FILE',
      '    return',
      '  fi',
      '  ',
      '  # Select a random product ID',
      '  local index=$((RANDOM % ${#PRODUCT_IDS[@]}))',
      '  local id=${PRODUCT_IDS[$index]}',
      '  ',
      '  echo "Deleting product $id" >> $LOG_FILE',
      '  make_request "/api/products/$id" "DELETE"',
      '  ',
      '  # Remove the ID from our array',
      '  unset PRODUCT_IDS[$index]',
      '  PRODUCT_IDS=("${PRODUCT_IDS[@]}")',
      '}',
      '',
      '# Main loop',
      'run_count=0',
      'while true; do',
      '  # Update product IDs periodically',
      '  if [ $((run_count % 5)) -eq 0 ]; then',
      '    update_product_ids',
      '  fi',
      '  ',
      '  # Select a random endpoint',
      '  endpoint=${ENDPOINTS[$RANDOM % ${#ENDPOINTS[@]}]}',
      '  ',
      '  # Make the request',
      '  echo "Run #$run_count: Requesting $endpoint" >> $LOG_FILE',
      '  make_request "$endpoint"',
      '  ',
      '  # Occasionally perform write operations',
      '  if [ $((RANDOM % 10)) -eq 0 ]; then',
      '    action=$((RANDOM % 3))',
      '    case $action in',
      '      0) create_random_product ;;',
      '      1) update_random_product ;;',
      '      2) delete_random_product ;;',
      '    esac',
      '  fi',
      '  ',
      '  # Increment run count',
      '  run_count=$((run_count + 1))',
      '  ',
      '  # Sleep for the specified interval',
      '  sleep $INTERVAL',
      'done',
      'EOL',
      'chmod +x /opt/scripts/traffic-generator.sh',
      '',
      '# Create a systemd service for the traffic generator',
      'cat > /etc/systemd/system/traffic-generator.service << EOL',
      '[Unit]',
      'Description=Traffic Generator for Java Demo App',
      'After=java-app.service',
      '',
      '[Service]',
      'Type=simple',
      'User=root',
      'ExecStart=/bin/bash /opt/scripts/traffic-generator.sh',
      'Restart=on-failure',
      'RestartSec=10',
      '',
      '[Install]',
      'WantedBy=multi-user.target',
      'EOL',
      '',
      '# Install required packages for the traffic generator',
      'dnf install -y bc',
      '',
      '# Enable and start the traffic generator service',
      'systemctl daemon-reload',
      'systemctl enable traffic-generator',
      'systemctl start traffic-generator',

      // install mysql for debugging
      'sudo dnf install -y mariadb105',

    )

    // create ALB on top of the ec2 instance

      
    // Add the EC2 instance to the target group
    // targetGroup.addTarget(new InstanceTarget(instance1));
      
    const listener = alb.addListener('Listener', {
      port: 3030,
      protocol: cdk.aws_elasticloadbalancingv2.ApplicationProtocol.HTTP,
      defaultTargetGroups: [targetGroup]
    })

  }
}
