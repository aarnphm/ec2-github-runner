const { info, warning, error } = require("@actions/core");
const { getOctokit } = require("@actions/github");
const _ = require("lodash");
const config = require("./config");

// use the unique label to find the runner
// as we don't have the runner's id, it's not possible to get it in any other way
async function getRunner(label) {
  const octokit = getOctokit(config.input.githubToken);

  try {
    const runners = await octokit.paginate(
      "GET /repos/{owner}/{repo}/actions/runners",
      config.githubContext,
    );
    const foundRunners = _.filter(runners, { labels: [{ name: label }] });
    return foundRunners.length > 0 ? foundRunners[0] : null;
  } catch (err) {
    error(`Error while retrieving GitHub self-hosted runners: ${err}`);
    return null;
  }
}

// get GitHub Registration Token for registering a self-hosted runner
async function getRegistrationToken() {
  const octokit = getOctokit(config.input.githubToken);

  try {
    const response = await octokit.request(
      "POST /repos/{owner}/{repo}/actions/runners/registration-token",
      config.githubContext,
    );
    info("GitHub Registration Token is received");
    return response.data.token;
  } catch (error) {
    warning("GitHub Registration Token receiving error");
    throw error;
  }
}

async function removeRunner() {
  const runner = await getRunner(config.input.label);
  const octokit = getOctokit(config.input.githubToken);

  // skip the runner removal process if the runner is not found
  if (!runner) {
    info(
      `GitHub self-hosted runner with label ${config.input.label} is not found, so the removal is skipped`,
    );
    return;
  }

  try {
    await octokit.request(
      "DELETE /repos/{owner}/{repo}/actions/runners/{runner_id}",
      _.merge(config.githubContext, { runner_id: runner.id }),
    );
    info(`GitHub self-hosted runner ${runner.name} is removed`);
    return;
  } catch (error) {
    warning("GitHub self-hosted runner removal error");
    throw error;
  }
}

async function waitForRunnerRegistered(label) {
  const timeoutMinutes = 8;
  const retryIntervalSeconds = 10;
  const quietPeriodSeconds = 30;
  let waitSeconds = 0;

  info(
    `Waiting ${quietPeriodSeconds}s for the AWS EC2 instance to be registered in GitHub as a new self-hosted runner`,
  );
  await new Promise((r) => setTimeout(r, quietPeriodSeconds * 1000));
  info(
    `Checking every ${retryIntervalSeconds}s if the GitHub self-hosted runner is registered`,
  );

  return new Promise((resolve, reject) => {
    const interval = setInterval(async () => {
      const runner = await getRunner(label);

      if (waitSeconds > timeoutMinutes * 60) {
        warning("GitHub self-hosted runner registration error");
        clearInterval(interval);
        reject(
          `A timeout of ${timeoutMinutes} minutes is exceeded. Your AWS EC2 instance was not able to register itself in GitHub as a new self-hosted runner.`,
        );
      }

      if (runner && runner.status === "online") {
        info(
          `GitHub self-hosted runner ${runner.name} is registered and ready to use`,
        );
        clearInterval(interval);
        resolve();
      } else {
        waitSeconds += retryIntervalSeconds;
        info("Checking...");
      }
    }, retryIntervalSeconds * 1000);
  });
}

module.exports = {
  getRegistrationToken,
  removeRunner,
  waitForRunnerRegistered,
};
