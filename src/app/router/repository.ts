import { getEnvString } from "#lib/common/env";
import logger from "#lib/common/logger";
import RequestHandlerError from "#lib/express/RequestHandlerError";
import useRequestHandler from "#lib/express/useRequestHandler";
import express from "express";
import { existsSync } from "fs";
import { readdir } from "fs/promises";
import gitdiffParser from "gitdiff-parser";
import Joi from "joi";
import path from "path";
import simpleGit from "simple-git";

const repositoryRouter = express.Router();

const repositoryDirectory = getEnvString("REPOSITORY_DIRECTORY", "repositories");
const activityFileFilter = getEnvString("ACTIVITY_FILE_FILTER", "\\.(ts|tsx|js|jsx|java)$");

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
  querySchema: Joi.object<{
    author: string;
  }>({
    author: Joi.string().required(),
  }).required(),
  requestHandler: async ({ query }) => {

    const entries = await readdir(repositoryDirectory, { withFileTypes: true });
    const repositories = entries.filter(e => e.isDirectory()).map(e => e.name);

    const commits = await Promise.all(repositories.map(async repo => {
      const git = simpleGit({ baseDir: `${repositoryDirectory}/${repo}` });
      const logs = await git.log(["--all", "-10", "--perl-regexp", "--author", query.author, "--no-merges"]);
      return await Promise.all(logs.all.map(async commit => ({
        ...commit,
        repo,
        diff: await git.diff([`${commit.hash}^!`, "-w"]),
      })));
    }));

    const files = commits.flatMap(e => e)
      .filter(e => e.diff)
      .flatMap(e => gitdiffParser.parse(e.diff).map(f => ({ ...f, commit: e })))
      .filter(f => f.hunks.some(h => h.changes.some(c => c.type === "insert")))
      .filter(f => f.newPath.match(new RegExp(activityFileFilter)))
      .map(f => ({
        ...f,
        timestamp: new Date(f.commit.date).getTime(),
      }))
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 10);

    return {
      status: 200,
      body: files,
    };
  },
});

export default repositoryRouter;
