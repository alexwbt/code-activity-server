import { getEnvString } from "#lib/common/env";
import logger from "#lib/common/logger";
import RequestHandlerError from "#lib/express/RequestHandlerError";
import useRequestHandler from "#lib/express/useRequestHandler";
import express from "express";
import { existsSync } from "fs";
import { readdir } from "fs/promises";
import Joi from "joi";
import path from "path";
import simpleGit from "simple-git";

const repositoryRouter = express.Router();

const repositoryDirectory = getEnvString("REPOSITORY_DIRECTORY", "repositories");

/**
 * Create repository
 */
useRequestHandler({
  router: repositoryRouter,
  method: "post",

  bodySchema: Joi.object<{
    name?: string;
    url: string;
  }>({
    name: Joi.string().regex(/^[a-zA-Z0-9_-]*$/),
    url: Joi.string().required(),
  }).required(),

  requestHandler: async ({ body }) => {
    const name = body.name || path.parse(body.url).name;
    const dest = `${repositoryDirectory}/${name}`;

    if (existsSync(dest))
      throw new RequestHandlerError(400, "duplicate repository name");

    logger.info(`Cloning repo ${name} (${body.url}) into ${dest}`);
    simpleGit().clone(body.url, dest);

    return {
      status: 200,
      body: {
        name,
      },
    };
  },
});

/**
 * Update repository
 */
useRequestHandler({
  router: repositoryRouter,
  method: "get",
  requestHandler: async () => {

    const entries = await readdir(repositoryDirectory, { withFileTypes: true });
    const repositories = entries.filter(e => e.isDirectory()).map(e => e.name);

    logger.info(`Updating repositories: ${repositories.join(", ")}`);

    await Promise.all(repositories.map(async e => {
      const baseDir = `${repositoryDirectory}/${e}`;
      const res = await simpleGit({ baseDir }).fetch();
      logger.info(`${baseDir}: ${JSON.stringify(res)}`);
    }));

    return {
      status: 200,
      body: {
        repositories,
      },
    };
  },
});

/**
 * Get recent activities
 */
useRequestHandler({
  router: repositoryRouter,
  method: "get",
  path: "/activity",
  requestHandler: async () => {

    const entries = await readdir(repositoryDirectory, { withFileTypes: true });
    const repositories = entries.filter(e => e.isDirectory()).map(e => e.name);

    const body = await Promise.all(repositories.map(async e => {
      const baseDir = `${repositoryDirectory}/${e}`;
      const res = await simpleGit({ baseDir }).diff();
      return res;
    }));

    return {
      status: 200,
      body: JSON.stringify(body, undefined, 4),
    };
  },
});

export default repositoryRouter;
