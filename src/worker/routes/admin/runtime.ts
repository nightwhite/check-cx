import { Hono } from "hono";

import { createAdminRuntimeRepository } from "../../db/repositories/admin";

export const adminRuntimeRoutes = new Hono<{ Bindings: Env }>().get(
  "/",
  async (c) => c.json(await createAdminRuntimeRepository(c.env.DB).getStatus())
);
