import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createFileTestDb, seedBaseData } from "~/test/setup";
import { createAuthenticatedRequest } from "~/test/helpers";

let fileDb: ReturnType<typeof createFileTestDb>;
let base: ReturnType<typeof seedBaseData>;

vi.mock("~/db", () => ({
  get db() {
    return fileDb.db;
  },
}));

import { action } from "./api.course-review";
import { enrollUser } from "~/services/enrollmentService";

const URL = "http://localhost/api/course-review";

function callAction(request: Request) {
  return action({ request, params: {}, context: {} } as any);
}

async function postReview(userId: number, body: unknown) {
  const request = await createAuthenticatedRequest(userId, URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return callAction(request);
}

function getStatus(response: any): number | undefined {
  return response?.init?.status;
}

describe("POST /api/course-review (file-based DB)", () => {
  beforeEach(() => {
    fileDb = createFileTestDb();
    base = seedBaseData(fileDb.db);
  });

  afterEach(() => {
    fileDb.cleanup();
  });

  it("returns 401 when not authenticated", async () => {
    const request = new Request(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseId: 1, rating: 5 }),
    });

    try {
      await callAction(request);
      expect.unreachable("Should have thrown");
    } catch (thrown: any) {
      expect(getStatus(thrown)).toBe(401);
    }
  });

  it("returns 400 for invalid JSON body", async () => {
    const request = await createAuthenticatedRequest(base.user.id, URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });

    try {
      await callAction(request);
      expect.unreachable("Should have thrown");
    } catch (thrown: any) {
      expect(getStatus(thrown)).toBe(400);
    }
  });

  it("returns 400 for invalid params (rating out of range)", async () => {
    try {
      await postReview(base.user.id, { courseId: base.course.id, rating: 6 });
      expect.unreachable("Should have thrown");
    } catch (thrown: any) {
      expect(getStatus(thrown)).toBe(400);
    }
  });

  it("returns 400 for invalid params (non-integer rating)", async () => {
    try {
      await postReview(base.user.id, { courseId: base.course.id, rating: 3.5 });
      expect.unreachable("Should have thrown");
    } catch (thrown: any) {
      expect(getStatus(thrown)).toBe(400);
    }
  });

  it("returns 422 when user is not enrolled", async () => {
    const response = await postReview(base.user.id, {
      courseId: base.course.id,
      rating: 4,
    });
    expect(getStatus(response)).toBe(422);
  });

  it("returns 422 for duplicate review", async () => {
    enrollUser(base.user.id, base.course.id, false, true);
    await postReview(base.user.id, { courseId: base.course.id, rating: 4 });

    const response = await postReview(base.user.id, {
      courseId: base.course.id,
      rating: 5,
    });
    expect(getStatus(response)).toBe(422);
  });

  it("creates a review for an enrolled user", async () => {
    enrollUser(base.user.id, base.course.id, false, true);

    const result = await postReview(base.user.id, {
      courseId: base.course.id,
      rating: 4,
    });

    expect(result).toEqual({
      success: true,
      review: expect.objectContaining({
        userId: base.user.id,
        courseId: base.course.id,
        rating: 4,
      }),
    });
  });
});
