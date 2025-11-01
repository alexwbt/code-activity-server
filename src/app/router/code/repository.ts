import logger from "#lib/common/logger";
import RequestHandlerError from "#lib/express/RequestHandlerError";
import useRequestHandler from "#lib/express/useRequestHandler";
import express from "express";
import { existsSync } from "fs";
import git from "git-client";
import Joi from "joi";
import path from "path";

const codeRepositoryRouter = express.Router();

useRequestHandler({
  router: codeRepositoryRouter,
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
    const dest = `repositories/${name}`;

    if (existsSync(dest))
      throw new RequestHandlerError(400, "duplicate repository name");

    logger.info(`Cloning repo ${name} (${body.url}) into ${dest}`);
    await git("clone", body.url, dest);

    return {
      status: 200,
      body: {
        name,
      },
    };
  },
});

export default codeRepositoryRouter;
