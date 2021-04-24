import * as core from "@actions/core";
import * as github from "@actions/github";

async function run(): Promise<void> {
  try {
    core.debug("hello world");
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
