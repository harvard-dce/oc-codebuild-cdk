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
          "java": "corretto8"
        },
        "commands": [
          "printenv",
          "# ffmpeg is needed by some of the tests",
          "wget --no-verbose -O /opt/ffmpeg.tgz https://s3.amazonaws.com/mh-opsworks-shared-assets/ffmpeg-4.4.1-amazon-linux-static.tgz && /bin/tar -C /opt -xzf /opt/ffmpeg.tgz"
        ],
      },
      "build": {
        "commands": [
          "echo Build started on `date`",
          "export PATH=\"/opt/ffmpeg-4.4.1:${PATH}\"",

          "# set the timezone so dates generated during tests can match the expected output",
          "export TZ=US/Eastern",

          "export TRIGGER_PR=$(echo $CODEBUILD_WEBHOOK_TRIGGER | sed -e 's/\\//-/g')",
          "echo trigger pr \"$TRIGGER_PR\"",

          "# run the maven command",
          "mvn -Dmaven.repo.local=/opt/.m2/repository test -Pnone"
        ],
      },
      "post_build": {
        "commands": [
          "bash -c \"if [ \"$CODEBUILD_BUILD_SUCCEEDING\" == \"0\" ]; then exit 1; fi\"",
          "echo Build completed on `date`",
        ],
        "finally": [
          "payload={\\\"build_id\\\":\\\"$CODEBUILD_BUILD_ID\\\",\\\"build_url\\\":\\\"$CODEBUILD_BUILD_URL\\\",\\\"trigger_branch_or_tag\\\":\\\"$TRIGGER_PR\\\"}",
          "aws lambda invoke --function-name $NOTIFY_FUNCTION --invocation-type Event --payload $payload response.json",
          "cat response.json",
        ],
      },
    },
    "cache": {
      "paths": [
        "build/",
        "/opt/.m2/",
      ],
    },
  },
);
