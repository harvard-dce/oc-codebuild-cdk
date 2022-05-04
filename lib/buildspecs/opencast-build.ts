import * as codebuild from '@aws-cdk/aws-codebuild';

export default codebuild.BuildSpec.fromObjectToYaml(
  {
    "version": 0.2,
    "env": {
      "shell": "bash",
      "variables": {
        "_COMMENT": "default is to build without tests",
        "SKIP_TESTS": "-DskipTests -Dcheckstyle.skip=true",
      },
    },
    "phases": {
      "install": {
        "runtime-versions": {
          "java": "corretto8",
        },
        "commands": [
          "printenv",
        ],
      },
      "build": {
        "commands": [
          "echo Build started on `date`",

          "# webhook triggered runs will have CODEBUILD_WEBHOOK_TRIGGER, e.g. `tag/[tag name]` or `branch/[branch name]`",
          "# branch/tag runs will have CODEBUILD_WEBHOOK_HEAD_REF, e.g. `refs/heads/[branch|tag name]`",
          "# manually triggered runs will only have CODEBUILD_SOURCE_VERSION",
          "# get the tag or branch name to use as the s3 object path",
          "TRIGGER_BRANCH_OR_TAG=$CODEBUILD_WEBHOOK_TRIGGER",
          "if [ -z \"$TRIGGER_BRANCH_OR_TAG\" ]; then TRIGGER_BRANCH_OR_TAG=\"manual/${CODEBUILD_SOURCE_VERSION}\"; fi",

          "# - at this point TRIGGER_BRANCH_OR_TAG should look like `branch/[branch name]`, `tag/[tag name]`, or `manual/[branch or tag]`",
          "# - `cut` with `-f2-` will cut off the leading token (i.e. `branch/` or `tag/`) leaving other `/` characters intact",
          "# - `sed` will replace any remaning `/` with `-`",
          "export TRIGGER_BRANCH_OR_TAG=$(echo $TRIGGER_BRANCH_OR_TAG | cut -d'/' -f2- | sed -e 's/\\//-/g')",

          "# release tag examles: DCE/5.0.0-1.8.0, DCE/5.0.0-1.8.0-rc1, DCE/5.0.0-1.8.0-hotfix",
          "if [[ $TRIGGER_BRANCH_OR_TAG =~ ^DCE-[0-9\\.\\-]+(-hotfix|-rc[0-9])?$ ]] ; then SKIP_TESTS=\"\" ; fi",

          "echo trigger branch or tag \"$TRIGGER_BRANCH_OR_TAG\"",
          "echo skip test options \"$SKIP_TESTS\"",

          "# run the maven command",
          "mvn -Dmaven.repo.local=/opt/.m2/repository clean install $SKIP_TESTS -Padmin,presentation,worker",
        ],
      },
      "post_build": {
        "commands": [
          "bash -c \"if [ \"$CODEBUILD_BUILD_SUCCEEDING\" == \"0\" ]; then exit 1; fi\"",
          "echo Build completed on `date`",
          "tar -C ./build/opencast-dist-admin-5-SNAPSHOT -czf ./build/admin.tgz .",
          "tar -C ./build/opencast-dist-presentation-5-SNAPSHOT -czf ./build/presentation.tgz .",
          "tar -C ./build/opencast-dist-worker-5-SNAPSHOT -czf ./build/worker.tgz ."
        ],
        "finally": [
          "payload={\\\"build_id\\\":\\\"$CODEBUILD_BUILD_ID\\\",\\\"build_url\\\":\\\"$CODEBUILD_BUILD_URL\\\",\\\"trigger_branch_or_tag\\\":\\\"$TRIGGER_BRANCH_OR_TAG\\\"}",
          "aws lambda invoke --function-name $NOTIFY_FUNCTION --invocation-type Event --payload $payload response.json",
          "cat response.json",
        ],
      },
    },
    "cache": {
      "paths": [
        "/opt/.m2/",
      ],
    },
    "artifacts": {
      "discard-paths": true,
      "files": [
        "build/*.tgz",
      ],
      "name": "$TRIGGER_BRANCH_OR_TAG",
    },
  }
);
