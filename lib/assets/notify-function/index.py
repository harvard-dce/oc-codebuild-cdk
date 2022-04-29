import json
import boto3
import urllib3
from os import getenv

import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

codebuild = boto3.client("codebuild")
sns = boto3.client("sns")
http = urllib3.PoolManager()

SLACK_NOTIFY_URL = getenv("SLACK_NOTIFY_URL")
SNS_TOPIC_ARN = getenv("SNS_TOPIC_ARN")
GREEN = "#49C39E"
RED = "#e62727"


def handler(event, context):
    logger.info(event)

    build_url = event["build_url"]
    build_id = event["build_id"]
    build_project = build_id.split(":")[0]
    trigger_branch_or_tag = event["trigger_branch_or_tag"]

    build_complete = False
    while not build_complete:
        build_details = codebuild.batch_get_builds(ids=[build_id])
        build_complete = build_details["builds"][0]["buildComplete"]

    build_status = build_details["builds"][0]["buildStatus"]
    status_color = build_status == "SUCCEEDED" and GREEN or RED

    build_link = f"<{build_url}|{build_project}@{trigger_branch_or_tag}>"
    msg = f"Codebuild complete for {build_link}, status: {build_status}"
    req_body = {"attachments": [{"color": status_color, "text": msg}]}

    logger.info("using notify_url: {}".format(SLACK_NOTIFY_URL))
    logger.info("posting message: {}".format(msg))

    r = http.request(
        "POST",
        SLACK_NOTIFY_URL,
        body=json.dumps(req_body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    logger.info("Notify url status code: {}".format(r.status))

    logger.info("publishing alert to topic {}".format(SNS_TOPIC_ARN))

    try:
        resp = sns.publish(
            TopicArn=SNS_TOPIC_ARN,
            Subject=f"[codebuild] {build_project} build {build_status}!",
            Message=msg,
        )
        logger.debug(f"message published: {resp}")
    except Exception as e:
        logger.error(f"Error sending to sns: {e}")
