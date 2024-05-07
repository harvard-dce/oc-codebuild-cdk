#!/usr/bin/bash

set -e

IMAGE_VERSION=${1-1.0.0}
REPOSITORY_URL=$(aws ecr describe-repositories --repository-names hdce/oc-codebuild-environment --query 'repositories[].repositoryUri' --output text)

docker build -t ${REPOSITORY_URL}:${IMAGE_VERSION} .

aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 542186135646.dkr.ecr.us-east-1.amazonaws.com
docker push ${REPOSITORY_URL}:${IMAGE_VERSION}
