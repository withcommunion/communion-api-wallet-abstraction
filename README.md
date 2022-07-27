# communion-api-wallet-abstraction

[![wallet-abstraction](https://github.com/withcommunion/communion-api-wallet-abstraction/actions/workflows/wallet-abstraction.yml/badge.svg)](https://github.com/withcommunion/communion-api-wallet-abstraction/actions/workflows/wallet-abstraction.yml)
The home for the middle layer wallet abstraction

## Getting Started

We are using AWS-SAM cli for development and deployment.

## Installation

#### AWS SAM (v1.47)

- Ensure you have an AWS sub account. If you don't get it from Mike.
- Installation instructions are [here](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-install.html)

## Dev workflow

- add endpoint to serverless.yml
  - FYI this is read by CloudFormation
  - path naming convention: get/post + entity (self/org) + action (ex. transfer)
- run `yarn deploy:dev` (from api wallet abstraction wallet)
  - this will deploy your local endpoints to AWS - check in w other devs avoid clobbering them
- you’ll need a jwt to send requests. To do that, run the FE repo locally, and add a `console.log(userJwt)` to any page that reqs auth and grab it from the console
  - _yarn dev_ in the communion FE repo to stand up the FE locally
  - add `console.log(userJwt)` to src/pages/org/[orgId]/index.ts (or any page that requires auth)
  - reload and grab the jwt from console output
  - Recommended: copy the jwt to Postman, and add key:value pair {Authorization: jwt} in Headers
- to set up a local dev loop, we can use `serverless invoke local` to set up a local lambda, and then hit that endpoint with the request event data
  - in Postman, send a request to your WIP endpoint, with the jwt you grabbed from console.log on the local FE
  - go to AWS console > lambda > cloudwatch > loggroup > name of fn, and find your request
  - c/p json from log event to invokeLocalEvents folder in your local repo
    - make sure to copy just the `event` portion of the json
  - go to package.json and add a new invoke local script
    - if you're c/p make sure to update `function` and `path` flags/params
  - go to terminal and run `yarn invoke:name_of_your_endpoint` (this is assuming you’ve been following the naming convention) and you should see serverless spinning up and getting hit by the json event
