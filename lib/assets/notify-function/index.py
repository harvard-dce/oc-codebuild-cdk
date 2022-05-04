import json
import boto3
import urllib3
from os import getenv
from time import sleep

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
    logger.info(json.dumps(event))

    build_url = event["build_url"]
    build_id = event["build_id"]
    build_project = build_id.split(":")[0]
    trigger_branch_or_tag = event["trigger_branch_or_tag"]

    tries = 1
    build_complete = False
    build_detail = None
    while not build_complete and tries <= 3:
        logger.info(f"sleeping for {tries * 10} seconds")
        sleep(tries * 10)
        resp = codebuild.batch_get_builds(ids=[build_id])
        build_detail = resp["builds"][0]
        build_complete = build_detail["buildComplete"]
        logger.info(f"try {tries}, build complete: {build_complete}")
        tries += 1

    if not build_complete:
        raise Exception(
            f"Giving up fetching completed build details: {json.dumps(build_detail)}",
        )

    build_status = build_detail["buildStatus"]
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
        logger.info(f"message published: {json.dumps(resp)}")
    except Exception as e:
        logger.error(f"Error sending to sns: {e}")
