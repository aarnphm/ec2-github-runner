const { EC2Client, RunInstancesCommand, waitUntilInstanceRunning, TerminateInstancesCommand } = require('@aws-sdk/client-ec2');
const { core } = require('@actions/core');
const { config } = require('./config');

// User data scripts are run as the root user
function buildUserDataScript(githubRegistrationToken, label) {
    return [
        '#!/bin/bash',
        'set -x',
        'mkdir actions-runner && cd actions-runner',
        'case $(uname -m) in aarch64) ARCH="arm64" ;; amd64|x86_64) ARCH="x64" ;; esac && export RUNNER_ARCH=${ARCH}',
        'curl -O -L https://github.com/actions/runner/releases/download/v2.299.1/actions-runner-linux-${RUNNER_ARCH}-2.299.1.tar.gz',
        'tar xzf ./actions-runner-linux-${RUNNER_ARCH}-2.299.1.tar.gz',
        `RUNNER_ALLOW_RUNASROOT=1 ./config.sh --url https://github.com/${config.githubContext.owner}/${config.githubContext.repo} --token ${githubRegistrationToken} --labels ${label} --unattended`,
        'RUNNER_ALLOW_RUNASROOT=1 ./run.sh',
    ];
}

async function startEc2Instance(label, githubRegistrationToken) {
    const client = new EC2Client({ region: config.input.ec2Region })
    const userData = buildUserDataScript(githubRegistrationToken, label);

    const subnetId = config.input.subnetId;
    const subnets = subnetId ? subnetId.replace(/\s/g, '').split(',') : [null];

    for (const subnet of subnets) {
        const runInstancesCommand = new RunInstancesCommand({
            ImageId: config.input.ec2ImageId,
            InstanceType: config.input.ec2InstanceType,
            MinCount: 1,
            MaxCount: 1,
            UserData: Buffer.from(userData.join('\n')).toString('base64'),
            SubnetId: subnet,
            SecurityGroupIds: [config.input.securityGroupId],
            IamInstanceProfile: { Name: config.input.iamRoleName },
            TagSpecifications: config.tagSpecifications,
        });
        try {
            const result = await client.send(runInstancesCommand);
            const ec2InstanceId = result.Instances?.[0]?.InstanceId;
            if (!ec2InstanceId) { throw new Error("No instance ID returned from AWS") }
            await waitUntilInstanceRunning({ client: client, maxWaitTime: 120 }, { InstanceIds: [ec2InstanceId] });
            core.info(`AWS EC2 instance ${ec2InstanceId} is started`);
            return ec2InstanceId;
        } catch (error) {
            core.warning('AWS EC2 instance starting error');
            core.warning(error);
            throw error;
        }
    }
    core.setFailed(`Failed to launch instance after trying in ${subnets.length} subnets.`);
}

async function terminateEc2Instance() {
    const client = new EC2Client({ region: config.input.ec2Region })
    const terminateInstancesCommand = new TerminateInstancesCommand({
        InstanceIds: [config.input.ec2InstanceId],
    });

    try {
        await client.send(terminateInstancesCommand);
        core.info(`AWS EC2 instance ${config.input.ec2InstanceId} is terminated`);
        return;
    } catch (error) {
        core.error(`AWS EC2 instance ${config.input.ec2InstanceId} termination error`);
        throw error;
    }
}

module.exports = { startEc2Instance, terminateEc2Instance };
