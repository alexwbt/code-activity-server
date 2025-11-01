import { ENV } from "#lib/common/env";
import logger from "#lib/common/logger";
import bodyParser from "body-parser";
import express from "express";
import notfoundRouter from "./router/notfound";
import repositoryRouter from "./router/repository";

const app = express();
app.use(bodyParser.json());

const rootRouter = express.Router();
rootRouter.use("/repository", repositoryRouter);
rootRouter.use(notfoundRouter);

type AppOption = {
  port: number;
  contextPath: string;
};

export default (options: AppOption) => {
  app.use(options.contextPath, rootRouter);
  app.listen(options.port, () => {
    logger.info(`Running Server. (PORT: ${options.port}, `
      + `CONTEXT_PATH: ${options.contextPath}, `
      + `LOG_LEVEL: ${logger.level}, `
      + `ENV: ${ENV})`);
  });
};
