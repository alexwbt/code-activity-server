import { getEnvString } from "#lib/common/env";
import logger from "#lib/common/logger";
import RequestHandlerError from "#lib/express/RequestHandlerError";
import useRequestHandler from "#lib/express/useRequestHandler";
import express from "express";
import { existsSync } from "fs";
import { readdir, rm } from "fs/promises";
import gitdiffParser from "gitdiff-parser";
import Joi from "joi";
import path from "path";
import simpleGit, { SimpleGit } from "simple-git";

const repositoryRouter = express.Router();

const repositoryDirectory = getEnvString("REPOSITORY_DIRECTORY", "repositories");
const activityFileFilter = getEnvString("ACTIVITY_FILE_FILTER", "\\.(ts|tsx|js|jsx|java|cpp|hpp|txt)$");

const git = simpleGit({ maxConcurrentProcesses: 1 });
const repositoryGits: {
  [repo: string]: SimpleGit | undefined;
} = {};
const getRepositoryGit = (repo: string) => {
  if (!repositoryGits[repo])
    repositoryGits[repo] = simpleGit({
      baseDir: `${repositoryDirectory}/${repo}`,
      maxConcurrentProcesses: 1,
    });

  return repositoryGits[repo];
};

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
    git.clone(body.url, dest);

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

    await Promise.all(repositories.map(async repo => {
      const res = await getRepositoryGit(repo).fetch();

      const message = Object.values(res).some(e => typeof e === "string" ? !!e : !!e?.length)
        ? JSON.stringify(res, undefined, 4)
        : "up to date";
      logger.info(`${repositoryDirectory}/${repo}: ${message}`);
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
 * Delete repository
 */
useRequestHandler({
  router: repositoryRouter,
  method: "delete",
  path: "/:repo",

  paramsSchema: Joi.object<{
    repo: string;
  }>({
    repo: Joi.string().required(),
  }).required(),

  requestHandler: async ({ params }) => {
    const dest = `${repositoryDirectory}/${params.repo}`;

    if (!existsSync(dest))
      throw new RequestHandlerError(400, `repository "${params.repo}" does not exist`);

    await rm(dest, { recursive: true, force: true });
    logger.info(`Deleted repository: ${dest}`);

    return {
      status: 200,
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
      const git = getRepositoryGit(repo);
      const logs = await git.log(["--all", "-20", "--perl-regexp", "--author", query.author, "--no-merges"]);
      return await Promise.all(logs.all.map(async commit => ({
        ...commit,
        repo,
        diff: await git.diff([`${commit.hash}^!`, "-w"]),
      })));
    }));

    const files = commits.flatMap(e => e)
      .filter(e => e.diff)
      .flatMap(e => gitdiffParser.parse(e.diff).map(f => ({
        ...f,
        commit: ({
          ...e,
          diff: undefined,
        })
      })))
      .filter(f => f.newPath.match(new RegExp(activityFileFilter))
        && f.hunks.some(h => h.changes.some(c => c.type === "insert")))
      .map(f => ({
        ...f,
        timestamp: new Date(f.commit.date).getTime(),
      }))
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 20);

    return {
      status: 200,
      body: files,
    };
  },
});

export default repositoryRouter;
