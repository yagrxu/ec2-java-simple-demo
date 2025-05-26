import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';

import { InstanceTarget } from 'aws-cdk-lib/aws-elasticloadbalancingv2-targets'
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

    // create a S3 bucket
    const bucket = new cdk.aws_s3.Bucket(this, 'MyFirstBucket', {
      versioned: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true
    })

    // create ec2 profile
    const ec2Role = new cdk.aws_iam.Role(this, 'InstanceRole', {
      assumedBy: new cdk.aws_iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AmazonEC2RoleforSSM'
        ),
        cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
          'CloudWatchAgentServerPolicy'
        )
      ]
    })

    ec2Role.attachInlinePolicy(
      new cdk.aws_iam.Policy(this, 'additionalPolicy', {
        statements: [
          new cdk.aws_iam.PolicyStatement({
            actions: ['secret:*'],
            resources: ['*']
          })
        ]
      })
      )
    // create 2 EC2 instance
    const instance1 = new cdk.aws_ec2.Instance(this, 'Instance1', {
      vpc: vpc,
      instanceType: new cdk.aws_ec2.InstanceType('t3.large'),
      machineImage: new cdk.aws_ec2.AmazonLinuxImage(),
      securityGroup: securityGroup,
      role: ec2Role
    })
    
    instance1.addUserData(
      'yum update -y',
      'sudo yum install amazon-cloudwatch-agent -y',
      
    )

    // create ALB on top of the ec2 instance
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
    // alb.setAttribute('routing.http.xray_enabled', 'true')
    const targetGroup =
      new cdk.aws_elasticloadbalancingv2.ApplicationTargetGroup(
        this,
        'TargetGroup',
        {
          vpc,
          port: 8080,
          targetType: cdk.aws_elasticloadbalancingv2.TargetType.INSTANCE,
          healthCheck: {
            path: '/'
          }
        }
      )
    const listener = alb.addListener('Listener', {
      port: 3030,
      protocol: cdk.aws_elasticloadbalancingv2.ApplicationProtocol.HTTP,
      defaultTargetGroups: [targetGroup]
    })]

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
          ec2.InstanceSize.MEDIUM
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
  }
}
