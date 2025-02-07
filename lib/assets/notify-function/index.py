import json
import boto3
import urllib3
import datetime
from os import getenv
from time import sleep

import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

codebuild = boto3.client("codebuild")
sns = boto3.client("sns")
http = urllib3.PoolManager()

SLACK_NOTIFY_URLS = getenv("SLACK_NOTIFY_URLS")
SNS_TOPIC_ARN = getenv("SNS_TOPIC_ARN")
GREEN = "#49C39E"
RED = "#e62727"


def json_datetime_converter(o):
    if isinstance(o, datetime.datetime):
        return o.__str__()


def handler(event, context):
    logger.info(json.dumps(event))

    build_url = event["build_url"]
    build_id = event["build_id"]
    build_project = build_id.split(":")[0]
    # This is the opencast branch or tag
    trigger_branch_or_tag = event["trigger_branch_or_tag"]
    # Optional. This is the opencast-ecs-images branch or tag
    if "image_branch_or_tag" in event:
        trigger_branch_or_tag = (
            f"{trigger_branch_or_tag} {event['image_branch_or_tag']}"
        )

    slack_notify_urls = json.loads(SLACK_NOTIFY_URLS)
    if build_project not in slack_notify_urls:
        raise Exception(f"No slack notify url found for {build_project}")

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

    logger.info("posting message: {}".format(msg))

    r = http.request(
        "POST",
        slack_notify_urls[build_project],
        body=json.dumps(req_body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    logger.info("Slack notify response status code: {}".format(r.status))

    logger.info("publishing alert to topic {}".format(SNS_TOPIC_ARN))

    try:
        build_details_dump = json.dumps(build_detail, indent=2, default=json_datetime_converter)
        resp = sns.publish(
            TopicArn=SNS_TOPIC_ARN,
            Subject=f"[{build_project}] {trigger_branch_or_tag} build {build_status}!",
            Message=(
                f"Status: {build_status}\nRevision: {trigger_branch_or_tag}\n"
                f"Build: {build_link}\nDetails: {build_details_dump}"
            ),
        )
        logger.info(f"message published: {json.dumps(resp)}")
    except Exception as e:
        logger.error(f"Error sending to sns: {e}")
