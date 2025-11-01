import logger from "#lib/common/logger";
import useRequestHandler from "#lib/express/useRequestHandler";
import { randomUUID } from "crypto";
import express from "express";
import git from "git-client";
import Joi from "joi";
import path from "path";

const codeRepositoryRouter = express.Router();

useRequestHandler({
  router: codeRepositoryRouter,
  method: "post",
  bodySchema: Joi.object<{
    url: string;
  }>({
    url: Joi.string().required(),
  }).required(),
  requestHandler: async ({ body }) => {
    const id = randomUUID().replaceAll("-", "");
    const name = path.parse(body.url).name;
    const dest = `repository/${id}/${name}`;

    logger.info(`Cloning repo ${name} (${body.url}) into ${dest}`);
    await git("clone", body.url, dest);

    return {
      status: 200,
      body: {
        id,
        name,
      },
    };
  },
});

export default codeRepositoryRouter;
