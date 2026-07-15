import type { NextFunction, Request, Response } from "express";
import { ZodError, type ZodTypeAny, type infer as ZInfer } from "zod";
import { badRequest } from "../utils/http.ts";

type Source = "body" | "query" | "params";

/** Validate a request segment against a Zod schema, replacing it with the parsed value. */
export const validate =
  <S extends ZodTypeAny>(schema: S, source: Source = "body") =>
  (req: Request, _res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse(req[source]) as ZInfer<S>;
      // query/params are read-only getters on some setups; assign defensively.
      (req as unknown as Record<Source, unknown>)[source] = parsed;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return next(
          badRequest(
            "Validation failed",
            err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
          ),
        );
      }
      next(err);
    }
  };
