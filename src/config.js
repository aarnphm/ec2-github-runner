const { getInput, error, setFailed } = require('@actions/core');
const { context } = require('@actions/github');

class Config {
    constructor() {
        this.input = {
            mode: getInput('mode'),
            githubToken: getInput('github-token'),
            ec2Region: getInput('ec2-region'),
            ec2ImageId: getInput('ec2-image-id'),
            ec2InstanceType: getInput('ec2-instance-type'),
            subnetId: getInput('subnet-id'),
            securityGroupId: getInput('security-group-id'),
            label: getInput('label'),
            ec2InstanceId: getInput('ec2-instance-id'),
            iamRoleName: getInput('iam-role-name'),
        };

        const tags = JSON.parse(getInput('aws-resource-tags'));
        this.tagSpecifications = null;
        if (tags.length > 0) {
            this.tagSpecifications = [{ ResourceType: 'instance', Tags: tags }, { ResourceType: 'volume', Tags: tags }];
        }

        // the values of github.context.repo.owner and github.context.repo.repo are taken from
        // the environment variable GITHUB_REPOSITORY specified in "owner/repo" format and
        // provided by the GitHub Action on the runtime
        this.githubContext = {
            owner: context.repo.owner,
            repo: context.repo.repo,
        };

        //
        // validate input
        //

        if (!this.input.mode) {
            throw new Error(`The 'mode' input is not specified`);
        }

        if (!this.input.githubToken) {
            throw new Error(`The 'github-token' input is not specified`);
        }

        if (this.input.mode === 'start') {
            if (!this.input.ec2ImageId || !this.input.ec2InstanceType || !this.input.subnetId || !this.input.securityGroupId) {
                throw new Error(`Not all the required inputs are provided for the 'start' mode`);
            }
        } else if (this.input.mode === 'stop') {
            if (!this.input.label || !this.input.ec2InstanceId) {
                throw new Error(`Not all the required inputs are provided for the 'stop' mode`);
            }
        } else {
            throw new Error('Wrong mode. Allowed values: start, stop.');
        }
    }

    generateUniqueLabel() {
        return Math.random().toString(36).substr(2, 5);
    }
}

try {
    module.exports = new Config();
} catch (err) {
    error(err);
    setFailed(err.message);
}
