import { describe, it, expect } from "vitest";
import supertest from "supertest";
import { createApp, fromNodeMiddleware, toNodeListener } from "../src";

describe("node adapter listener cleanup (callNodeListener)", () => {
  it("does not leak close and error listeners on synchronous next() calls", async () => {
    const app = createApp();

    // Register 25 synchronous middleware
    for (let i = 0; i < 25; i++) {
      app.use(
        fromNodeMiddleware((_req, _res, next) => {
          next();
        }),
      );
    }

    let closeListeners = -1;
    let errorListeners = -1;

    app.use(
      fromNodeMiddleware((_req, res) => {
        closeListeners = res.listenerCount("close");
        errorListeners = res.listenerCount("error");
        res.end("ok");
      }),
    );

    const res = await supertest(toNodeListener(app)).get("/");
    expect(res.status).toBe(200);
    expect(res.text).toBe("ok");

    // All completed middleware must have cleaned up their response listeners
    expect(closeListeners).toBe(0);
    expect(errorListeners).toBe(0);
  });

  it("cleans up response listeners on asynchronous next() calls", async () => {
    const app = createApp();

    app.use(
      fromNodeMiddleware((_req, _res, next) => {
        setTimeout(() => next(), 10);
      }),
    );

    let closeListeners = -1;
    let errorListeners = -1;

    app.use(
      fromNodeMiddleware((_req, res) => {
        closeListeners = res.listenerCount("close");
        errorListeners = res.listenerCount("error");
        res.end("async ok");
      }),
    );

    const res = await supertest(toNodeListener(app)).get("/");
    expect(res.status).toBe(200);
    expect(res.text).toBe("async ok");
    expect(closeListeners).toBe(0);
    expect(errorListeners).toBe(0);
  });

  it("cleans up response listeners when middleware returns a value or promise", async () => {
    const app = createApp();

    app.use(
      fromNodeMiddleware(async (_req, res, _next) => {
        res.setHeader("x-custom", "true");
        return "returned-value";
      }),
    );

    const res = await supertest(toNodeListener(app)).get("/");
    expect(res.status).toBe(200);
    expect(res.headers["x-custom"]).toBe("true");
    expect(res.text).toBe("returned-value");
  });

  it("cleans up response listeners when middleware throws an error", async () => {
    const app = createApp();

    app.use(
      fromNodeMiddleware((_req, _res, _next) => {
        throw new Error("sync error");
      }),
    );

    const res = await supertest(toNodeListener(app)).get("/");
    expect(res.status).toBe(500);
  });

  it("cleans up response listeners when middleware passes error to next()", async () => {
    const app = createApp();

    app.use(
      fromNodeMiddleware((_req, _res, next) => {
        next(new Error("error from next"));
      }),
    );

    const res = await supertest(toNodeListener(app)).get("/");
    expect(res.status).toBe(500);
  });
});
