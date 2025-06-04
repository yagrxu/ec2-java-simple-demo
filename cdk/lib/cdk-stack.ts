import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';
import { NagSuppressions } from 'cdk-nag'

// import { InstanceTarget } from 'aws-cdk-lib/aws-elasticloadbalancingv2-targets'
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class CdkStack extends cdk.Stack {
  constructor (scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)


    NagSuppressions.addStackSuppressions(this, [
      {
        id: 'AwsSolutions-VPC7',
        reason: 'flow log is not required for this demo stack',
      },
      {
        id: 'AwsSolutions-S10',
        reason: 'S3 bucket is used for application artifacts and data storage, not for static website hosting',
      },
      { id: 'AwsSolutions-S1',
        reason: 'S3 bucket is used for application artifacts and data storage, not for static website hosting'
      },
      { id: 'AwsSolutions-SNS3',
        reason: 'SNS topic is used for notifications, not for publishing messages from S3 or other AWS services',
      },
      { id: 'AwsSolutions-IAM4',
        reason: 'managed role is required'
      },
      { id: 'AwsSolutions-EC23',
        reason: 'expose port 8080 and 3030 publicly for demo purposes'
      },
      { id: 'AwsSolutions-IAM5',
        reason: 'wildcard permissions are required for writing any file to S3 bucket'
      },
      { id: 'AwsSolutions-L1',
        reason: 'lambda is automatically created by CDK for S3 deployment, and it is not used in this stack'
      },
      { id: 'AwsSolutions-ELB2',
        reason: 'ALB is used for demo purposes, and it is not required to configure access logs',
      },
      { id: 'AwsSolutions-SMG4',
        reason: 'short-lived secrets are used for demo purposes, and it is not required to enable rotation',
      },
      { id: 'AwsSolutions-RDS11',
        reason: 'RDS is used for demo purposes, and it is not required to enable encryption',
      },
      { id: 'AwsSolutions-RDS6',
        reason: 'demo purposes, and it is not required to enable IAM authentication',
      },
      { id: 'AwsSolutions-RDS10',
        reason: 'demo purposes, and it is not required to enable performance insights',
      },
      { id: 'AwsSolutions-RDS14',
        reason: 'demo purposes, and it is not required to enable backtrack'
      },
      {
        id: 'AwsSolutions-EC28',
        reason: 'EC2 instance is used for demo purposes, and it is not required to enable detailed monitoring',
      },
      {
        id: 'AwsSolutions-EC29',
        reason: 'EC2 instance is used for demo purposes, and it is not required to enable termination protection',
      }
    ])

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
      cdk.aws_ec2.Peer.securityGroupId(securityGroup.securityGroupId),
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

    
    // create a SNS Topic for notifications
    const snsTopic = new cdk.aws_sns.Topic(this, 'NotificationTopic', {
      topicName: `${cdk.Stack.of(this).stackName}-ops-topic`
    })

    // Create CloudWatch Alarm for X-Ray error rate
    const faultRateAlarm = new cdk.aws_cloudwatch.Alarm(this, 'XRayFaultRateAlarm', {
      metric: new cdk.aws_cloudwatch.Metric({
        namespace: 'AWS/X-Ray',
        metricName: 'FaultRate',
        dimensionsMap: {
          GroupName: 'Default',
          ServiceName: `${cdk.Stack.of(this).stackName}-app`,
          ServiceType: 'AWS::EC2::Instance',
          Environment: 'ec2:default',
        },
        statistic: 'Average',
        period: cdk.Duration.minutes(1),
      }),
      evaluationPeriods: 3,
      threshold: 0.01, // 5% error rate
      comparisonOperator: cdk.aws_cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      actionsEnabled: true,
      alarmDescription: 'Alarm when X-Ray error rate exceeds 20% for 3 consecutive minutes',
      treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Add SNS action to the alarm
    faultRateAlarm.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(snsTopic));
    faultRateAlarm.addOkAction(new cdk.aws_cloudwatch_actions.SnsAction(snsTopic));


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

    const scriptsDeployment = new s3deploy.BucketDeployment(this, 'DeployScriptsToS3', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../../scripts'))],
      destinationBucket: appBucket,
      exclude: ['*'],
      include: ['*.sh'],  // Include any JAR file
      destinationKeyPrefix: 'scripts',
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
        loadBalancerName: `${cdk.Stack.of(this).stackName}-alb`,
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
      role: ec2Role,
      blockDevices: [
        {
          deviceName: '/dev/xvda',
          volume: ec2.BlockDeviceVolume.ebs(50, {
            encrypted: true,
            volumeType: ec2.EbsDeviceVolumeType.GENERAL_PURPOSE_SSD,
            deleteOnTermination: true,
          }),
        },
      ],
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
      'dnf install -y git',
      'dnf install -y make',
      'dnf install -y go',
      'dnf install -y jq',
      
      // Install OpenTelemetry Collector
      'echo "Installing OpenTelemetry Collector..."',
      'cd /tmp',
      'wget https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v0.119.0/otelcol-contrib_0.119.0_linux_amd64.tar.gz',
      'tar -xzf otelcol-contrib_0.119.0_linux_amd64.tar.gz',
      'sudo cp otelcol-contrib /usr/local/bin/',
      'sudo chmod +x /usr/local/bin/otelcol-contrib',

      // Create Otel Collector configuration
      'echo "Creating OpenTelemetry Collector configuration..."',
      'mkdir -p /etc/otelcol',
      'cat > /etc/otelcol/config.yaml << EOL',
      'receivers:',
      '  otlp:',
      '    protocols:',
      '      grpc:',
      '        endpoint: localhost:4317',
      '      http:',
      '        endpoint: localhost:4318',
      'processors:',
      '  batch:',
      '    timeout: 5s',
      '  memory_limiter:',
      '    limit_mib: 1000',
      '    check_interval: 1s',
      '  attributes:',
      '    actions:',
      '      - key: status.code',
      '        action: delete',
      '      - key: OTelLib',
      '        action: delete',
      '      - key: span.kind',
      '        action: delete',
      'connectors:',
      '  spanmetrics:',
      '    histogram:',
      '      explicit:',
      '        buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000]',
      '    dimensions:',
      '      - name: http.route',
      '      - name: http.response.status_code',
      '      - name: http.method',
      '    dimensions_cache_size: 1000',
      '    aggregation_temporality: "AGGREGATION_TEMPORALITY_CUMULATIVE"',
      'exporters:',
      '  awsemf:',
      `    namespace: "${cdk.Stack.of(this).stackName}-metrics"`,
      `    region: ${cdk.Stack.of(this).region}`,
      `    log_group_name: "/apm/${cdk.Stack.of(this).stackName}/metrics"`,
      `    log_stream_name: "/apm/${cdk.Stack.of(this).stackName}/stream"`,
      '    dimension_rollup_option: NoDimensionRollu',
      '  awsxray:',
      `    region: ${cdk.Stack.of(this).region}`,
      'service:',
      '  pipelines:',
      '    traces:',
      '      receivers: [otlp]',
      '      processors: [memory_limiter, batch]',
      '      exporters: [awsxray, spanmetrics]',
      '    metrics:',
      '      receivers: [otlp, spanmetrics]',
      '      processors: [attributes, memory_limiter, batch]',
      '      exporters: [awsemf]',
      // '    logs:',
      // '      receivers: [otlp]',
      // '      exporters: [otlp]',
      '  telemetry:',
      '    logs:',
      '      level: debug',
      'EOL',

      // Create a systemd service file for the application
      'cat > /etc/systemd/system/otelcol-contrib.service << EOL',
      '[Unit]',
      'Description=OpenTelemetry Collector Contrib',
      'After=network.target',
      '',
      '[Service]',
      'ExecStart=/usr/local/bin/otelcol-contrib --config=/etc/otelcol/config.yaml',
      'Restart=always',
      'User=root',
      'Group=root',
      'StandardOutput=journal',
      'StandardError=journal',
      'Environment=AWS_REGION=ap-southeast-1',
      '[Install]',
      'WantedBy=multi-user.target',
      'EOL',
      
      'sudo systemctl daemon-reload',
      'sudo systemctl enable otelcol-contrib',
      'sudo systemctl start otelcol-contrib',

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

      // Install CloudWatch agent
      // 'echo "Installing CloudWatch agent..."',
      // 'dnf install -y amazon-cloudwatch-agent',
      
      // Configure CloudWatch agent as OpenTelemetry collector
      // 'echo "Configuring CloudWatch agent as OpenTelemetry collector..."',
      // 'cat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json << EOL',
      // '{',
      // '  "agent": {',
      // '    "metrics_collection_interval": 60,',
      // '    "run_as_user": "root"',
      // '  },',
      // '  "logs": {',
      // '    "logs_collected": {',
      // '      "files": {',
      // '        "collect_list": [',
      // '          {',
      // '            "file_path": "/opt/app/logs/application.log",',
      // '            "log_group_name": "demo-app-logs",',
      // '            "log_stream_name": "{instance_id}-application"',
      // '          },',
      // '          {',
      // '            "file_path": "/var/log/messages",',
      // '            "log_group_name": "demo-app-logs",',
      // '            "log_stream_name": "{instance_id}-system"',
      // '          }',
      // '        ]',
      // '      }',
      // '    }',
      // '  },',
      // '  "metrics": {',
      // '    "namespace": "DemoApp",',
      // '    "metrics_collected": {',
      // '      "cpu": {',
      // '        "resources": ["*"],',
      // '        "measurement": ["cpu_usage_idle", "cpu_usage_user", "cpu_usage_system"]',
      // '      },',
      // '      "mem": {',
      // '        "measurement": ["mem_used_percent"]',
      // '      },',
      // '      "disk": {',
      // '        "resources": ["/"],',
      // '        "measurement": ["disk_used_percent"]',
      // '      }',
      // '    },',
      // '    "append_dimensions": {',
      // '      "InstanceId": "$INSTANCE_ID"',
      // '    }',
      // '  },',
      // '  "traces": {',
      // '    "traces_collected": {',
      // '      "otlp": {',
      // '        "grpc_endpoint": "localhost:4317"',
      // '      }',
      // '    }',
      // '  },',
      // '  "xray": {',
      // '    "enable_xray": true',
      // '  }',
      // '}',
      // 'EOL',
      
      // Start CloudWatch agent
      // 'echo "Starting CloudWatch agent..."',
      // '/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -s -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json || echo "Failed to start CloudWatch agent"',
      

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
      `Environment="OTEL_RESOURCE_ATTRIBUTES=service.name=${cdk.Stack.of(this).stackName}-app,service.namespace=demo"`,
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
      'aws s3 cp s3://$BUCKET_NAME/scripts/traffic-generator.sh /opt/scripts/traffic-generator.sh || echo "Failed to download traffic generator script"',
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
