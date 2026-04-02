import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createFileTestDb, seedBaseData } from "~/test/setup";
import { createAuthenticatedRequest } from "~/test/helpers";
import * as schema from "~/db/schema";

let fileDb: ReturnType<typeof createFileTestDb>;
let base: ReturnType<typeof seedBaseData>;

vi.mock("~/db", () => ({
  get db() {
    return fileDb.db;
  },
}));

import { loader } from "./courses";
import { enrollUser } from "~/services/enrollmentService";
import { createReview } from "~/services/reviewService";

const URL = "http://localhost/courses";

function callLoader(request: Request) {
  return loader({ request, params: {}, context: {} } as any);
}

describe("GET /courses loader (file-based DB)", () => {
  beforeEach(() => {
    fileDb = createFileTestDb();
    base = seedBaseData(fileDb.db);
  });

  afterEach(() => {
    fileDb.cleanup();
  });

  it("returns courses with averageRating and ratingCount", async () => {
    const request = new Request(URL);
    const data = await callLoader(request);

    expect(data.courses).toHaveLength(1);
    expect(data.courses[0]).toMatchObject({
      id: base.course.id,
      title: "Test Course",
      averageRating: null,
      ratingCount: 0,
    });
  });

  it("ratings update after a review is created", async () => {
    enrollUser(base.user.id, base.course.id, false, true);
    createReview(base.user.id, base.course.id, 4);

    const user2 = fileDb.db
      .insert(schema.users)
      .values({ name: "User 2", email: "u2@example.com", role: schema.UserRole.Student })
      .returning()
      .get();
    enrollUser(user2.id, base.course.id, false, true);
    createReview(user2.id, base.course.id, 2);

    const request = new Request(URL);
    const data = await callLoader(request);

    expect(data.courses[0]).toMatchObject({
      averageRating: 3,
      ratingCount: 2,
    });
  });

  it("authenticated user sees course data", async () => {
    const request = await createAuthenticatedRequest(base.user.id, URL);
    const data = await callLoader(request);

    expect(data.currentUserId).toBe(base.user.id);
    expect(data.courses).toHaveLength(1);
  });
});
