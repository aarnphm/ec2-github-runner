const aws = require("./aws");
const gh = require("./gh");
const config = require("./config");
const { setOutput, error, setFailed } = require("@actions/core");

function setActionOutput(label, ec2InstanceId) {
  setOutput("label", label);
  setOutput("ec2-instance-id", ec2InstanceId);
}

async function start() {
  const label = config.generateUniqueLabel();
  const githubRegistrationToken = await gh.getRegistrationToken();
  try {
    const ec2InstanceId = await aws.startEc2Instance(
      label,
      githubRegistrationToken,
    );
    setActionOutput(label, ec2InstanceId);
    await gh.waitForRunnerRegistered(label);
  } catch (err) {
    error(err);
    setFailed(err.message);
  }
}

async function stop() {
  await aws.terminateEc2Instance();
  await gh.removeRunner();
}

(async function () {
  try {
    config.input.mode === "start" ? await start() : await stop();
  } catch (err) {
    error(err);
    setFailed(err.message);
  }
})();
