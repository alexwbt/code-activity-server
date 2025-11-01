import useRequestHandler from "#lib/express/useRequestHandler";
import express from "express";

const codeActivityRouter = express.Router();

useRequestHandler({
  router: codeActivityRouter,
  method: "get",
  path: "/",
  requestHandler: async () => {
    return {
      status: 200,
      body: "hello world",
    };
  },
});

export default codeActivityRouter;
