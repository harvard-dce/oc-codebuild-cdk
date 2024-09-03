FROM ubuntu AS builder

RUN apt-get update \
    && apt-get install -y unzip curl

RUN curl -s https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip -o awscliv2.zip \
    && unzip awscliv2.zip \
    && ./aws/install --install-dir /usr/local/aws-cli --update

FROM public.ecr.aws/docker/library/maven:3-eclipse-temurin-11

RUN install -d -m 0755 /etc/apt/keyrings
RUN curl -s -o /etc/apt/keyrings/packages.mozilla.org.asc https://packages.mozilla.org/apt/repo-signing-key.gpg 
RUN echo "deb [signed-by=/etc/apt/keyrings/packages.mozilla.org.asc] https://packages.mozilla.org/apt mozilla main" | tee -a /etc/apt/sources.list.d/mozilla.list > /dev/null
RUN <<EOF 
echo '
Package: *
Pin: origin packages.mozilla.org
Pin-Priority: 1000
' | tee /etc/apt/preferences.d/mozilla > /dev/null
EOF

RUN apt update \
    && apt-get upgrade -y \
    && apt-get install --no-install-recommends -y firefox \
    && apt-get clean

COPY --from=builder /usr/local/aws-cli /usr/local/aws-cli
RUN ln -s /usr/local/aws-cli/v2/current/dist/aws /usr/local/bin/aws \
    && ln -s /usr/local/aws-cli/v2/current/dist/aws_completer /usr/local/bin/aws_completer
