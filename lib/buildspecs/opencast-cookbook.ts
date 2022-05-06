import * as codebuild from '@aws-cdk/aws-codebuild';

export default codebuild.BuildSpec.fromObjectToYaml(
  {
    "version": 0.2,
    "env": {
      "shell": "bash",
    },
    "phases": {
      "install": {
        "runtime-versions": {
          "ruby": "2.6"
        },
        "commands": [
          "printenv",
          "gem install chef-config -v '< 16.5.77'",
          "gem install mixlib-log -v '~> 2'",
          "gem install berkshelf -v '~> 5.1'",
        ],
      },
      "build": {
        "commands": [
          "echo Build started on `date`",

          "# webhook triggered runs will have CODEBUILD_WEBHOOK_TRIGGER, e.g. `tag/[tag name]` or `branch/[branch name]`",
          "# manually triggered runs will only have CODEBUILD_SOURCE_VERSION",
          "# get the tag or branch name to use for the s3 object path",
          "TRIGGER_BRANCH_OR_TAG=$CODEBUILD_WEBHOOK_TRIGGER",
          "if [ -z \"$TRIGGER_BRANCH_OR_TAG\" ]; then TRIGGER_BRANCH_OR_TAG=\"manual/${CODEBUILD_SOURCE_VERSION}\"; fi",

          "# - at this point TRIGGER_BRANCH_OR_TAG should look like `branch/[branch name]`, `tag/[tag name]`, or `manual/[branch or tag]`",
          "# - `cut` with `-f2-` will cut off the leading token (i.e. `branch/` or `tag/`) leaving other `/` characters intact",
          "# - `sed` will replace any remaning `/` with `-`",
          "export TRIGGER_BRANCH_OR_TAG=$(echo $TRIGGER_BRANCH_OR_TAG | cut -d'/' -f2- | sed -e 's/\\//-/g')",

          "echo trigger branch or tag \"$TRIGGER_BRANCH_OR_TAG\"",

          "./bin/run_foodcritic.sh",
          "berks package mh-opsworks-recipes-${TRIGGER_BRANCH_OR_TAG}.tar.gz",
        ],
      },
      "post_build": {
        "commands": [
          "bash -c \"if [ \"$CODEBUILD_BUILD_SUCCEEDING\" == \"0\" ]; then exit 1; fi\"",
          "echo Build completed on `date`",
        ],
        "finally": [
          "payload={\\\"build_id\\\":\\\"$CODEBUILD_BUILD_ID\\\",\\\"build_url\\\":\\\"$CODEBUILD_BUILD_URL\\\",\\\"trigger_branch_or_tag\\\":\\\"$TRIGGER_BRANCH_OR_TAG\\\"}",
          "aws lambda invoke --function-name $NOTIFY_FUNCTION --invocation-type Event --payload $payload response.json",
          "cat response.json",
        ],
      },
    },
    "artifacts": {
      "discard-paths": true,
      "files": [
        "*.tar.gz",
      ],
      "name": "cookbook/${TRIGGER_BRANCH_OR_TAG}"
    }
  },
);
